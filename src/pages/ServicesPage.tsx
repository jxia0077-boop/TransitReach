import { useMemo, useState } from 'react';
import { BusFront, Clock, Filter, Footprints, Search, Train } from 'lucide-react';
import { BaseMap, LocationSearch, TimeBudgetSelector } from '@/features/reachability';
import { hitFromOrigin, originFromHit, isInStudyArea } from '@/features/reachability/reachabilityService';
import { ServiceDetail, ServiceFilters, ServiceList, ServiceSummary, useRealEssentialServices } from '@/features/essential-services';
import { loadEssentialServicesMetadata } from '@/shared/data/adapters/essentialServicesAdapter';
import { DEPARTURE_TIME } from '@/shared/data/adapters/routingAdapter';
import { CATEGORY_ORDER } from '@/shared/data';
import type { Journey, Origin } from '@/features/reachability/types';
import type { ServiceCategory } from '@/shared/types/service';

/**
 * Categories shown before the user chooses.
 *
 * "Food & Meals" is off by default, not removed — it is 9,013 of the 19,406 records and
 * 65% of everything drawn at a typical origin, so with it on, seven hospitals and thirty
 * pharmacies are invisible under restaurant markers. The epic defines essential services
 * as groceries, healthcare, parks and public services; restaurants are one tap away for
 * anyone who wants them.
 */
const DEFAULT_CATEGORIES: ServiceCategory[] = CATEGORY_ORDER.filter(
  category => category !== 'food',
);

export function ServicesPage({ journey }: { journey: Journey }) {
  // Origin, budget and mode come from the application, not from here. This screen used to
  // default to Pasar Seni, so a user who had chosen an outer suburb was silently shown
  // central Kuala Lumpur's services with nothing on screen to contradict it.
  const { origin, timeBudget: budget, travelMode } = journey;
  const setOrigin = journey.onOriginChange;
  const setBudget = journey.onTimeBudgetChange;
  const setTravelMode = journey.onTravelModeChange;
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<ServiceCategory>>(
    () => new Set(DEFAULT_CATEGORIES),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = useRealEssentialServices(origin?.at ?? null, budget, travelMode, DEPARTURE_TIME);
  const metadata = loadEssentialServicesMetadata();

  const categoryCounts = useMemo(() => data.services.reduce<Partial<Record<ServiceCategory, number>>>((counts, service) => {
    counts[service.category] = (counts[service.category] ?? 0) + 1;
    return counts;
  }, {}), [data.services]);
  const displayedServices = useMemo(() => data.services.filter(service =>
    selectedCategories.has(service.category) && service.name.toLowerCase().includes(search.toLowerCase().trim()),
  ), [data.services, selectedCategories, search]);
  const selectedService = data.services.find(service => service.id === selectedId) ?? null;

  const chooseOrigin = (next: Origin) => {
    setOrigin(next);
    setSelectedId(null);
  };
  const toggleCategory = (category: ServiceCategory) => {
    setSelectedCategories(previous => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  return (
    <div className="min-h-screen pt-16">
      <div className="fixed inset-0 -z-10" style={{ background: 'radial-gradient(ellipse at 15% 20%, rgba(20,184,166,0.06) 0%, transparent 50%), radial-gradient(ellipse at 85% 80%, rgba(37,99,235,0.04) 0%, transparent 50%)' }} />
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-slate-900">Essential Services</h1>
            <span className="glass-chip px-3 py-1 text-xs font-semibold text-teal-700">Epic 5 · live data</span>
          </div>
          <p className="text-slate-600">Find real services reachable from the selected origin within a travel-time budget.</p>
        </div>

        <div className="glass p-4 mb-6 space-y-4">
          <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Starting point</label>
              <LocationSearch onSelect={hit => chooseOrigin(originFromHit(hit))} selected={hitFromOrigin(origin)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Maximum travel time</label>
              <TimeBudgetSelector value={budget} onChange={setBudget} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase mr-1">Travel mode</span>
            {([
              ['multimodal', 'Walking + transit', Footprints],
              ['walking', 'Walking only', Footprints],
              ['transit', 'Public transport', Train],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTravelMode(id)} className={`chip ${travelMode === id ? 'chip-selected' : 'chip-unselected'}`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-200/70 pt-3 text-xs text-slate-500">
            {metadata.recordCount.toLocaleString()} deduplicated services from OpenStreetMap · OTP scheduled routing at Tuesday 08:00 · bus and feeder services are not loaded.
          </div>
        </div>

        {!origin && <StatusMessage text="Choose a starting point above to see the essential services reachable from it." />}
        {data.status === 'loading' && <StatusMessage text="Loading OSM services and calculating the reachable area with OTP…" />}
        {data.status === 'error' && <StatusMessage text={`Unable to calculate real coverage: ${data.error}`} error />}

        {data.status === 'ready' && (
          <div className="grid lg:grid-cols-[1fr_400px] gap-6">
            <div className="relative rounded-2xl overflow-hidden shadow-lg" style={{ aspectRatio: '10/7', minHeight: '500px' }}>
              <BaseMap
                origin={origin}
                regions={data.result?.regions ?? null}
                onMapClick={at => isInStudyArea(at) && chooseOrigin({ at, source: 'map' })}
                services={displayedServices}
                selectedServiceId={selectedId}
                onServiceSelect={service => { setSelectedId(service.id); if (service.estimatedTravelTime === undefined) void data.estimateFor(service); }}
              />
              <div className="absolute top-4 left-4 z-[500] glass-strong px-4 py-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Services in reach</div>
                <ServiceSummary total={data.services.length} />
                <div className="text-xs text-slate-500">{data.result?.areaKm2.toFixed(1)} km² · {budget} min</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="glass p-4 space-y-3">
                <div className="glass-input flex items-center gap-2 px-3 py-2.5">
                  <Search size={16} className="text-slate-400" />
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search service name…" className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-slate-400" />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500"><BusFront size={14} /> Estimated time uses OTP's scheduled route for the selected mode and departure time.</div>
              </div>
              <div className="glass p-4">
                <div className="flex items-center gap-2 mb-3"><Filter size={14} className="text-teal-600" /><span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Filter by category</span></div>
                <ServiceFilters selected={selectedCategories} onToggle={toggleCategory} counts={categoryCounts} compact />
              </div>
              {selectedService && <ServiceDetail service={selectedService} />}
              <ServiceList services={displayedServices} hoveredService={null} selectedService={selectedService} onHover={() => undefined} onSelect={service => { setSelectedId(service.id); if (service.estimatedTravelTime === undefined) void data.estimateFor(service); }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusMessage({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={`glass p-8 text-center ${error ? 'border border-rose-200' : ''}`}><Clock size={22} className={`mx-auto mb-2 ${error ? 'text-rose-500' : 'text-teal-600'}`} /><p className="text-sm text-slate-600">{text}</p></div>;
}
