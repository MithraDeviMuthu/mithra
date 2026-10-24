# SecureScore: Intelligent Verification System

Fraud-risk scoring, claim adjudication, and portfolio analytics for health insurance claims.

The included health-claims dataset is synthetic.
API claim edits are saved to `data/processed/health_claims_live.csv`; model training continues to use the cleaned dataset.

## Architecture & Structure

- `api/app.py`: Flask API server providing fraud scoring, multi-class claim status prediction, portfolio analytics, provider risk tracking, loss ratio analysis, claim extraction, duplicate detection, and anomaly detection.
- `api/claim_extraction.py`: Automated document extraction (PDF, DOCX, TXT, images) with regex/OCR, field extraction, and adjudication rule validation.
- `api/duplicate_detection.py`: Exact and near-duplicate claim detection across multi-field similarity thresholds.
- `api/anomaly_detection.py`: Statistical IQR outlier detection identifying excessive billing charges clustered by provider/service dimensions.
- `ml/`: Random Forest model training for fraud risk scoring (held-out test ROC-AUC ~0.87) and claim status classification.
- `frontend/`: Web application built with **Vite + React 19 + TypeScript + TailwindCSS + Recharts + Tabler Icons**.
- `data/`: Local claim datasets and runtime extraction store.

---

## Getting Started

### 1. Backend Setup

Ensure Python 3.10+ is installed:

```bash
pip install -r requirements.txt
```

Train models if not already generated:

```bash
python ml/fraud_model.py         # Trains health_claims_model.joblib (ROC-AUC ~0.87)
python ml/claim_status_model.py  # Trains claim_status_model.joblib
```

Start the Flask API server:

```bash
python api/app.py
```

The API will run at `http://127.0.0.1:5000`.

### 2. Frontend Setup (frontend)

Navigate to the `frontend` directory:

```bash
cd frontend
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Open `http://localhost:5173` (or `http://127.0.0.1:5173`) in your browser.

To compile a production bundle:

```bash
npm run build
```

When built, the production bundle in `frontend/dist` is also served directly by Flask at `http://127.0.0.1:5000/`.

---

## Authentication & Navigation

The frontend includes a secure client-side portal gate at `/`:
- **Login Landing Screen**: Server-verified session authentication (`POST /api/login`) with username & password gate and encrypted session security messaging for authorized personnel (`admin` / password configured in `.env`).
- **Top Navigation Bar**: Horizontal top bar displaying "Authorized Agent" with a Sign Out button, linking to all 9 portal sections:

1. **Overview (`/overview`)**:
   - Executive KPI cards: Total Claims, Fraud Rate, Avg Claim Amount, Flagged by Model (`/api/stats`).
   - Quick action routing cards to Verify, Insights, and Patterns.
   - Top high-risk model predictions evaluated on held-out test data (`/api/top-claims`).

2. **Person claim (`/person-claim`)**:
   - Search patient records or policy numbers (`/api/person-search`).
   - Displays patient profile, cumulative claims amount, and status breakdown.
   - History table listing all claims filed by the selected patient (`/api/person-claims`).

3. **Verify (`/verify`)**:
   - Direct Claim ID lookup (`/api/claim-search`) to automatically load existing claim parameters into the scoring form.
   - "Fill Sample Claim" button using held-out real claims (`/api/sample-claim`).
   - Dynamic form built from model schema (`/fields` and `/api/options`).
   - Real-time scoring with SHAP waterfall feature attributions (`POST /predict?explain=1`).
   - Mode switcher for multi-class claim status prediction (`POST /predict-status` via `/fields-status`).

4. **Review (`/review`)**:
   - Ingested claim documents queue (`/api/claim-documents`).
   - Side-by-side adjudication inspector comparing raw parsed extraction with an editable corrections form (`/api/claim-documents/<id>/review`).
   - Inline rule validation alerts (math discrepancies, inverted admission/discharge dates).
   - "Score this claim" action opening the shared `ClaimScoreForm` prefilled with extracted claim fields.
   - Document Summary card (`POST /api/chat` "Summarize this document") and interactive "Ask about this document" Q&A with retrieved sources and conversation history.

5. **Insights (`/insights`)**:
   - Monthly claim volume and fraud rate progression line chart (`/api/analytics`).
   - Overall loss ratio performance banner (`/api/loss-ratio`).
   - Loss ratio breakdown tables by Policy Type, Income Bracket, Provider Type, and Network.
   - Provider fraud rate trend table filterable by Rising, Stable, and Falling (`/api/provider-risk`).

6. **Analytics (`/analytics`)**:
   - Held-out test set model performance card (ROC-AUC ~0.87, Precision, Recall, Flagged count, Decision threshold).
   - 9 dimensional bar chart breakdowns: Provider Type, Medical Specialty, Service Type, Admission Type, Quarterly Cohort, Patient Age Bracket, Provider-Patient Distance, Claim Amount Bracket, and Number of Procedures (`/api/stats`).

7. **Check a claim (`/check-claim`)**:
   - Tabs:
     - **Existing claim**: Query claims by unique ID (`/api/claim-search`), showing model fraud probability and risk level next to the stored label, with an operational adjudication queue browser (`/api/review-claims`).
     - **New claim**: Full-featured claim scoring form (`ClaimScoreForm`) accepting all dataset fields, scoring real-time via `predictClaim` and `predictStatus` with SHAP factor explanations and an instant 3-4 sentence client-side Claim Summary card without saving records to the database.

8. **Patterns (`/patterns`)**:
   - Combined detection suite with sub-navigation tabs:
     - **Duplicate Detection**: Multi-record comparison matching across exact/near sensitivity sliders (`POST /api/duplicate-claims`).
     - **Billing Outlier Anomalies**: Statistical IQR outlier detection clustered by Provider Type, Service Type, Admission Type, or Hospital ID (`POST /api/anomaly-detection`).

9. **Claim extraction (`/claim-extraction`)**:
   - File upload dropzone accepting PDF, DOCX, TXT, PNG, and JPG invoices/bills (`POST /api/claim-documents`).
   - Ingestion feed showing upload timestamps, file sizes, and parsing status.
   - Extracted billing entities inspector displaying raw values, source snippets, and regex confidence metrics.
