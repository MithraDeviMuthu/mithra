// SecureScore API TypeScript Definitions

export interface HealthResponse {
  status: string;
  model: string;
  threshold: number;
  n_input_features: number;
  data_loaded: boolean;
  status_model_loaded: boolean;
}

export interface FieldsResponse {
  fields: string[];
  categorical: string[];
}

export interface FieldsStatusResponse {
  fields: string[];
  categorical: string[];
  classes: string[];
}

export interface ExplanationFactor {
  feature: string;
  value: string | number | null;
  impact: number;
  direction: "increases" | "decreases";
}

export interface ClaimExplanation {
  base_value: number;
  factors: ExplanationFactor[];
}

export interface PredictResult {
  fraud_probability: number;
  is_fraud: boolean;
  risk_level: "High" | "Medium" | "Low";
  explanation?: ClaimExplanation | null;
  explanation_error?: string;
}

export interface PredictResponse {
  threshold: number;
  count: number;
  results: PredictResult[];
}

export interface PredictStatusResult {
  predicted_status: "Approved" | "Rejected" | "Under Review" | string;
  probabilities: Record<string, number>;
}

export interface PredictStatusResponse {
  count: number;
  results: PredictStatusResult[];
}

export interface StatsKPIs {
  claims: number;
  fraud_claims: number;
  fraud_rate: number;
  avg_claim_amount: number;
  fraud_money_share: number;
  flagged_by_model: number;
}

export interface StatsRateRow {
  label: string;
  rate: number;
  n: number;
}

export interface StatsTestMetrics {
  n: number;
  flagged: number;
  precision: number;
  recall: number;
}

export interface StatsResponse {
  threshold: number;
  test: StatsTestMetrics;
  kpis: StatsKPIs;
  by_provider_type: StatsRateRow[];
  by_specialty: StatsRateRow[];
  by_service_type: StatsRateRow[];
  by_admission_type: StatsRateRow[];
  by_quarter: StatsRateRow[];
  by_age: StatsRateRow[];
  by_distance: StatsRateRow[];
  by_amount: StatsRateRow[];
  by_procedures: StatsRateRow[];
  date_range: [string, string];
}

export interface OptionsResponse {
  Provider_Type: string[];
  Provider_Specialty: string[];
  Service_Type: string[];
  Admission_Type: string[];
  Discharge_Type: string[];
  Patient_Gender: string[];
}

export interface SampleClaimResponse {
  claim: Record<string, string | number | boolean | null>;
  labelled_fraud: boolean;
  claim_id?: string | number;
}

export interface TopClaim {
  claim_id: number;
  provider_type: string;
  specialty: string;
  service_type: string;
  claim_amount: number;
  procedures: number;
  distance_miles: number;
  probability: number;
  risk_level: "High" | "Medium" | "Low";
  labelled_fraud: boolean;
}

export interface TopClaimsResponse {
  threshold: number;
  scope: string;
  pool: number;
  count: number;
  claims: TopClaim[];
}

export interface ProviderRiskRow {
  hospital_id: number;
  provider_type: string;
  specialty: string;
  total_claims: number;
  overall_fraud_rate: number;
  latest_period_fraud_rate: number;
  trend: "Rising" | "Falling" | "Stable" | "Not enough history";
  trend_delta: number;
  total_claim_amount: number;
  periods_observed: number;
}

export interface ProviderRiskResponse {
  count: number;
  total_providers: number;
  providers: ProviderRiskRow[];
}

export interface LossRatioOverall {
  loss_ratio: number;
  premium_collected: number;
  claims_paid: number;
  policies: number;
}

export interface LossRatioRow {
  label: string;
  loss_ratio: number;
  premium_collected: number;
  claims_paid: number;
  n: number;
}

export interface LossRatioResponse {
  overall: LossRatioOverall;
  by_policy_type: LossRatioRow[];
  by_income_bracket: LossRatioRow[];
  by_provider_type: LossRatioRow[];
  by_network: LossRatioRow[];
}

export interface MonthlyTrendPoint {
  month: string;
  claims: number;
  fraud_rate: number;
}

export interface ModelAnalyticsInfo {
  threshold: number;
  n: number;
  flagged: number;
  precision: number;
  recall: number;
  avg_risk_score: number;
  risk_levels: {
    High: number;
    Medium: number;
    Low: number;
  };
}

export interface AnalyticsResponse {
  monthly: MonthlyTrendPoint[];
  model?: ModelAnalyticsInfo;
}

export interface ClaimDocumentItem {
  id: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  file_size: number;
  created_at: string;
}

export interface ClaimDocumentsResponse {
  claim_documents: ClaimDocumentItem[];
}

export interface ClaimExtractionFields {
  policy_number?: string | number | null;
  claim_number?: string | number | null;
  invoice_number?: string | number | null;
  provider_name?: string | null;
  claim_amount?: string | number | null;
  admission_date?: string | null;
  discharge_date?: string | null;
  service_date?: string | null;
  invoice_date?: string | null;
  [key: string]: string | number | null | undefined;
}

export interface ClaimExtractionData {
  fields: ClaimExtractionFields;
  source_snippets: Record<string, string>;
  confidence: Record<string, string | number>;
}

export interface ClaimDocumentDetail {
  id: string;
  owner_id?: string;
  filename: string;
  stored_name?: string;
  content_type?: string;
  file_size: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  raw_extraction: ClaimExtractionData | null;
  corrected_extraction: ClaimExtractionData | null;
  validation_errors: string[];
  created_at: string;
}

export interface ClaimDocumentDetailResponse {
  claim_document: ClaimDocumentDetail;
}

export interface ClaimDocumentUploadResponse {
  claim_document: ClaimDocumentDetail;
}

export interface DuplicateMatchReason {
  field: string;
  details: string;
  similarity: number;
}

export interface DuplicateCandidate {
  match_type: "exact" | "near";
  score: number;
  reasons: DuplicateMatchReason[];
  reference_record: Record<string, string | number | boolean | null | undefined>;
}

export interface DuplicateClaimsResponse {
  status: "review_candidates" | "clear";
  count: number;
  thresholds: {
    exact: number;
    near: number;
  };
  candidates: DuplicateCandidate[];
}

export interface DuplicateClaimsRequest {
  claim: Record<string, unknown>;
  comparisons?: Record<string, unknown>[];
  exact_threshold?: number;
  near_threshold?: number;
}

export interface AnomalyComparison {
  median: number;
  q1: number;
  q3: number;
  iqr: number;
  upper_threshold: number;
  amount_vs_threshold: number;
}

export interface AnomalyItem {
  claim_id: string | number;
  claim_amount: number;
  severity: "High" | "Medium" | "Low";
  score: number;
  group: string;
  fallback_to_global: boolean;
  comparison: AnomalyComparison;
  reason: string;
}

export interface AnomalyDetectionResponse {
  status: "review_candidates" | "clear" | "no_data";
  count: number;
  comparison_groups: string[];
  anomalies: AnomalyItem[];
}

export interface AnomalyDetectionRequest {
  claims: Record<string, unknown>[];
  group_by?: string[];
  min_group_size?: number;
}

export interface PersonSearchResult {
  patient_id: number;
  policy_numbers: string[];
  claim_count: number;
  total_claim_amount: number;
  latest_claim_date: string | null;
  status_breakdown: Record<string, number>;
}

export interface PersonSearchResponse {
  results: PersonSearchResult[];
  count: number;
  identifier: string;
  message?: string;
}

export interface PersonClaimsResponse {
  claims: Record<string, string | number | boolean | null>[];
  count: number;
  patient_id: string;
  total_claim_amount: number;
  message?: string;
}

export interface ClaimSearchResponse {
  claim: Record<string, string | number | boolean | null> | null;
  count: number;
  claim_id: string;
  message?: string;
}

export interface ReviewClaimItem {
  claim_id: string | number;
  policy_number: string | number;
  claim_amount: number | null;
  claim_date: string | null;
  service_date: string | null;
  provider_type: string | null;
  provider_specialty: string | null;
  service_type: string | null;
  hospital_id: string | number | null;
  diagnosis_code: string | null;
  claim_status: string | null;
}

export interface ReviewClaimsResponse {
  claims: ReviewClaimItem[];
  count: number;
}
