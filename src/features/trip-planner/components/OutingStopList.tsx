import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { CATEGORY_META } from '@/shared/data';
import type { OutingStop } from '../types';

/** AC 2.1.4 — the visit lengths offered; any stop starts on the default and can be changed. */
const VISIT_OPTIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180];

function visitLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

interface OutingStopListProps {
  stops: OutingStop[];
  onMove: (id: string, offset: -1 | 1) => void;
  onRemove: (id: string) => void;
  onVisitMinutesChange: (id: string, minutes: number) => void;
}

/**
 * The stops in the order the user arranged them.
 *
 * AC 2.1.3 — the numbers match the map. The order is the user's own arrangement; the
 * planner compares it with the other possible orders when a plan is requested.
 */
export function OutingStopList({ stops, onMove, onRemove, onVisitMinutesChange }: OutingStopListProps) {
  return (
    <ol className="space-y-2">
      {stops.map((stop, index) => {
        const { id, name, category, hours } = stop.service;
        return (
          <li key={id} className="rounded-xl border border-slate-200 bg-white/80 p-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-bold text-white" aria-hidden="true">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{name}</div>
                <div className="truncate text-xs text-slate-500">
                  {CATEGORY_META[category].label} · {hours ?? 'Hours unknown'}
                </div>
              </div>
              <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${name}`} className="btn-icon shrink-0" style={{ width: 28, height: 28 }}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 pl-8">
              <label className="flex flex-1 items-center gap-2 text-xs text-slate-500">
                Time there
                <select
                  value={stop.visitMinutes}
                  onChange={event => onVisitMinutesChange(id, Number(event.target.value))}
                  aria-label={`Time at ${name}`}
                  className="glass-input rounded-lg px-2 py-1 text-xs font-semibold"
                >
                  {VISIT_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{visitLabel(minutes)}</option>)}
                </select>
              </label>
              <button type="button" disabled={index === 0} onClick={() => onMove(id, -1)} aria-label={`Move ${name} earlier`} className="btn-icon disabled:opacity-40" style={{ width: 28, height: 28 }}>
                <ArrowUp size={14} aria-hidden="true" />
              </button>
              <button type="button" disabled={index === stops.length - 1} onClick={() => onMove(id, 1)} aria-label={`Move ${name} later`} className="btn-icon disabled:opacity-40" style={{ width: 28, height: 28 }}>
                <ArrowDown size={14} aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
