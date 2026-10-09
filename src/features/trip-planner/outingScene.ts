import type { ModelledJourney } from '@/features/interchange/types';
import type { PlannedOrder } from './types';

/**
 * A whole visit order as one journey, for the 3D view, which draws a single journey.
 *
 * Every segment takes the id of the outing leg it belongs to, so highlighting a leg by
 * that id picks out its walk and its rides together. The summary fields are the order's
 * own totals; nothing reads them from here, and the visits between legs are not in them.
 */
export function outingAsJourney(order: PlannedOrder): ModelledJourney {
  const journeys = order.legs.map(leg => leg.journey);
  const sum = (pick: (journey: ModelledJourney) => number) =>
    journeys.reduce((total, journey) => total + pick(journey), 0);
  return {
    id: `outing:${order.id}`,
    totalDurationSeconds: sum(journey => journey.totalDurationSeconds),
    startTimeMs: journeys[0]?.startTimeMs ?? null,
    endTimeMs: journeys[journeys.length - 1]?.endTimeMs ?? null,
    walkTimeSeconds: sum(journey => journey.walkTimeSeconds),
    waitingTimeSeconds: sum(journey => journey.waitingTimeSeconds),
    transitTimeSeconds: sum(journey => journey.transitTimeSeconds),
    legs: order.legs.flatMap(planned => planned.journey.legs.map(leg => ({ ...leg, id: planned.id }))),
    interchanges: [],
    feasible: order.feasible,
    withinBudget: true,
  };
}
