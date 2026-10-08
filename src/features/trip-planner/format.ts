import { legTitle } from '@/features/interchange/interchangeService';
import type { ModelledJourney } from '@/features/interchange/types';
import { passTime } from '@/features/outing-pass/components/passPresentation';
import type { InfeasibleReason } from './types';

/**
 * Every clock time in the planner goes through here. Rail times are generated from
 * published frequencies and bus times from a timetable, so none of them is a departure
 * anyone has promised: "around" is part of the figure, not decoration.
 */
export function aroundTime(value: string | number): string {
  return `around ${passTime(value)}`;
}

export function durationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

/** "Walk → LRT Kelana Jaya Line → Walk", without the walking inside an interchange. */
export function journeyModes(journey: ModelledJourney): string {
  const labels: string[] = [];
  for (const leg of journey.legs) {
    if (leg.partOfInterchange) continue;
    const label = legTitle(leg);
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  return labels.join(' → ');
}

export function reasonLabel(reason: InfeasibleReason): string {
  return reason.kind === 'no-route'
    ? `No journey was found from ${reason.fromName} to ${reason.toName}.`
    : `${reason.stopName} is closed at the estimated arrival, ${aroundTime(reason.arrivalTime)}.`;
}
