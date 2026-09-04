import { BusFront, Search } from 'lucide-react';
import { ServiceDetail, ServiceFilters, ServiceList } from '@/features/essential-services';
import { loadEssentialServicesMetadata } from '@/shared/data/adapters/essentialServicesAdapter';
import type { MapServicesModel } from './useMapServices';

/**
 * Services tab of the map analysis panel.
 *
 * Epic 5's coverage results, shown against the same map and the same starting point as
 * reachability and first-mile, rather than on a separate screen with its own map and its
 * own origin.
 */
export function MapServicesContent({
  model,
  hasOrigin,
}: {
  model: MapServicesModel;
  hasOrigin: boolean;
}) {
  const metadata = loadEssentialServicesMetadata();

  if (!hasOrigin) {
    return (
      <div className="py-4 text-sm text-slate-500">
        Select a starting point to see the essential services reachable from it.
      </div>
    );
  }

  if (model.status === 'loading') {
    return (
      <div className="py-4 text-sm text-slate-600">
        Finding services within the reachable area…
      </div>
    );
  }

  if (model.status === 'error') {
    return (
      <div className="text-sm text-rose-700 bg-rose-50 rounded-xl p-3">
        Unable to calculate service coverage: {model.error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <BusFront size={17} className="text-teal-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">
            {model.reachableCount.toLocaleString()} essential services in reach
          </h3>
          {/* Provenance and scope travel with the result, as they did on the screen this
              replaced. Dropping the bus-and-feeder line would have quietly removed a
              disclosure the project relies on elsewhere. */}
          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
            From {metadata.recordCount.toLocaleString()} deduplicated OpenStreetMap records.
            Travel times use OTP's scheduled route for the selected mode and departure time.
            Bus and feeder services are not loaded.
          </p>
        </div>
      </div>

      <div className="glass-input flex items-center gap-2 px-3 py-2">
        <Search size={14} className="text-slate-400" />
        <input
          value={model.search}
          onChange={event => model.setSearch(event.target.value)}
          placeholder="Search service name…"
          className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400"
        />
      </div>

      <ServiceFilters
        selected={model.categories}
        onToggle={model.toggleCategory}
        counts={model.counts}
        compact
      />

      {/* The headline counts everything reachable; the list counts what passed the
          filters. Saying so keeps the two numbers from looking like a contradiction. */}
      {model.displayed.length < model.reachableCount && (
        <p className="text-[11px] text-slate-500 leading-snug">
          {(model.reachableCount - model.displayed.length).toLocaleString()} of these are
          hidden by the filters above.
        </p>
      )}

      {model.selected && <ServiceDetail service={model.selected} />}

      <ServiceList
        services={model.displayed}
        hoveredService={null}
        selectedService={model.selected}
        onHover={() => undefined}
        onSelect={model.select}
      />
    </div>
  );
}
