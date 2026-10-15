#SecureScore: Intelligent verification System

Fraud-risk scoring and an interactive dashboard for health insurance claims,
with a local, evidence-citing assistant for policy documents.

## Structure

- `ml/`: Random Forest model training and claim feature preparation.
- `api/app.py`: Flask API, dashboard serving, prediction/analytics routes, and document endpoints.
- `api/rag.py`: document extraction, chunking, local vectorization, SQLite persistence, and evidence retrieval.
- `api/test_rag.py`: focused ingestion, retrieval-evaluation, isolation, and API tests.
- `frontend/index.html`: responsive analytics dashboard and Policy Document Assistant.
- `data/`: local datasets and runtime document library.

## Run it

Install the dependencies and run the existing model/API as before:

```text
pip install -r requirements.txt
python ml/model.py       # only if ml/health_claims_model.joblib is not present
python api/app.py
```

Open http://127.0.0.1:5000. The existing `/predict`, `/api/stats`, and other
analytics endpoints remain available.

The cleaned claims CSV (`data/processed/health_claims_clean.csv`) and trained
models are generated locally and are not committed.

## Policy Document Assistant

### Architecture and dependencies

The assistant is local and works without a hosted model or API key:

1. PDF files are extracted page-by-page with `pypdf`; TXT files support UTF-8
   and common numbered/Markdown section headings; DOCX text and heading styles
   are extracted with `python-docx`.
2. Text is divided into up-to-1,200-character passages with 200 characters of
   overlap. PDF page numbers and detected TXT/DOCX section headings are stored
   as metadata.
3. Scikit-learn's fixed-dimension `HashingVectorizer` (word unigrams/bigrams)
   creates normalized sparse vectors. They are persisted with passage text and
   metadata in SQLite under `data/rag/rag.sqlite3`; uploaded originals are in
   `data/rag/documents/`. Similarity is cosine similarity, with a configurable
   minimum score and top-k limit.
4. Answers are extractive: the assistant selects sentences from retrieved
   passages, quotes those exact sentences, and maps numbered citations to the
   returned source excerpts. It declines questions when no passage clears the
   retrieval threshold. It does not infer missing policy terms.

The local hash-vector approach was chosen to reuse the project's installed
scikit-learn stack and avoid a heavyweight model download, external document
transmission, or an API key. It is a lexical retrieval baseline, not a
transformer embedding model. The project does not configure a generative LLM.

### Configuration

All settings are optional:

- `RAG_DATA_DIR`: change the persistent document/index directory (default:
  `data/rag`).
- `RAG_TOP_K`: default maximum number of passages retrieved per query (default
  `5`, maximum `10`).
- `RAG_MIN_SCORE`: cosine-similarity cutoff in `[0, 1]` (default `0.08`).
- `RAG_SESSION_SECRET`: stable secret for signed browser-session isolation.
  If omitted, a local secret is created in the RAG data directory and reused
  across restarts. Keep the RAG data directory private.
- `SESSION_COOKIE_SECURE`: set to `1` when serving over HTTPS, so session
  cookies are sent only over secure connections.

Uploads accept PDF, TXT, and DOCX up to 20 MB. PDFs are limited to 1,000 pages;
DOCX files are limited to 50 MB after ZIP expansion. An image-only/scanned PDF
needs OCR before upload; OCR is not included. TXT files must be UTF-8 encoded.

### API

- `POST /api/documents` — multipart upload field named `file`.
- `GET /api/documents` — list the current browser session's documents.
- `GET /api/documents/<id>/status` — processing status and error, if any.
- `DELETE /api/documents/<id>` — remove the original and its indexed passages.
- `POST /api/chat` — JSON `{ "question": "...", "document_ids": ["..."] }`.
  Omit `document_ids` to search all ready documents owned by that session.
  Optional `top_k` and `min_score` parameters override the defaults.

Chat responses include `answer`, `retrieved_count`, and `sources`; each source
contains its document ID, filename, page/section, similarity score, and exact
supporting excerpt.

### Grounding, security, and limitations

Document contents are parsed as text only and are never executed or treated as
instructions. There is no LLM prompt-injection path in the default extractive
answerer. Upload filenames are sanitized, server-side names are random IDs,
uploads are size/type checked, and selected documents are checked against a
signed browser-session owner scope. The current app has no login or account
system: this provides browser-session separation for a local single-user
instance, not production multi-tenant identity or access control. Deployments
with multiple users need application authentication and HTTPS; set a private,
stable `RAG_SESSION_SECRET` and restrict access to the server and its data
directory.

Answers are document information, not official coverage decisions. The
assistant cannot reliably resolve conflicting policy language or provide a
paraphrased expert interpretation; inspect the cited source passages and
escalate conflicts to an authorized reviewer. Conversation history is held
only in the open page and is not persisted.

### Retrieval evaluation

`api/test_rag.py` includes a deterministic miniature test corpus for coverage
frequency, claim-submission deadline, exclusions, and an unsupported question.
The tests assert that each supported question retrieves its expected document
and excerpt, that a query spanning two documents returns both, and that the
unsupported question returns no citations. This validates the baseline
retrieval behavior on the included fixtures; it is not a benchmark of
production policy documents or a comparison against a reranker/LLM.

Run the focused tests from the project root:

```text
python -m unittest api.test_rag
```
