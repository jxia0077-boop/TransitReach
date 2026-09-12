/**
 * Epic 7 — AI transit reliability domain types.
 *
 * Predictions describe expected operational reliability and are not guaranteed
 * arrival times. Keep these shapes aligned with backend/app/schemas/.
 */

export type TransitMode = 'mrt' | 'lrt' | 'brt' | 'mrl';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very_high';

export type PredictionType = 'historical' | 'live_adjusted';

export type UnavailableReason =
  | 'insufficient_historical_operational_data'
  | 'realtime_operational_history_unavailable';

export const PREDICTION_UNAVAILABLE_MESSAGE =
  'Prediction unavailable — insufficient historical operational data';

export const RAIL_PREDICTION_UNAVAILABLE_MESSAGE =
  'Prediction unavailable — realtime operational history is currently unavailable for this service';

export interface ServiceIdentity {
  mode: TransitMode;
  line_id: string;
  route_id: string;
  trip_id?: string | null;
  stop_id: string;
  stop_sequence?: number | null;
  service_date?: string | null;
}

export interface Capability {
  mode: TransitMode;
  line_id: string;
  stop_id?: string | null;
  static_available: boolean;
  historical_operational_data_available: boolean;
  realtime_available: boolean;
  model_available: boolean;
  prediction_available: boolean;
  unavailable_reason?: UnavailableReason | null;
}

export interface OperationalObservation {
  mode: TransitMode;
  line_id: string;
  route_id: string;
  trip_id?: string | null;
  stop_id: string;
  stop_sequence?: number | null;
  service_date?: string | null;
  scheduled_arrival?: string | null;
  actual_arrival?: string | null;
  scheduled_headway_min?: number | null;
  observed_headway_min?: number | null;
  previous_stop_delay_min?: number | null;
  current_delay_min?: number | null;
  headway_ratio?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  vehicle_id?: string | null;
  timestamp?: string | null;
  actual_delay_minutes?: number | null;
  match_quality_ok: boolean;
  data_quality_flags: string[];
}

export interface ReliabilityPredictQuery {
  mode: TransitMode;
  line_id: string;
  stop_id: string;
  /** ISO-8601 datetime; backend interprets in Asia/Kuala_Lumpur unless offset given. */
  datetime: string;
}

export interface TrainingPeriod {
  start: string;
  end: string;
}

export interface MethodologyInfo {
  model_type: string;
  data_sources: string[];
  training_period?: TrainingPeriod | null;
  realtime_contributed: boolean;
}

export interface ReliabilityPredictionSupported {
  supported: true;
  prediction_type: PredictionType;
  expected_delay_min: number;
  risk_level: RiskLevel;
  historical_percentile?: number | null;
  prediction_lower_min?: number | null;
  prediction_upper_min?: number | null;
  scheduled_headway_min?: number | null;
  observed_headway_min?: number | null;
  realtime_used: boolean;
  realtime_timestamp?: string | null;
  model_version: string;
  explanations: string[];
  methodology?: MethodologyInfo | null;
}

export interface ReliabilityPredictionUnsupported {
  supported: false;
  reason: UnavailableReason;
  message: string;
}

export type ReliabilityPredictionResponse =
  | ReliabilityPredictionSupported
  | ReliabilityPredictionUnsupported;

/** Selection state for the reliability query form (AC 7.1.1). */
export interface ReliabilityQuerySelection {
  mode: TransitMode | null;
  lineId: string | null;
  stopId: string | null;
  datetime: string | null;
}

/** Mirrors backend StaticTransitCatalog for AC 7.1.1 selectors. */
export interface CatalogLine {
  mode: TransitMode;
  line_id: string;
  route_id: string;
  short_name: string;
  long_name: string;
  color?: string | null;
  stop_count: number;
  min_headway_seconds?: number | null;
  max_headway_seconds?: number | null;
}

export interface CatalogStop {
  stop_id: string;
  name: string;
  lat: number;
  lon: number;
  line_ids: string[];
  platform_ids: string[];
}

export interface StaticTransitCatalog {
  feed_id: string;
  feed_name: string;
  source: string;
  lines: CatalogLine[];
  stops: CatalogStop[];
}
