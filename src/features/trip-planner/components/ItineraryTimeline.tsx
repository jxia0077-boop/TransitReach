import { ChevronRight, Flag, MapPin } from 'lucide-react';
import { passTime } from '@/features/outing-pass/components/passPresentation';
import { aroundTime, durationLabel, journeyModes } from '../format';
import type { PlannedLeg, PlannedOrder, PlannedVisit, TripPlan } from '../types';

const AVAILABILITY_TONE: Record<PlannedVisit['availability']['status'], string> = {
  Open: 'outing-badge-ready',
  Unknown: '',
  Closed: 'outing-badge-failed',
  'Closing before arrival': 'outing-badge-failed',
};

/** AC 2.3.4 — a place without reliable hours reads "Hours unknown", not open. */
function availabilityLabel(visit: PlannedVisit): string {
  if (visit.availability.status === 'Open') return 'Open on arrival';
  if (visit.availability.status === 'Unknown') return 'Hours unknown';
  return 'Closed on arrival';
}

function LegRow({ leg, onOpen, onHighlight }: {
  leg: PlannedLeg;
  onOpen: (legId: string) => void;
  onHighlight: (legId: string | null) => void;
}) {
  const { journey } = leg;
  const leaveMs = journey.startTimeMs ?? Date.parse(leg.readyTime);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(leg.id)}
        // Pointing at a journey picks its route out on the map, keyboard focus included.
        onMouseEnter={() => onHighlight(leg.id)}
        onMouseLeave={() => onHighlight(null)}
        onFocus={() => onHighlight(leg.id)}
        onBlur={() => onHighlight(null)}
        aria-label={`Journey from ${leg.from.name} to ${leg.to.name}: show details`}
        className="ml-3 flex w-[calc(100%-0.75rem)] items-center gap-2 border-l-2 border-dashed border-slate-200 py-2 pl-5 pr-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-700">{journeyModes(journey)}</span>
          <span className="block text-[11px] text-slate-500">
            Leave {aroundTime(leaveMs)} · {durationLabel(journey.totalDurationSeconds)} · {durationLabel(journey.walkTimeSeconds)} walking
          </span>
        </span>
        <ChevronRight size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
      </button>
    </li>
  );
}

interface ItineraryTimelineProps {
  plan: TripPlan;
  order: PlannedOrder;
  onOpenLeg: (legId: string) => void;
  onHighlightLeg: (legId: string | null) => void;
}

/**
 * AC 2.3.1 — the outing from the starting point, through every stop in this order, to
 * the final destination when one was given. Each journey row opens its leg detail
 * (AC 2.3.2).
 */
export function ItineraryTimeline({ plan, order, onOpenLeg, onHighlightLeg }: ItineraryTimelineProps) {
  const { request } = plan;
  const stops = new Map(request.stops.map(stop => [stop.service.id, stop]));
  const finalLeg = request.final ? order.legs[order.stopIds.length] : undefined;

  return (
    <ol aria-label="Itinerary">
      <li className="flex items-start gap-2">
        <MapPin size={18} className="mt-0.5 shrink-0 text-teal-600" aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-800">{request.origin.name}</div>
          <div className="text-[11px] text-slate-500">Ready to leave at {passTime(request.departureTime)}</div>
        </div>
      </li>

      {order.stopIds.map((id, index) => {
        const leg = order.legs[index];
        const visit = order.visits[index];
        // A missing route ends the timeline: nothing after it can be timed.
        if (!leg || !visit) return null;
        return (
          <li key={id}>
            <ol>
              <LegRow leg={leg} onOpen={onOpenLeg} onHighlight={onHighlightLeg} />
              <li className="flex items-start gap-2">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-bold text-white" aria-hidden="true">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{stops.get(id)?.service.name}</div>
                  <div className="text-[11px] text-slate-500">
                    Arrive {aroundTime(visit.arrivalTime)} · stay {durationLabel(visit.visitMinutes * 60)} · leave {aroundTime(visit.departureTime)}
                  </div>
                  <span className={`outing-badge mt-1 ${AVAILABILITY_TONE[visit.availability.status]}`}>{availabilityLabel(visit)}</span>
                  {visit.closesBeforeVisitEndsMinutes !== null && (
                    <p className="mt-1 text-[11px] text-amber-300">
                      Listed as closing about {visit.closesBeforeVisitEndsMinutes} min before this visit would end.
                    </p>
                  )}
                </div>
              </li>
            </ol>
          </li>
        );
      })}

      {finalLeg && request.final && (
        <li>
          <ol>
            <LegRow leg={finalLeg} onOpen={onOpenLeg} onHighlight={onHighlightLeg} />
            <li className="flex items-start gap-2">
              <Flag size={18} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{request.final.name}</div>
                <div className="text-[11px] text-slate-500">Arrive {aroundTime(finalLeg.arrivalTime)}</div>
              </div>
            </li>
          </ol>
        </li>
      )}
    </ol>
  );
}
