# PaperWriter — Academic Paper Authoring Platform

**PaperWriter** is a full-stack, single-page web application for authoring, formatting, and exporting IEEE-style research papers. It combines a rich WYSIWYG editing experience (TipTap), a structured relational data model, AI-assisted writing via Google Gemini, and an automated LaTeX/PDF export pipeline — all exposed through a comprehensive REST API.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vanilla SPA)                    │
│  TipTap Editor  │  LaTeX Preview  │  Image Manager  │  AI   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP REST API (JSON)
┌──────────────────────────▼──────────────────────────────────┐
│              Django REST Framework (DRF)                    │
│  ViewSets │ Serializers │ Permissions │ Custom Actions       │
└──────────────────────────┬──────────────────────────────────┘
                           │ Django ORM
┌──────────────────────────▼──────────────────────────────────┐
│                  Relational Data Models                      │
│  Document → Section (recursive FK) → PaperImage             │
│  Author │ Reference (BibTeX)                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  AI Service (Gemini 2.0 Flash)  │  LaTeX Engine (pdflatex)  │
│  Text transformation via prompt engineering                 │
│  3-pass compilation + BibTeX for PDF export                │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model & Schema Design

### Document
Root entity representing a research paper.
| Field | Type | Notes |
|-------|------|-------|
| `title` | CharField | Editable inline in UI |
| `index_terms` | TextField | IEEE keyword indexing |
| `created_at` | DateTimeField | Auto-generated |
| `updated_at` | DateTimeField | Auto-updated |

### Section
Ordered content blocks with recursive hierarchy (up to 3 levels deep).
| Field | Type | Notes |
|-------|------|-------|
| `document` | FK → Document | Parent paper |
| `parent` | FK → Section (self, null) | Enables subsections |
| `title` | CharField | Editable inline |
| `content` | TextField | HTML from TipTap editor |
| `section_type` | CharField | Enum: `abstract`, `intro`, `related_work`, `methodology`, `results`, `discussion`, `conclusion`, `references` |
| `order` | IntegerField | Display ordering |

### Author
Supports IEEE ordinal author formatting (1st, 2nd, 3rd...).
| Field | Type | Notes |
|-------|------|-------|
| `document` | FK → Document | |
| `name` | CharField | |
| `department` | CharField | |
| `organization` | CharField | |
| `city` / `country` | CharField | |
| `email` | EmailField | |
| `order` | IntegerField | IEEE ordinal position |

### PaperImage
Uploaded figures with full LaTeX metadata.
| Field | Type | Notes |
|-------|------|-------|
| `document` | FK → Document | |
| `section` | FK → Section (null) | Optional placement anchor |
| `image` | ImageField | Upload via Django |
| `caption` | TextField | LaTeX `\caption{}` |
| `label` | CharField | LaTeX `\label{}` / `\ref{}` |
| `width` | FloatField | Fraction of column width (0.1–1.0) |
| `order` | IntegerField | Figure ordering |

### Reference
BibTeX citation store.
| Field | Type | Notes |
|-------|------|-------|
| `document` | FK → Document | |
| `citation_key` | CharField | Auto-extracted from BibTeX |
| `description` | CharField | Human-readable label |
| `bibtex` | TextField | Raw BibTeX entry |
| `order` | IntegerField | Bibliography ordering |

---

## API Contract (12 Endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` / `POST` | `/api/documents/` | List / create documents |
| `GET` / `PATCH` / `DELETE` | `/api/documents/{id}/` | Retrieve / update / delete |
| `POST` | `/api/documents/{id}/add_section/` | Add a new section |
| `GET` / `POST` | `/api/sections/` | List / create sections |
| `GET` / `PATCH` / `DELETE` | `/api/sections/{id}/` | Retrieve / update / delete |
| `POST` | `/api/sections/{id}/move/` | Reorder section (up/down) |
| `GET` / `POST` | `/api/authors/` | List / create authors |
| `GET` / `PATCH` / `DELETE` | `/api/authors/{id}/` | Retrieve / update / delete |
| `GET` / `POST` | `/api/images/` | List / upload images |
| `GET` / `PATCH` / `DELETE` | `/api/images/{id}/` | Retrieve / update / delete |
| `GET` / `POST` | `/api/references/` | List / create references |
| `GET` / `PATCH` / `DELETE` | `/api/references/{id}/` | Retrieve / update / delete |
| `POST` | `/api/ai/command` | AI text transformation |
| `GET` | `/api/document/{id}/latex/` | Get raw LaTeX source |
| `GET` | `/api/document/{id}/export/pdf/` | Export compiled PDF |
| `GET` | `/api/document/{id}/export/latex/` | Export LaTeX project (ZIP) |

All endpoints registered via DRF `DefaultRouter` with full CRUD ViewSets.

---

## AI Integration Design

The AI assistant uses **Google Gemini 2.0 Flash** with a structured prompt engineering approach:

1. **Context Injection** — The prompt includes the document title, current section title, and the active section's content
2. **User Command** — One of: `rewrite`, `shorten`, `expand` with optional custom instructions
3. **Output Contract** — The model is instructed to return ONLY the modified text, no explanations or markdown formatting

This ensures the AI output can be directly inserted into the TipTap editor without post-processing.

```python
# Prompt template structure
prompt = f"""You are an academic writing assistant.
Paper: {doc_title}
Section: {section_title}
Current text: {selected_text}

User command: {command}

Return ONLY the modified text."""
```

---

## LaTeX & PDF Export Pipeline

The export system converts HTML content to IEEE-formatted LaTeX through:

1. **`generate_latex_source()`** — 172-line converter that:
   - Maps section depth to `\section{}` / `\subsection{}` / `\subsubsection{}`
   - Converts TipTap HTML to LaTeX (bold, italic, figure references, formatting)
   - Generates IEEE author blocks with ordinal numbering
   - Places figures with `\begin{figure}` + `\includegraphics` + `\caption` + `\label`
   - Appends `\bibliography` from BibTeX references

2. **PDF Compilation** — Uses `tempfile.TemporaryDirectory` + `subprocess.run`:
   - 2–3 `pdflatex` passes + `bibtex` for cross-references
   - Searches common MiKTeX/TeX Live paths automatically
   - Copies `IEEEtran.cls` and uploaded images to the temporary build directory
   - Returns compiled PDF as a downloadable response

---

## Frontend Architecture

The frontend is a **vanilla JavaScript SPA** (~1776 lines) built around:

- **TipTap Editor** — One editor instance per section with StarterKit (Bold, Italic, Heading, History)
- **3-Panel Layout** — Section sidebar (left) | Editor (center) | LaTeX preview (right)
- **Image Manager** — Upload dialog with caption/label/width controls and section mapping
- **Figure Reference Chips** — Insert `\ref{label}` as non-editable chips directly in the editor
- **AI Command Modal** — Floating UI for selecting text and invoking AI operations
- **Responsive Structure** — All state managed through DOM events and fetch-based API calls

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla JS over framework | Minimize dependencies; the app has a single user at a time |
| DRF ViewSets | Consistent CRUD patterns with minimal boilerplate |
| SQLite for dev | Zero-config; trivially swappable to PostgreSQL for production |
| Recursive Section FK | Allows arbitrary nesting depth without a separate subsection model |
| CDN-loaded TipTap | No build step required for the frontend |
| Gemini 2.0 Flash | Fast inference with sufficient quality for text transformation |

---

## Getting Started

```bash
# Backend setup
cd paperwriter/backend
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r ../requirements.txt

# Environment
# Create .env with: GEMINI_API_KEY=your_key_here

# Database
python manage.py migrate
python seed_db.py          # Optional: seed with sample 8-section paper

# Run
python manage.py runserver
```

Then open **http://localhost:8000**.

**Requirements:** Python 3.10+, pdflatex (TeX Live or MiKTeX for PDF export), internet connection (TipTap CDN + Google Fonts + Gemini API).

---

## Test Coverage

| Test | File | Scope |
|------|------|-------|
| API CRUD | `test_api.py` | Document, Section, Author, Image endpoints |
| Serializers | `test_serializers.py` | Recursive section serialization |
| LaTeX Generation | `test_latex.py` | HTML → LaTeX conversion correctness |
| PDF Export | `test_pdf.py` | Compilation pipeline |
| End-to-End | `test_e2e.py` | Full create → edit → export flow |
