# Data analytics
# AI-Based Insurance Policy Analytics System

Fraud-risk scoring and an interactive dashboard for health insurance claims.
Dataset: synthetic health claims (about 20,000 rows, about 25% fraudulent).

## Structure
- `ml/` : model training (`model.py`), Random Forest pipeline
- `api/` : Flask API (`app.py`) serving `/predict`, `/api/stats` and the dashboard
- `frontend/` : interactive dashboard (`index.html`)
- `data/` : raw and processed data (not stored in the repo, see below)

## Results
- Random Forest, ROC-AUC about 0.875
- Decision threshold 0.30 gives precision about 0.69, recall about 0.73, F1 about 0.71

## Run it
```
pip install -r requirements.txt
python ml/model.py     # trains the model and saves ml/health_claims_model.joblib
python api/app.py      # starts the server
```
Open http://127.0.0.1:5000

The cleaned CSV (`data/processed/health_claims_clean.csv`) and the trained
model are generated locally and are not committed.
