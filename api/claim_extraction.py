
import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from werkzeug.utils import secure_filename


MAX_CLAIM_FILE_BYTES = 10 * 1024 * 1024

ALLOWED_CLAIM_EXTENSIONS = {
    ".pdf", ".txt", ".docx"
}

CLAIM_FIELD_NAMES = [
    "policy_number",
    "claim_number",
    "invoice_number",
    "provider_name",
    "claim_amount",
    "admission_date",
    "discharge_date",
    "service_date",
    "invoice_date",
    "patient_age",
    "diagnosis_code",
    "procedure_code",
    "provider_type",
    "admission_type",
    "length_of_stay",
]


class ClaimExtractionError(ValueError):
    """A claim document cannot be parsed or extracted."""


def _now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_text(text):
    return (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _find_value(text, patterns):
    for pattern in patterns:
        match = re.search(
            pattern, text, flags=re.IGNORECASE | re.DOTALL
        )
        if match:
            return (
                match.group(1).strip(),
                match.group(0),
                match.start(),
                match.end(),
            )
    return None, None, None, None


def _snippet(text, start, end, extra=100):
    if start is None or end is None:
        return "unavailable"

    snippet = text[max(0, start - extra):min(len(text), end + extra)]
    snippet = re.sub(r"\s+", " ", snippet.replace("\n", " ").strip())
    return snippet[:250] or "unavailable"


def _parse_date(value):
    if not value or value == "unavailable":
        return None

    candidate = value.strip().strip(".,; ")

    formats = (
        "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y",
        "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d",
    )

    for fmt in formats:
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue

    return None


def _is_valid_extracted_value(field_name, value):
    if value is None:
        return False

    cleaned = str(value).strip()

    if not cleaned or cleaned.lower() == "unavailable":
        return False

    invalid_values = {
        "claim_number": {"form"},
        "policy_number": {"form"},
        "invoice_number": {"form"},
        "provider_name": {"claim", "policy", "invoice", "form"},
    }

    return cleaned.lower() not in invalid_values.get(field_name, set())


def _strip_trailing_label(value, label_group):
    if value is None:
        return value

    cleaned = str(value).strip()

    if not cleaned or cleaned == "unavailable":
        return cleaned

    for label in label_group:
        cleaned = re.sub(
            rf"\s*(?:{label})\s*[:#-]?\s*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )

    return cleaned.strip()


def _extract_date_role(text, patterns):
    for pattern in patterns:
        match = re.search(
            pattern, text, flags=re.IGNORECASE | re.DOTALL
        )
        if match:
            value = (
                match.group(1).strip()
                if match.lastindex
                else match.group(0).strip()
            )
            return value, match.group(0), match.start(), match.end()

    return None, None, None, None


def _text_from_pdf(path):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ClaimExtractionError(
            "PDF support requires the pypdf package."
        ) from exc

    try:
        reader = PdfReader(str(path), strict=True)

        if reader.is_encrypted:
            raise ClaimExtractionError(
                "The document is encrypted and cannot be processed "
                "without a password."
            )

        text_parts = []

        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(page_text)

        merged = "\n\n".join(text_parts)

        if not merged.strip():
            raise ClaimExtractionError("No readable text found in this PDF.")

        return merged

    except ClaimExtractionError:
        raise
    except Exception as exc:
        raise ClaimExtractionError(
            "The PDF could not be read. Check that it is valid "
            "and is not encrypted."
        ) from exc


# --------------------------------------------------
# DOCX extraction
# --------------------------------------------------

def _text_from_docx(path):
    try:
        from docx import Document
    except ImportError as exc:
        raise ClaimExtractionError(
            "DOCX support requires the python-docx package."
        ) from exc

    try:
        document = Document(str(path))
        paragraphs = []

        for paragraph in document.paragraphs:
            value = paragraph.text.strip()
            if value:
                paragraphs.append(value)

        combined = "\n".join(paragraphs)

        if not combined.strip():
            raise ClaimExtractionError(
                "No readable text could be extracted from the DOCX file."
            )

        return combined

    except ClaimExtractionError:
        raise
    except Exception as exc:
        raise ClaimExtractionError(
            "The DOCX file could not be read."
        ) from exc


# --------------------------------------------------
# TXT extraction
# --------------------------------------------------

def _text_from_txt(path):
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ClaimExtractionError(
            "TXT documents must be UTF-8 encoded."
        ) from exc
    except OSError as exc:
        raise ClaimExtractionError(
            "The TXT file could not be read."
        ) from exc

    if not text.strip():
        raise ClaimExtractionError("The selected document is empty.")

    return text


# --------------------------------------------------
def extract_claim_text(path, extension):
    extension = (extension or "").lower()

    if extension == ".txt":
        return _text_from_txt(path)

    if extension == ".pdf":
        return _text_from_pdf(path)

    if extension == ".docx":
        return _text_from_docx(path)

    raise ClaimExtractionError("Unsupported document type.")


def _build_field_template():
    return {field: "unavailable" for field in CLAIM_FIELD_NAMES}


# --------------------------------------------------
# Claim field extraction
# --------------------------------------------------

def extract_claim_fields(text):
    normalized = _normalize_text(text)

    if not normalized:
        raise ClaimExtractionError(
            "No readable claim text was found in the document."
        )

    extracted = _build_field_template()
    snippets = {}
    confidence = {}

    normalized = re.sub(r"\s+", " ", normalized)

    patterns = {
        "policy_number": [
            r"policy\s*(?:number|no\.?|#)?\s*[:#-]?\s*"
            r"([A-Za-z0-9][A-Za-z0-9\-]{3,})",
            r"policy\s*id\s*[:#-]?\s*"
            r"([A-Za-z0-9][A-Za-z0-9\-]{3,})",
        ],
        "claim_number": [
            r"claim\s*(?:number|no\.?|#)?\s*[:#-]?\s*"
            r"(?!form\b)([A-Za-z0-9][A-Za-z0-9\-]{3,})",
            r"claim\s*id\s*[:#-]?\s*"
            r"([A-Za-z0-9][A-Za-z0-9\-]{3,})",
        ],
        "invoice_number": [
            r"invoice\s*(?:number|no\.?|#)?\s*[:#-]?\s*"
            r"([A-Za-z0-9][A-Za-z0-9\-]{3,})",
            r"bill\s*(?:number|no\.?|#)?\s*[:#-]?\s*"
            r"([A-Za-z0-9][A-Za-z0-9\-]{3,})",
        ],
        "provider_name": [
            r"provider\s*(?:name|name\s*[:#-])\s*[:#-]?\s*"
            r"([A-Z][A-Za-z0-9&.'\- ]{3,120})",
            r"hospital\s*(?:name)?\s*[:#-]?\s*"
            r"([A-Z][A-Za-z0-9&.'\- ]{3,120})",
            r"medical\s*facility\s*[:#-]?\s*"
            r"([A-Z][A-Za-z0-9&.'\- ]{3,120})",
        ],
        "claim_amount": [
            r"claim\s*(?:amount|total|charge)\s*[:#-]?\s*"
            r"(?:\$\s*)?"
            r"(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)",
            r"total\s*(?:amount|due|charges?)\s*[:#-]?\s*"
            r"(?:\$\s*)?"
            r"(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)",
            r"amount\s*due\s*[:#-]?\s*"
            r"(?:\$\s*)?"
            r"(\d{1,3}(?:[.,]\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)",
        ],
        "patient_age": [
            r"patient\s*age\s*[:#-]?\s*(\d{1,3})",
            r"\bage\s*[:#-]?\s*(\d{1,3})",
        ],
        "diagnosis_code": [
            r"diagnosis\s*code\s*[:#-]?\s*([A-Za-z0-9.]+)",
            r"icd\s*(?:-?\d+)?\s*(?:code)?\s*[:#-]?\s*"
            r"([A-Za-z0-9.]+)",
        ],
        "procedure_code": [
            r"procedure\s*code\s*[:#-]?\s*([A-Za-z0-9.]+)",
            r"cpt\s*(?:code)?\s*[:#-]?\s*([A-Za-z0-9.]+)",
        ],
        "provider_type": [
            r"provider\s*type\s*[:#-]?\s*"
            r"([A-Za-z0-9&.'\- ]+?)"
            r"(?=\s+(?:admission|discharge|service|invoice|claim|"
            r"policy|patient|diagnosis|procedure|length|bill)\b|$)",
            r"provider\s*type\s*[:#-]?\s*"
            r"([A-Za-z0-9&.'\- ]{2,50})",
        ],
        "admission_type": [
            r"admission\s*type\s*[:#-]?\s*"
            r"([A-Za-z0-9&.'\- ]+?)"
            r"(?=\s+(?:admission|discharge|service|invoice|claim|"
            r"policy|patient|diagnosis|procedure|length|provider|bill)\b|$)",
            r"admission\s*type\s*[:#-]?\s*"
            r"([A-Za-z0-9&.'\- ]{2,50})",
        ],
        "length_of_stay": [
            r"length\s*of\s*stay\s*(?:days)?\s*[:#-]?\s*(\d+)",
            r"stay\s*(?:length|duration)\s*(?:days)?\s*[:#-]?\s*(\d+)",
        ],
    }

    field_labels = [
        r"admission date", r"discharge date", r"service date",
        r"invoice number", r"invoice date", r"claim number",
        r"policy number", r"bill number", r"claim amount",
        r"patient age", r"diagnosis code", r"procedure code",
        r"provider type", r"admission type", r"length of stay",
    ]

    for field, pattern_list in patterns.items():
        value, _, start, end = _find_value(
            normalized, pattern_list
        )

        if value:
            if field in (
                "provider_name", "provider_type", "admission_type"
            ):
                value = _strip_trailing_label(value, field_labels)

            if _is_valid_extracted_value(field, value):
                extracted[field] = value
                snippets[field] = _snippet(normalized, start, end)
                confidence[field] = "regex"

    date_patterns = {
        "admission_date": [
            r"admission\s*(?:date|on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            r"admitted\s*(?:on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        ],
        "discharge_date": [
            r"discharge\s*(?:date|on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            r"released\s*(?:on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        ],
        "service_date": [
            r"service\s*(?:date|on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            r"procedure\s*(?:date|on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        ],
        "invoice_date": [
            r"invoice\s*(?:date|on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
            r"bill\s*(?:date|on)?\s*[:#-]?\s*"
            r"(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        ],
    }

    for field, pattern_list in date_patterns.items():
        value, _, start, end = _extract_date_role(
            normalized, pattern_list
        )

        if value:
            extracted[field] = value
            snippets[field] = _snippet(normalized, start, end)
            confidence[field] = "regex"

    value = extracted.get("claim_amount")

    if value and value != "unavailable":
        numeric_value = re.sub(r"[^0-9.]", "", value)
        if numeric_value:
            try:
                extracted["claim_amount"] = (
                    f"${float(numeric_value):,.2f}"
                )
            except ValueError:
                pass

    for field in CLAIM_FIELD_NAMES:
        if extracted.get(field) in (None, ""):
            extracted[field] = "unavailable"

    return {
        "fields": extracted,
        "source_snippets": {
            key: snippets.get(key, "unavailable")
            for key in CLAIM_FIELD_NAMES
        },
        "confidence": {
            key: confidence[key]
            for key in CLAIM_FIELD_NAMES
            if key in confidence
        },
    }


# --------------------------------------------------
# Claim validation
# --------------------------------------------------

def validate_extracted_claim(payload):
    fields = (
        payload.get("fields", {})
        if isinstance(payload, dict)
        else {}
    )

    errors = []

    required_fields = [
        "policy_number",
        "claim_number",
        "provider_name",
        "claim_amount",
    ]

    missing = [
        field for field in required_fields
        if fields.get(field) in (None, "unavailable", "")
    ]

    if missing:
        errors.append(
            f"Missing required fields: {', '.join(missing)}"
        )

    admission = _parse_date(fields.get("admission_date"))
    discharge = _parse_date(fields.get("discharge_date"))

    if admission and discharge and discharge < admission:
        errors.append(
            "Discharge date is earlier than the admission date."
        )

    service_date = _parse_date(fields.get("service_date"))
    invoice_date = _parse_date(fields.get("invoice_date"))

    if service_date and invoice_date and invoice_date < service_date:
        errors.append(
            "Invoice date is earlier than the service date."
        )

    return sorted(set(errors))


# --------------------------------------------------
# Document storage
# --------------------------------------------------

class ClaimDocumentStore:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir).resolve()
        self.upload_dir = self.data_dir / "uploads"
        self.storage_file = (
            self.data_dir / "claim_documents.sqlite3"
        )
        self._open_connections = set()

        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def close(self):
        for connection in list(self._open_connections):
            try:
                connection.close()
            except Exception:
                pass

        self._open_connections.clear()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def _connect(self):
        connection = sqlite3.connect(self.storage_file)
        connection.row_factory = sqlite3.Row
        self._open_connections.add(connection)
        return connection

    def _initialize(self):
        connection = self._connect()

        try:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS claim_documents (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    stored_name TEXT NOT NULL,
                    content_type TEXT,
                    file_size INTEGER,
                    status TEXT NOT NULL,
                    error TEXT,
                    raw_extraction TEXT,
                    corrected_extraction TEXT,
                    validation_errors TEXT,
                    rag_document_id TEXT,
                    created_at TEXT NOT NULL
                )
            """)

            try:
                connection.execute(
                    "ALTER TABLE claim_documents "
                    "ADD COLUMN rag_document_id TEXT"
                )
            except sqlite3.OperationalError:
                pass

            connection.commit()

        finally:
            connection.close()
            self._open_connections.discard(connection)

    def list_documents(self, owner_id):
        connection = self._connect()

        try:
            rows = connection.execute("""
                SELECT id, filename, status, error, file_size,
                       created_at, rag_document_id,
                       corrected_extraction, validation_errors
                FROM claim_documents
                WHERE owner_id = ?
                ORDER BY created_at DESC
            """, (owner_id,)).fetchall()

            items = []

            for row in rows:
                item = dict(row)
                raw_errors = item.get("validation_errors")

                if raw_errors and isinstance(raw_errors, str):
                    try:
                        item["validation_errors"] = json.loads(
                            raw_errors
                        )
                    except (json.JSONDecodeError, TypeError):
                        item["validation_errors"] = []
                else:
                    item["validation_errors"] = raw_errors or []

                item["has_corrections"] = bool(
                    item.get("corrected_extraction")
                )
                items.append(item)

            return items

        finally:
            connection.close()
            self._open_connections.discard(connection)

    def _one_document(self, owner_id, document_id):
        connection = self._connect()

        try:
            row = connection.execute("""
                SELECT *
                FROM claim_documents
                WHERE id = ? AND owner_id = ?
            """, (document_id, owner_id)).fetchone()

            return dict(row) if row else None

        finally:
            connection.close()
            self._open_connections.discard(connection)

    def upload_document(
        self,
        owner_id,
        filename,
        content,
        content_type="application/octet-stream",
    ):
        safe_name = secure_filename(
            Path(filename or "").name
        )
        extension = Path(safe_name).suffix.lower()

        if (
            not safe_name
            or extension not in ALLOWED_CLAIM_EXTENSIONS
        ):
            raise ClaimExtractionError(
                "Unsupported document type. Upload PDF, TXT, "
                "or DOCX files."
            )

        if not content:
            raise ClaimExtractionError(
                "The selected document is empty."
            )

        if len(content) > MAX_CLAIM_FILE_BYTES:
            raise ClaimExtractionError(
                "Documents must be 10 MB or smaller."
            )

        document_id = uuid.uuid4().hex
        stored_name = f"{document_id}{extension}"
        path = self.upload_dir / stored_name

        # Save upload record first.
        connection = self._connect()

        try:
            connection.execute("""
                INSERT INTO claim_documents (
                    id, owner_id, filename, stored_name,
                    content_type, file_size, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)
            """, (
                document_id,
                owner_id,
                safe_name,
                stored_name,
                content_type,
                len(content),
                _now_iso(),
            ))
            connection.commit()

        finally:
            connection.close()
            self._open_connections.discard(connection)

        try:
            # Persist the original uploaded file.
            path.write_bytes(content)

            extraction_error = None

            text = extract_claim_text(path, extension)
            raw_extraction = extract_claim_fields(text)

            validation_errors = validate_extracted_claim(
                raw_extraction
            )

            connection = self._connect()

            try:
                connection.execute("""
                    UPDATE claim_documents
                    SET status = 'ready',
                        error = ?,
                        raw_extraction = ?,
                        corrected_extraction = NULL,
                        validation_errors = ?
                    WHERE id = ? AND owner_id = ?
                """, (
                    extraction_error,
                    json.dumps(raw_extraction),
                    json.dumps(validation_errors),
                    document_id,
                    owner_id,
                ))
                connection.commit()

            finally:
                connection.close()
                self._open_connections.discard(connection)

        except Exception as exc:
            # Remove the file only for genuine processing failures.
            path.unlink(missing_ok=True)

            message = (
                str(exc)
                if isinstance(exc, ClaimExtractionError)
                else "The document could not be processed."
            )

            connection = self._connect()

            try:
                connection.execute("""
                    UPDATE claim_documents
                    SET status = 'failed', error = ?
                    WHERE id = ? AND owner_id = ?
                """, (message, document_id, owner_id))
                connection.commit()

            finally:
                connection.close()
                self._open_connections.discard(connection)

            if isinstance(exc, ClaimExtractionError):
                raise

            raise ClaimExtractionError(message) from exc

        return self._one_document(owner_id, document_id)

    # --------------------------------------------------
    # Save manually corrected fields
    # --------------------------------------------------

    def update_document(
        self,
        owner_id,
        document_id,
        corrected_fields,
    ):
        row = self._one_document(owner_id, document_id)

        if row is None:
            raise ClaimExtractionError(
                "The claim document was not found."
            )

        raw_text = row.get("raw_extraction")

        if not raw_text:
            raw_extraction = {
                "fields": _build_field_template(),
                "source_snippets": {},
                "confidence": {},
            }
        else:
            raw_extraction = json.loads(raw_text)

        merged = raw_extraction.copy()
        merged_fields = dict(merged.get("fields", {}))

        if isinstance(corrected_fields, dict):
            for key, value in corrected_fields.items():
                if key in CLAIM_FIELD_NAMES:
                    merged_fields[key] = (
                        value if value not in (None, "")
                        else "unavailable"
                    )

        merged["fields"] = merged_fields

        original_snippets = merged.get("source_snippets", {}) or {}
        merged["source_snippets"] = {
            key: original_snippets.get(key, "unavailable")
            for key in CLAIM_FIELD_NAMES
        }

        original_confidence = merged.get("confidence", {}) or {}
        merged["confidence"] = {
            key: original_confidence[key]
            for key in original_confidence
            if key in CLAIM_FIELD_NAMES
        }

        validation_errors = validate_extracted_claim(merged)

        connection = self._connect()

        try:
            connection.execute("""
                UPDATE claim_documents
                SET corrected_extraction = ?,
                    validation_errors = ?
                WHERE id = ? AND owner_id = ?
            """, (
                json.dumps(merged),
                json.dumps(validation_errors),
                document_id,
                owner_id,
            ))
            connection.commit()

        finally:
            connection.close()
            self._open_connections.discard(connection)

        row = self._one_document(owner_id, document_id)

        if row is None:
            raise ClaimExtractionError(
                "The claim document was not found."
            )

        row["validation_errors"] = (
            json.loads(row["validation_errors"])
            if row["validation_errors"] else []
        )

        row["raw_extraction"] = (
            json.loads(row["raw_extraction"])
            if row["raw_extraction"]
            else {
                "fields": _build_field_template(),
                "source_snippets": {},
                "confidence": {},
            }
        )

        row["corrected_extraction"] = (
            json.loads(row["corrected_extraction"])
            if row["corrected_extraction"]
            else row["raw_extraction"]
        )

        return row

    # --------------------------------------------------
    # Delete document and stored file
    # --------------------------------------------------

    def delete_document(self, owner_id, document_id):
        path = self._document_path(owner_id, document_id)
        connection = self._connect()

        try:
            row = connection.execute("""
                SELECT stored_name
                FROM claim_documents
                WHERE id = ? AND owner_id = ?
            """, (document_id, owner_id)).fetchone()

            if row is None:
                return False

            connection.execute("""
                DELETE FROM claim_documents
                WHERE id = ? AND owner_id = ?
            """, (document_id, owner_id))

            connection.commit()

        finally:
            connection.close()
            self._open_connections.discard(connection)

        if path.exists():
            path.unlink(missing_ok=True)

        return True

    def _document_path(self, owner_id, document_id):
        connection = self._connect()

        try:
            row = connection.execute("""
                SELECT stored_name
                FROM claim_documents
                WHERE id = ? AND owner_id = ?
            """, (document_id, owner_id)).fetchone()

            if row is None:
                return self.upload_dir / "missing"

            return self.upload_dir / row["stored_name"]

        finally:
            connection.close()
            self._open_connections.discard(connection)
