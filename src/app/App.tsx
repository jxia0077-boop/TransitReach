import { useState } from 'react';
import { NavBar } from './NavBar';
import { VISIBLE_NAV_ITEMS } from './nav';
import type { PageId } from './routes';
import { ToastContainer, PageTransition } from '@/shared/ui';
import { useToasts } from '@/shared/hooks';
import { LandingPage } from '@/pages/LandingPage';
import { MapPage } from '@/pages/MapPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { TimeComparisonPage } from '@/pages/future/TimeComparisonPage';
import { ScenarioPage } from '@/pages/future/ScenarioPage';
import { TypologyPage } from '@/pages/future/TypologyPage';
import { MethodologyPage } from '@/pages/MethodologyPage';
import { DEFAULT_TIME_BUDGET } from '@/features/reachability';
import { originFromHit, type SearchHit } from '@/features/reachability/reachabilityService';
import type { Origin } from '@/features/reachability/types';
import type { TravelMode } from '@/shared/data/adapters/routingAdapter';

/**
 * The journey state, held here rather than on each screen.
 *
 * The map, the services screen and the time comparison each used to own a separate origin,
 * budget and travel mode, and two of them defaulted to a station in central Kuala Lumpur.
 * Choosing a location on one screen therefore left the others describing somewhere else —
 * with no indication, so a resident of an outer suburb could read central KL's service
 * count as their own. One shared value per concept removes that class of problem: whatever
 * a screen shows, it shows for the place the user actually chose.
 *
 * Departure times stay on the comparison screen, because two of them are specific to it.
 */
function App() {
  const [activePage, setActivePage] = useState<PageId>('landing');
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [timeBudget, setTimeBudget] = useState(DEFAULT_TIME_BUDGET);
  const [travelMode, setTravelMode] = useState<TravelMode>('multimodal');
  const { toasts, addToast, removeToast } = useToasts();

  const handleNavigate = (page: PageId) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** AC 1.5.2 — a landing-page selection becomes the starting point for every screen. */
  const handleSearchSelect = (hit: SearchHit) => setOrigin(originFromHit(hit));

  const journey = {
    origin,
    onOriginChange: setOrigin,
    timeBudget,
    onTimeBudgetChange: setTimeBudget,
    travelMode,
    onTravelModeChange: setTravelMode,
  };

  return (
    <div className="min-h-screen bg-[#F7FAFC]">
      <NavBar items={VISIBLE_NAV_ITEMS} activePage={activePage} onNavigate={handleNavigate} />

      <PageTransition pageKey={activePage}>
        {activePage === 'landing' && (
          <LandingPage onNavigate={handleNavigate} onSearchSelect={handleSearchSelect} />
        )}
        {activePage === 'map' && <MapPage journey={journey} onToast={addToast} />}
        {activePage === 'services' && <ServicesPage journey={journey} />}
        {activePage === 'time' && <TimeComparisonPage journey={journey} />}
        {activePage === 'scenario' && <ScenarioPage />}
        {activePage === 'typology' && <TypologyPage />}
        {activePage === 'methodology' && <MethodologyPage />}
      </PageTransition>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
