// Imported by path, not through the feature's index: the index also exports map components,
// which need a browser and would keep this module from running under Node in the tests.
import { inspectJourneys } from '@/features/interchange/journeyInspectionService';
import type { ModelledJourney } from '@/features/interchange/types';
import { TransitJourneyUnavailableError } from '@/shared/services/transitRoutingClient';
import {
  EXACT_ORDER_LIMIT,
  MAX_STOPS,
  MIN_STOPS,
  type TripPlan,
  type TripPlanProgress,
  type TripPlanRequest,
  type TripPoint,
} from './types';
import {
  compareChains,
  evaluateChain,
  orderId,
  permutations,
  selectForExact,
  stopPoint,
  toPlannedOrder,
  type LegProvider,
} from './visitOrder';

/**
 * The hosted engine has two cores and has stalled under bursts before, so the planner
 * never has more than this many journeys in flight.
 */
const MAX_CONCURRENT = 2;

function limiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

function arrivalMs(journey: ModelledJourney, readyMs: number): number {
  return journey.endTimeMs ?? readyMs + journey.totalDurationSeconds * 1000;
}

/**
 * The journey that gets there first. The engine's shortest ride is not always that: a
 * quicker service that leaves in forty minutes arrives after a slower one that leaves now,
 * and it is the arrival that decides when the next leg can start.
 */
function earliestArrival(journeys: ModelledJourney[], readyMs: number): ModelledJourney | null {
  return journeys.reduce<ModelledJourney | null>((best, journey) =>
    !best ||
    arrivalMs(journey, readyMs) < arrivalMs(best, readyMs) ||
    (arrivalMs(journey, readyMs) === arrivalMs(best, readyMs) &&
      journey.totalDurationSeconds < best.totalDurationSeconds)
      ? journey
      : best, null);
}

/**
 * Compares visit orders for an outing and returns the calculated ones.
 *
 * Calculating every order exactly costs one journey per leg per order — 720 for five stops
 * with a final destination. Instead each pair of points is routed once at the departure
 * time, every order is ranked from those estimates, and only the best few (and the user's
 * own arrangement) are calculated with each leg at its real departure time. The result
 * says how many orders were considered and how many were calculated.
 *
 * A request the engine could not answer rejects the whole plan with that error. Only an
 * answered request with no journey in it counts as "no route" (AC 2.2.3).
 */
export async function planTrip(
  request: TripPlanRequest,
  signal?: AbortSignal,
  onProgress?: (progress: TripPlanProgress) => void,
): Promise<TripPlan> {
  if (request.stops.length < MIN_STOPS || request.stops.length > MAX_STOPS) {
    throw new Error(`An outing needs ${MIN_STOPS} to ${MAX_STOPS} stops.`);
  }
  const departureMs = Date.parse(request.departureTime);
  if (!Number.isFinite(departureMs)) throw new Error('The departure time is invalid.');

  const limit = limiter(MAX_CONCURRENT);
  const cache = new Map<string, Promise<ModelledJourney | null>>();

  const route = async (from: TripPoint, to: TripPoint, readyMs: number): Promise<ModelledJourney | null> => {
    const time = new Date(readyMs).toISOString();
    // The per-journey budget only sets a flag this planner does not read.
    const ask = () => inspectJourneys(from, to, Number.POSITIVE_INFINITY, time, signal);
    const result = await ask().catch(error => {
      // The host drops a share of new connections; one more attempt recovers most of them.
      if (signal?.aborted || !(error instanceof TransitJourneyUnavailableError)) throw error;
      return ask();
    });
    return earliestArrival(result.journeys, readyMs);
  };

  /** The first leg of every order leaves at the same minute, so it is asked for once. */
  const journeyFor = (from: TripPoint, to: TripPoint, readyMs: number) => {
    const key = `${from.id}>${to.id}@${Math.floor(readyMs / 60_000)}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = limit(() => route(from, to, readyMs));
      cache.set(key, pending);
    }
    return pending;
  };

  const exactLeg: LegProvider<ModelledJourney> = async (from, to, readyMs) => {
    const journey = await journeyFor(from, to, readyMs);
    return journey && { arriveMs: arrivalMs(journey, readyMs), detail: journey };
  };

  const orders = permutations(request.stops);
  let toCalculate = orders;

  if (orders.length > EXACT_ORDER_LIMIT) {
    const points = request.stops.map(stopPoint);
    const pairs: Array<[TripPoint, TripPoint]> = [
      ...points.map((point): [TripPoint, TripPoint] => [request.origin, point]),
      ...points.flatMap(from => points.filter(to => to !== from).map((to): [TripPoint, TripPoint] => [from, to])),
      ...(request.final ? points.map((point): [TripPoint, TripPoint] => [point, request.final!]) : []),
    ];
    let done = 0;
    onProgress?.({ phase: 'estimating', done, total: pairs.length });
    const seconds = new Map<string, number | null>();
    await Promise.all(pairs.map(async ([from, to]) => {
      const journey = await journeyFor(from, to, departureMs);
      seconds.set(`${from.id}>${to.id}`, journey && (arrivalMs(journey, departureMs) - departureMs) / 1000);
      onProgress?.({ phase: 'estimating', done: ++done, total: pairs.length });
    }));

    const estimatedLeg: LegProvider<null> = async (from, to, readyMs) => {
      const estimate = seconds.get(`${from.id}>${to.id}`);
      return estimate == null ? null : { arriveMs: readyMs + estimate * 1000, detail: null };
    };
    const estimates = await Promise.all(orders.map(order => evaluateChain(request, order, estimatedLeg)));
    toCalculate = selectForExact(estimates, orderId(request.stops), EXACT_ORDER_LIMIT);
  }

  let done = 0;
  onProgress?.({ phase: 'calculating', done, total: toCalculate.length });
  const chains = await Promise.all(toCalculate.map(async order => {
    const chain = await evaluateChain(request, order, exactLeg);
    onProgress?.({ phase: 'calculating', done: ++done, total: toCalculate.length });
    return chain;
  }));

  return {
    request,
    orders: chains.sort(compareChains).map(chain => toPlannedOrder(chain, request)),
    ordersConsidered: orders.length,
    ordersCalculated: chains.length,
    calculatedAt: new Date().toISOString(),
  };
}
