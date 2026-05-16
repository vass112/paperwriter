# PaperWriter

**PaperWriter** is a web-based academic paper authoring tool designed for writing, formatting, and exporting IEEE-style research papers. It provides a rich-text editor with real-time LaTeX preview, AI-assisted writing, multi-author management, image handling with section mapping, and one-click PDF export.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend Framework** | Django 6.0 | Web framework, ORM, template rendering |
| **REST API** | Django REST Framework 3.16 | RESTful API endpoints foLr all CRUD operations |
| **Database** | SQLite 3 | Lightweight relational database (development) |
| **AI Integration** | Google Generative AI (Gemini) | AI-assisted writing (rewrite, shorten, expand text) |
| **PDF Generation** | LaTeX (pdflatex) | IEEE-format PDF export via LaTeX compilation |
| **Rich Text Editor** | TipTap (via CDN) | Section-level WYSIWYG editor with heading support |
| **Frontend** | Vanilla HTML / CSS / JavaScript | Single-page UI with modals, sidebar, and live preview |
| **Fonts** | Google Fonts (Inter) | Clean, modern typography |
| **CORS** | django-cors-headers | Cross-origin request handling |
| **Environment** | python-dotenv | `.env`-based configuration management |

---

## Project Structure

```
paperwriter/
├── .env                        # Environment variables (GEMINI_API_KEY)
├── requirements.txt            # Python dependencies
├── backend/
│   ├── manage.py               # Django management script
│   ├── db.sqlite3              # SQLite database
│   ├── seed_db.py              # Database seeder with sample paper
│   ├── venv/                   # Python virtual environment
│   ├── media/                  # Uploaded images (paper_images/)
│   │
│   ├── api/                    # Django app: models, views, serializers
│   │   ├── models.py           # Document, Section, Author, PaperImage
│   │   ├── views.py            # ViewSets, AI command, LaTeX/PDF export
│   │   ├── serializers.py      # DRF serializers
│   │   ├── urls.py             # API routing
│   │   └── admin.py            # Django admin registration
│   │
│   ├── paperwriter/            # Django project settings
│   │   ├── settings.py         # Database, static/media, installed apps
│   │   ├── urls.py             # Root URL configuration
│   │   └── wsgi.py             # WSGI application
│   │
│   ├── templates/
│   │   └── index.html          # Main SPA template
│   │
│   ├── static/
│   │   ├── css/style.css       # All application styles
│   │   └── js/app.js           # Frontend logic (editors, modals, API calls)
│   │
│   └── test_*.py               # Test suites (API, LaTeX, PDF export)
│
└── ieee_format/                # IEEE LaTeX template files
```

---

## Data Models

### Document
The root entity representing a research paper.
- `title` — Paper title (editable inline)
- `created_at` / `updated_at` — Timestamps

### Section
Ordered content blocks within a document.
- `title` — Section heading (editable inline)
- `content` — Rich HTML content (from TipTap editor)
- `section_type` — One of: `abstract`, `intro`, `related_work`, `methodology`, `results`, `discussion`, `conclusion`, `references`
- `order` — Display order

### Author
Paper authors with full affiliation details.
- `name`, `department`, `organization`, `city`, `country`, `email`
- `order` — Author ordering

### PaperImage
Images attached to the paper with LaTeX metadata.
- `image` — Uploaded file
- `section` — Optional FK to place the figure after a specific section
- `caption`, `label`, `width` — LaTeX figure properties
- `order` — Display order

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/documents/` | List / create documents |
| GET/PATCH/DELETE | `/api/documents/{id}/` | Retrieve / update / delete a document |
| GET/POST | `/api/authors/` | List / create authors |
| GET/PATCH/DELETE | `/api/authors/{id}/` | Retrieve / update / delete an author |
| GET/POST | `/api/images/` | List / upload images |
| GET/PATCH/DELETE | `/api/images/{id}/` | Retrieve / update / delete an image |
| POST | `/api/ai/command` | AI-assisted text operations |
| GET | `/api/document/{id}/latex` | Get raw LaTeX source |
| GET | `/api/document/{id}/export/pdf` | Export compiled PDF |
| GET | `/api/document/{id}/export/latex` | Export LaTeX file |

---

## Key Features

- **Inline Editing** — Document title and section headings are editable directly in the UI
- **Rich Text Editor** — TipTap-powered editors per section with Bold, Italic, H3, H4 toolbar
- **Subheadings** — H3 → `\subsection{}`, H4 → `\subsubsection{}` in LaTeX
- **Multi-Author Management** — Add/edit/delete authors with full IEEE affiliation fields
- **Image Management** — Upload images, set captions/labels/width, map to sections
- **Figure References** — Insert `\ref{label}` chips directly in the editor
- **AI Assistant** — Select text and ask AI to rewrite, shorten, or expand it
- **Live LaTeX Preview** — IEEE-formatted preview panel updated in real time
- **PDF Export** — One-click export to IEEE-formatted PDF via pdflatex

---

## Getting Started

```bash
# 1. Navigate to the backend directory
cd paperwriter/backend

# 2. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 3. Install dependencies
pip install -r ../requirements.txt

# 4. Set up environment variables
# Create .env with: GEMINI_API_KEY=your_key_here

# 5. Run migrations
python manage.py migrate

# 6. Seed sample data (optional)
python seed_db.py

# 7. Start development server
python manage.py runserver
```

Then open **http://localhost:8000** in your browser.

---

## Requirements

- Python 3.10+
- pdflatex (for PDF export — install TeX Live or MiKTeX)
- Internet connection (for TipTap CDN and Google Fonts)
