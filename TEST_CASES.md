# PaperWriter — Manual Test Cases

> **App URL:** http://localhost:8000 (or production URL)
> **Test Date:** ___________  **Tester:** ___________  **Build:** ___________

---

## How to Use This Document

- Each test case has a unique ID (e.g., `AUTH-01`).
- Mark **PASS** / **FAIL** in the status column.
- For FAIL, note the actual behavior in the **Notes** column.
- Test in **Chrome**, **Firefox**, and **Edge** at minimum.

---

## 1. Authentication & Onboarding

### 1.1 Google OAuth Login Flow

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| AUTH-01 | Landing page loads | Fresh browser, not logged in | 1. Navigate to app URL | Landing page with hero, features, login card is displayed. No errors in console. | | |
| AUTH-02 | Google Sign-In button visible | Not logged in | 1. Observe login card | Google Sign-In button is rendered. No "Login temporarily unavailable" error. | | |
| AUTH-03 | Successful Google login | Valid Google account | 1. Click "Sign in with Google"<br>2. Select a Google account<br>3. Consent to OAuth scopes | Redirected to dashboard. Header shows user avatar. | | |
| AUTH-04 | DPDP consent modal appears | First login, new user | 1. Login via Google for the first time | Mandatory consent modal appears: "Welcome to PaperWriter" with privacy policy link, consent checkbox, Accept & Continue / Decline & Exit buttons. | | |
| AUTH-05 | Accept DPDP consent | Consent modal visible | 1. Check the consent checkbox<br>2. Click "Accept & Continue" | Modal closes. Dashboard is accessible. | | |
| AUTH-06 | Decline DPDP consent | Consent modal visible | 1. Click "Decline & Exit" | User is logged out. Returns to landing page. | | |
| AUTH-07 | Sample document auto-created | New user accepts consent | 1. Complete AUTH-03 → AUTH-05 | Dashboard shows "Sample Project: Introduction to PaperWriter" with 6 sections, 1 author, 1 image, 1 table, 1 reference. | | |
| AUTH-08 | Dev bypass login (debug mode) | DEBUG=True, not logged in | 1. Click "[DEV] Auto-Login" button | Logged in instantly as `dev_test_user`. Redirected to dashboard. | | |
| AUTH-09 | Dev login not shown in production | DEBUG=False | 1. Visit landing page | Dev login button is NOT visible. | | |
| AUTH-10 | Logout | Logged in | 1. Click avatar → Profile modal<br>2. Click "Sign Out" | Session cleared. Returns to landing page. Can verify by trying to access `/api/documents/` — returns 401. | | |

### 1.2 Profile & Account Management

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| AUTH-11 | Open profile modal | Logged in | 1. Click avatar in header | Profile modal shows: user name, email, DPDP checkboxes. | | |
| AUTH-12 | Toggle DPDP processing consent | Profile modal open | 1. Uncheck "I consent to storage/processing"<br>2. Re-check it | Setting is saved. On reopening modal, state persists. | | |
| AUTH-13 | Toggle DPDP communication consent | Profile modal open | 1. Check/uncheck communication consent | Setting is saved and persisted. | | |
| AUTH-14 | Erase account (Delete) | Logged in with documents | 1. Profile modal → "Erase My Data"<br>2. Confirm in confirmation dialog | Account deleted. All documents, authors, images, references, comments permanently removed. Redirected to landing. Login again yields fresh account with new sample doc. | | |

---

## 2. Dashboard

### 2.1 Document List & Creation

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| DASH-01 | Dashboard loads after login | User has documents | 1. Complete login | Dashboard shows document grid. Each card shows: title, index terms, last modified date. | | |
| DASH-02 | Create new document | Logged in, dashboard visible | 1. Click "New Paper" button | New document created with 7 default sections (Abstract, Introduction, Related Work, Methodology, Results, Conclusion, References). Redirected to editor. | | |
| DASH-03 | Document card click opens editor | Dashboard visible | 1. Click on any document card | Editor view opens with sections loaded in sidebar. | | |
| DASH-04 | Brand logo returns to dashboard | Editor open | 1. Click "PaperWriter" brand in header | Returns to dashboard. No data loss. | | |
| DASH-05 | Dashboard shows feedback form | Dashboard visible | 1. Scroll to bottom | Feedback form with Name, Email, Institution, Message fields is visible. | | |
| DASH-06 | Submit feedback | Dashboard visible | 1. Fill Name, Email, Institution, Message<br>2. Click "Submit Feedback" | "Thank you" confirmation shown. Data persisted in ContactInquiry table. | | |
| DASH-07 | Feedback validation — empty fields | Dashboard visible | 1. Click submit without filling any field | HTML5 validation prevents submission. | | |

---

## 3. Editor

### 3.1 Section Navigation & Management

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| ED-01 | Sections loaded in sidebar | Document opened | 1. Observe left sidebar | All document sections listed in order. Active section highlighted. | | |
| ED-02 | Click section to edit | Editor open | 1. Click a section title in sidebar | Editor panel shows that section's content in TipTap. Right panel shows LaTeX for that document. | | |
| ED-03 | Add new section | Editor open | 1. Click "+" or use "Create Section" prompt | Prompt modal asks for title. On confirm, new section appended at bottom. | | |
| ED-04 | Add subsection | Editor open | 1. Create a section<br>2. Create another section with parent set to first | Subsection appears nested under parent in sidebar. | | |
| ED-05 | Up to 3 levels of nesting | Editor open | 1. Create Section → Subsection → Sub-subsection | All 3 levels display correctly in sidebar with proper indentation. | | |
| ED-06 | Move section up | Multiple sections | 1. Click move up on a section (not the first) | Section order changes. Sidebar and LaTeX reflect new order. | | |
| ED-07 | Move section down | Multiple sections | 1. Click move down on a section (not the last) | Section order changes correctly. | | |
| ED-08 | Move first section up | Editor open | 1. Click move up on the first section | No change. No error. | | |
| ED-09 | Move last section down | Editor open | 1. Click move down on the last section | No change. No error. | | |
| ED-10 | Delete section | Editor open | 1. Click delete on a section (non-abstract) | Confirmation dialog appears. On confirm, section is removed. | | |
| ED-11 | Delete abstract section | Editor open | 1. Try to delete the Abstract section | Deletion should be allowed (no special protection). Verify behavior. | | |

### 3.2 TipTap Rich Text Editing

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| ED-12 | Type text in editor | Section selected | 1. Click into editor content area<br>2. Type text | Text appears. Auto-save indicator shows "Saving..." then "Autosaved". | | |
| ED-13 | Bold formatting | Editor open | 1. Select text<br>2. Click Bold button or Ctrl+B | Text renders bold in editor. LaTeX preview shows `\textbf{text}`. | | |
| ED-14 | Italic formatting | Editor open | 1. Select text<br>2. Click Italic button or Ctrl+I | Text renders italic. LaTeX shows `\textit{text}`. | | |
| ED-15 | Heading levels | Editor open | 1. Apply H3 / H4 to a line | Proper heading rendered in preview. | | |
| ED-16 | Undo / Redo | Editor open | 1. Type text<br>2. Press Ctrl+Z | Undo works. Redo with Ctrl+Y or Ctrl+Shift+Z. | | |
| ED-17 | Multiple editor instances | Editor open | 1. Click Section A, edit<br>2. Click Section B, edit<br>3. Click back to Section A | Each section maintains its own content. No cross-contamination. | | |
| ED-18 | Auto-save on content change | Editor open | 1. Type in a section<br>2. Wait 2-3 seconds | Save status shows "Autosaved". Reload page — content persists. | | |

### 3.3 Title Editing

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| ED-19 | Edit document title | Editor open | 1. Click into the title field in header<br>2. Type new title<br>3. Press Enter or blur | Title updates. Header shows new title. LaTeX preview updates. | | |
| ED-20 | Title persists after reload | Title changed | 1. Change title<br>2. Reload page | New title displayed. | | |

---

## 4. Authors Management

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| AUTHORS-01 | Open authors modal | Editor open | 1. Click "Authors" button in sidebar | Authors modal opens with split view: list (left) + form (right). | | |
| AUTHORS-02 | Add new author | Authors modal open | 1. Click "+ New"<br>2. Fill Name (required)<br>3. Fill Department, Organization, City, Country, Email<br>4. Click "Save Author" | Author appears in list with ordinal position (1st, 2nd, 3rd...). | | |
| AUTHORS-03 | Add author without name | Authors modal open | 1. Click "+ New"<br>2. Leave Name blank<br>3. Click "Save Author" | HTML5 validation or error message prevents saving. | | |
| AUTHORS-04 | Edit existing author | Author exists | 1. Click on an author in the list<br>2. Modify fields<br>3. Click "Save Author" | Changes saved. List reflects update. | | |
| AUTHORS-05 | Delete author | Author exists | 1. Click delete on an author | Confirmation dialog. On confirm, author removed. | | |
| AUTHORS-06 | Author order in LaTeX | Authors exist | 1. Add 3 authors<br>2. Export LaTeX / PDF | Title block shows "1st Name A", "2nd Name B", "3rd Name C" with proper IEEE affiliation blocks. | | |

---

## 5. Images Management

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| IMG-01 | Open images modal | Editor open | 1. Click "Figures" button in sidebar | Images modal opens with drop zone, gallery, and edit panel. | | |
| IMG-02 | Upload image via click | Images modal open | 1. Click drop zone<br>2. Select a PNG/JPG/GIF/WEBP/SVG file (<10MB) | Image appears in gallery with thumbnail. | | |
| IMG-03 | Upload image via drag-and-drop | Images modal open | 1. Drag a PNG file onto drop zone | Image uploaded and appears in gallery. | | |
| IMG-04 | Upload invalid file type | Images modal open | 1. Try to upload a .exe or .txt file | Error message: "Invalid image type". | | |
| IMG-05 | Upload oversized image | Images modal open | 1. Try to upload image >10MB | Error: "Image too large. Maximum size is 10MB". | | |
| IMG-06 | Edit image metadata | Image exists | 1. Click image in gallery<br>2. Set Caption<br>3. Set LaTeX Label (e.g. `fig:architecture`)<br>4. Set width via slider<br>5. Click "Save Changes" | Metadata saved. | | |
| IMG-07 | Assign image to section | Image selected | 1. Choose a section from "Place After Section" dropdown<br>2. Save | Image will be placed after that section in LaTeX output. | | |
| IMG-08 | Image label validation | Edit modal | 1. Enter invalid label like "123fig" or "fig with spaces" | Validation error: label must start with letter. | | |
| IMG-09 | Delete image | Image exists | 1. Click delete on an image | Confirmation. Image removed. | | |
| IMG-10 | Image appears in LaTeX | Image with label and caption | 1. Check LaTeX preview | `\begin{figure}[htbp]` environment rendered with `\includegraphics`, `\caption`, `\label`. | | |

---

## 6. References & Citations

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| REF-01 | Open references modal | Editor open | 1. Click "Citations" button | References modal opens with fetch-by-DOI / paste-BibTeX toggle. | | |
| REF-02 | Add reference via DOI | References modal open | 1. Toggle to "Fetch by DOI"<br>2. Enter valid DOI (e.g. 10.1109/CVPR.2016.90)<br>3. Click "Fetch Citation" | Citation key, description, BibTeX auto-populated. | | |
| REF-03 | Add reference via DOI — invalid DOI | References modal open | 1. Enter "not-a-doi" | Error message: "Invalid DOI format" or fetch error. | | |
| REF-04 | Add reference via paste BibTeX | References modal open | 1. Toggle to "Paste BibTeX"<br>2. Paste valid BibTeX entry<br>3. Save | Reference saved. Citation key auto-extracted. | | |
| REF-05 | Edit reference | Reference exists | 1. Click reference in list<br>2. Modify fields<br>3. Save | Changes persisted. | | |
| REF-06 | Delete reference | Reference exists | 1. Click delete on reference | Confirmation. Reference removed. | | |
| REF-07 | Insert citation in editor | References exist | 1. Select text in editor<br>2. Click floating "Reference" button<br>3. Choose "Cite" tab<br>4. Select a reference | `\cite{key}` chip inserted inline in editor. | | |
| REF-08 | Insert figure reference | Image with label exists | 1. Select text<br>2. Floating menu → "Figure" tab<br>3. Select an image | `\ref{fig:xxx}` chip inserted. | | |
| REF-09 | Insert table reference | Table with label exists | 1. Floating menu → "Table" tab<br>2. Select a table | `\ref{tab:xxx}` chip inserted. | | |
| REF-10 | Insert equation reference | Editor open | 1. Floating menu → "Eq" tab | Equation reference chip inserted. | | |
| REF-11 | Insert footnote | Editor open | 1. Floating menu → "Footnote" tab | Footnote chip inserted. | | |
| REF-12 | Floating menu positioning | Editor open | 1. Select text in various positions (top, middle, bottom of doc) | Menu appears near selection. Not clipped by viewport. | | |

---

## 7. Tables Management

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| TBL-01 | Open tables modal | Editor open | 1. Click "Tables" button | Tables modal opens with list + grid editor. | | |
| TBL-02 | Create new table | Tables modal open | 1. Click "+ New"<br>2. Enter Caption (required)<br>3. Enter LaTeX Label (required)<br>4. Select style<br>5. Enter data in grid cells<br>6. Click "Save Table" | Table saved. Appears in list. | | |
| TBL-03 | Add/remove rows in grid | Table form open | 1. Click "+ Row" / "- Row" | Row added/removed from grid. | | |
| TBL-04 | Add/remove columns in grid | Table form open | 1. Click "+ Col" / "- Col" | Column added/removed. | | |
| TBL-05 | Table styles rendering | Table saved | 1. Create tables with each style:<br>  - Standard (Grid)<br>  - Three-line (Booktabs)<br>  - No Vertical Lines<br>  - Minimal<br>2. Export PDF | Each table renders with correct LaTeX style (`\toprule`, `\midrule`, `\bottomrule` for booktabs; `\hline` for standard; minimal/no_vertical have distinct rendering). | | |
| TBL-06 | Edit table | Table exists | 1. Click table in list<br>2. Modify caption, label, style, or grid data<br>3. Save | Changes reflected. | | |
| TBL-07 | Delete table | Table exists | 1. Click delete on table | Confirmation. Table removed. | | |
| TBL-08 | Table in LaTeX export | Table exists | 1. Check LaTeX preview | `\begin{table}[htbp]` with `\caption`, `\label`, `\begin{tabular}` rendered correctly. | | |

---

## 8. Equation Helper (AI)

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| EQ-01 | Open equation helper | Editor open | 1. Click "Equations" button | Equation modal opens with 3 tabs: AI Describe, AI Scan Image, Presets. | | |
| EQ-02 | Generate equation from description | GEMINI_API_KEY configured | 1. "AI Describe" tab selected<br>2. Type: "integral of x squared from 0 to infinity"<br>3. Click "Generate LaTeX" | LaTeX output displayed: `\int_{0}^{\infty} x^2 \, dx`. KaTeX preview renders it visually. | | |
| EQ-03 | Generate equation from description — error | API key missing | 1. Type description<br>2. Click "Generate LaTeX" | Error: "GEMINI_API_KEY not configured" or "AI processing failed". | | |
| EQ-04 | Scan equation from image | Valid image file | 1. Click "AI Scan Image" tab<br>2. Upload image of equation | Image sent to Gemini. LaTeX returned and rendered in preview. | | |
| EQ-05 | Use equation preset | Equation modal open | 1. Click "Presets" tab<br>2. Click on a preset (e.g. Quadratic Formula) | Preset equation inserted into LaTeX output field and rendered. | | |
| EQ-06 | Insert equation into document | Equation generated | 1. Set optional label<br>2. Click "Insert into Document" | Equation chip (`$...$` or `$$...$$`) inserted at cursor position in editor. | | |
| EQ-07 | Equation renders in LaTeX | Equation in document | 1. Check LaTeX preview | Inline equations show `$...$`, block equations show `$$...$$`. | | |

---

## 9. AI Text Assistant

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| AI-01 | Open AI command modal | Section content exists | 1. Select text in editor<br>2. Click AI assistant button (or keyboard shortcut) | AI command modal appears with selected text shown. | | |
| AI-02 | Rewrite command | AI modal open | 1. Enter command: "rewrite this to be more formal"<br>2. Click submit | AI returns rewritten version. Modal displays result. | | |
| AI-03 | Apply AI result | AI result displayed | 1. Click "Apply" / "Replace" | Selected text in editor replaced with AI result. Section auto-saves. | | |
| AI-04 | Shorten command | AI modal open | 1. Enter command: "shorten this to half the length" | Text is shortened. | | |
| AI-05 | Expand command | AI modal open | 1. Enter command: "expand this with more detail" | Text expanded. | | |
| AI-06 | AI command with custom instruction | AI modal open | 1. Enter: "add a note about future work" | AI processes with custom instruction. | | |
| AI-07 | Large text limit | AI modal open | 1. Try to process text >50000 chars | Error: "Selected text too long". | | |
| AI-08 | Empty command | AI modal open | 1. Submit without command | Error: "Missing command or text". | | |

---

## 10. Comments

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| COM-01 | Switch to comments panel | Editor open | 1. Click "Comments" tab in right panel | Comments panel shows. Count badge updates. | | |
| COM-02 | Add comment via floating menu | Editor open | 1. Select text<br>2. Floating menu → "Comment" tab<br>3. Type comment text<br>4. Submit | Comment appears in comments panel with quoted text, author name, timestamp. | | |
| COM-03 | Add comment empty text | Editor open | 1. Try to submit blank comment | Validation prevents empty comment. | | |
| COM-04 | Resolve comment | Comment exists | 1. Click "Resolve" on a comment | Comment marked as resolved. Strikethrough or grayed out. | | |
| COM-05 | Comments persist after reload | Comment exists | 1. Add comment<br>2. Reload page | Comment still visible. | | |

---

## 11. Document Settings (Templates)

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| TEMPLATE-01 | Open document settings | Editor open | 1. Click format badge in header (e.g. "IEEE (Conference)") | Document Settings modal opens with template list (left) + settings (right). | | |
| TEMPLATE-02 | Switch template | Document settings open | 1. Click "ACM" in template list | Right panel updates to show ACM styles. Preview image changes. | | |
| TEMPLATE-03 | Switch template style | Document settings open | 1. Select IEEE template<br>2. Change style from "Conference" to "Journal" | Style selection saved. | | |
| TEMPLATE-04 | All templates switch correctly | Document settings open | 1. Test all 6 templates: IEEE, ACM, Elsevier, Springer LNCS, APA, MLA<br>2. For each, verify available styles | Each template shows its correct style options. | | |
| TEMPLATE-05 | Invalid template-style combo | Via API | 1. PATCH document with template='ieee' and template_style='sigconf' | API rejects with validation error: "sigconf is not a valid style for ieee". | | |
| TEMPLATE-06 | Edit index terms | Document settings open | 1. Modify Index Terms field<br>2. Save | Keywords appear in LaTeX `\begin{IEEEkeywords}` block. | | |
| TEMPLATE-07 | Template affects LaTeX preamble | Document settings saved | 1. Set template to ACM<br>2. View LaTeX preview | `\documentclass` matches ACM format (`acmsmall`, `sigconf`, etc.). | | |

---

## 12. Collaboration & Sharing

### 12.1 Sharing

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| SHARE-01 | Open share modal | Editor open, document owner | 1. Click "Share" button | Share modal shows: email input, role dropdown, allow-export toggle, collaborator list. | | |
| SHARE-02 | Share with existing user | Target user has account | 1. Enter collaborator's email<br>2. Select role "Editor"<br>3. Click "Add" | User added to collaborator list. Target user can now access document. | | |
| SHARE-03 | Share as Commenter | Share modal open | 1. Add user with role "Commenter" | User can view and comment but not edit content. | | |
| SHARE-04 | Share as Viewer | Share modal open | 1. Add user with role "Viewer" | User can view document only. No edit, no comment. | | |
| SHARE-05 | Share with unregistered user | Email not associated with any account | 1. Enter email of non-user<br>2. Click "Add" | Error shown: "No user found with email...". Invite recorded. If user registers later, access auto-granted. | | |
| SHARE-06 | Share with yourself | Share modal open | 1. Enter own email address | Error: "You cannot share a document with yourself". | | |
| SHARE-07 | Remove collaborator | Collaborator exists | 1. Click remove on a collaborator | Collaborator removed from list. Access revoked. | | |
| SHARE-08 | Toggle allow export | Share modal open | 1. Check/uncheck "Allow collaborators to export" | Setting saved. Export by collaborators deducts from owner's credits. | | |
| SHARE-09 | Collaborator access | Shared document exists | 1. Login as collaborator<br>2. Dashboard shows shared document | Document appears in collaborator's dashboard. | | |

### 12.2 Real-Time Presence & Locking

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| SHARE-10 | Active user indicator | 2 users on same document | 1. User A opens document<br>2. User B opens same document | Both users see each other's presence in the collab avatars group. | | |
| SHARE-11 | Section lock | User A editing | 1. User A opens a section<br>2. User B tries to edit same section | User B sees lock indicator: "Section is locked by User A". Cannot edit. | | |
| SHARE-12 | Lock auto-expires | User A locks, walks away | 1. User A locks section<br>2. Wait 20+ seconds | Lock expires. User B can now edit. | | |
| SHARE-13 | Real-time content sync | Both users on same doc | 1. User A edits Section 1<br>2. User B is on a different section | Heartbeat sync pulls User A's changes. User B's section list updates. | | |
| SHARE-14 | Heartbeat keeps presence alive | User idle | 1. User stays on document for 5 minutes | Presence remains active (heartbeat fires every ~15s). | | |

---

## 13. LaTeX Preview & PDF Export

### 13.1 LaTeX Preview

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| LATEX-01 | LaTeX preview panel loads | Document with content | 1. Open document<br>2. Observe right panel | Panel shows raw LaTeX source for the entire document. | | |
| LATEX-02 | LaTeX updates on section change | Editor open | 1. Edit a section's content<br>2. Observe LaTeX panel | LaTeX source reflects changes (after auto-save). | | |
| LATEX-03 | LaTeX includes all elements | Full document | 1. Document has: title, authors, sections, abstract, images, tables, references | LaTeX contains: `\documentclass`, `\title`, `\author`, `\maketitle`, `\begin{abstract}`, `\section{}`, `\begin{figure}`, `\begin{table}`, `\bibliography`. | | |
| LATEX-04 | PDF preview (inline) | Compiler available | 1. Click "Compile PDF" button in preview panel<br>2. OR enable "Auto-Compile" | PDF renders inside iframe in the right panel. Loading spinner shown during compilation. No credit deducted. | | |
| LATEX-05 | Word count updates | Document has content | 1. Observe preview footer | Word count and section count show correct values. | | |
| LATEX-06 | PDF preview zoom controls | PDF displayed | 1. Click Zoom In / Zoom Out buttons | PDF view zooms in/out. | | |

### 13.2 PDF Export (Download)

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| EXPORT-01 | Export PDF with credit | User has download credits | 1. Click "Export Document" → "Export PDF"<br>2. Confirm | PDF file downloads. Credit decremented by 1. | | |
| EXPORT-02 | Export PDF — no credits | User has 0 credits | 1. Try to export PDF | Error: "No downloads remaining". Buy URL provided. | | |
| EXPORT-03 | Export PDF — collaborator with allow export | Collaborator, owner allowed | 1. Collaborator exports PDF | Export succeeds. Owner's credit deducted (not collaborator's). | | |
| EXPORT-04 | Export PDF — collaborator without allow export | Collaborator, owner disallowed | 1. Collaborator tries to export | Error: "Only the document owner can export". | | |
| EXPORT-05 | Export LaTeX ZIP | Has credits | 1. Click "Export Document" → "Export LaTeX Project (ZIP)" | ZIP file downloaded containing: `.tex`, `.bib`, `.cls`, `.bst`, images. | | |
| EXPORT-06 | ZIP contains all assets | Full document | 1. Export LaTeX ZIP<br>2. Unzip and inspect | Contents: `paper_{id}.tex`, `refs.bib`, `IEEEtran.cls`, `IEEEtran.bst`, image files. | | |
| EXPORT-07 | Local compiler fallback | No local pdflatex | 1. Export PDF without LaTeX installed | Falls back to online compiler at latex.ytotech.com. PDF returned. | | |
| EXPORT-08 | Compilation error handling | Invalid LaTeX | 1. Insert problematic content (e.g. unmatched braces) | Error message: "PDF compilation failed" with log details. Credit is NOT deducted. | | |

### 13.3 Multiple Template Exports

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| EXPORT-09 | IEEE Conference export | IEEE template, conference style | 1. Export PDF | Two-column IEEE format. Proper title block, author block, abstract, keywords. | | |
| EXPORT-10 | IEEE Journal export | IEEE template, journal style | 1. Change to Journal style<br>2. Export PDF | Journal-specific formatting applied. | | |
| EXPORT-11 | ACM export | ACM template | 1. Change to ACM<br>2. Export PDF | ACM formatted output with proper `\documentclass`. | | |
| EXPORT-12 | Elsevier export | Elsevier template | 1. Change to Elsevier | Elsevier formatted output. | | |
| EXPORT-13 | Springer LNCS export | Springer LNCS template | 1. Change to Springer LNCS | Springer LNCS formatted output. | | |
| EXPORT-14 | APA export | APA template | 1. Change to APA | APA formatted output. | | |
| EXPORT-15 | MLA export | MLA template | 1. Change to MLA | MLA formatted output. | | |
| EXPORT-16 | Compile PDF preview across templates | Any template | 1. For each template, click "Compile PDF" | Each template compiles successfully with correct formatting. | | |

---

## 14. Payments & Credits

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| PAY-01 | Upgrade button visible | Logged in | 1. Observe header | "Upgrade" button visible in header. | | |
| PAY-02 | Open pricing modal | Logged in | 1. Click "Upgrade" | Pricing modal shows: current credit balance, buy option ($149 for 3 credits), redeem code input. | | |
| PAY-03 | Check credit balance | Logged in | 1. Open pricing modal | Displays remaining credits and total purchased. New user shows 1 remaining. | | |
| PAY-04 | Redirect to Razorpay | Razorpay configured | 1. Click "Buy Credits" | Redirected to Razorpay payment page. | | |
| PAY-05 | Successful payment callback | Payment completed | 1. Complete Razorpay payment | Redirected back to app with `?payment=success`. Credits incremented. | | |
| PAY-06 | Failed payment callback | Payment failed/cancelled | 1. Cancel Razorpay payment | Redirected back with `?payment=failed`. No credits added. | | |
| PAY-07 | Redeem valid code | Valid RedeemCode exists | 1. Enter valid code in redeem input<br>2. Click "Redeem" | "Credits added successfully" message. Balance increased. | | |
| PAY-08 | Redeem invalid code | No matching code | 1. Enter fake code | Error: "Invalid code". | | |
| PAY-09 | Redeem expired code | Expired RedeemCode | 1. Redeem expired code | Error: "Code expired or reached max uses". | | |
| PAY-10 | Redeem same code twice | Code already used by user | 1. Redeem same code again | Error: "Code already used by you". | | |
| PAY-11 | Credit deduction on export | Has credits | 1. Export PDF<br>2. Check balance | Credit decremented. | | |
| PAY-12 | Cannot export with 0 credits | 0 credits | 1. Try to export | Error. Buy URL returned. | | |
| PAY-13 | Preview does NOT deduct credits | Any credits | 1. Click "Compile PDF" in preview panel<br>2. Check balance | Balance unchanged. | | |

---

## 15. Contact/Support Form

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| CONTACT-01 | Dashboard feedback form submits | Logged in | 1. Fill Name, Email, Institution, Message<br>2. Click Submit | Success message shown. ContactInquiry created. | | |
| CONTACT-02 | Feedback form validation — missing fields | Logged in | 1. Leave fields empty<br>2. Click Submit | HTML5 validation / API error. | | |

---

## 16. Security & Edge Cases

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| SEC-01 | Unauthenticated API access | No session | 1. `GET /api/documents/` via curl/Postman | 401 Unauthorized. | | |
| SEC-02 | Cross-user document access | User A logged in | 1. `GET /api/documents/{user_b_doc_id}/` | 404 (not 403 — user should not discover existence). | | |
| SEC-03 | XSS via section content | Editor open | 1. Paste `<script>alert('xss')</script>` into section<br>2. Save | Script tags stripped. No alert executed. LaTeX not broken. | | |
| SEC-04 | XSS via event handlers | Editor open | 1. Paste `<img src=x onerror=alert(1)>` | onerror handler stripped. | | |
| SEC-05 | Large BibTeX limit | References modal | 1. Try to save reference with BibTeX >50000 chars | Validation error. | | |
| SEC-06 | Long section content | Editor open | 1. Paste >100KB of text into a section | Error or truncation. | | |
| SEC-07 | SSRF prevention — DOI fetch | Any user | 1. POST to `/api/references/fetch_doi` with DOI pointing to `169.254.169.254` | Request blocked. | | |
| SEC-08 | Rate limiting — auth endpoints | Any user | 1. Rapidly call `/api/auth/google/` 25+ times | 429 Too Many Requests after threshold. | | |
| SEC-09 | Rate limiting — AI endpoints | Any user | 1. Rapidly call `/api/ai/command` 25+ times | 429 after threshold. | | |
| SEC-10 | Image upload — MIME type mismatch | Any user | 1. Upload file with .png extension but containing executable content | MIME type check catches it. Rejected. | | |

---

## 17. Cross-Browser & Responsive

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| BROWSER-01 | Chrome — full workflow | Chrome browser | 1. Execute all critical path tests | No browser-specific issues. | | |
| BROWSER-02 | Firefox — full workflow | Firefox browser | 1. Execute all critical path tests | No Firefox-specific issues. | | |
| BROWSER-03 | Edge — full workflow | Edge browser | 1. Execute all critical path tests | No Edge-specific issues. | | |
| BROWSER-04 | Mobile warning overlay | Viewport <800px | 1. Resize browser to mobile width | Warning overlay appears: "Mobile Device Detected". User can dismiss. Editor is mostly functional but layout stacks vertically. | | |
| BROWSER-05 | Mobile — dismiss and use | Viewport <800px | 1. Click "I understand, proceed anyway" | Overlay dismissed. Layout adapts (sidebar full-width, editor below). | | |

---

## 18. Data Persistence & Reliability

| ID | Test Case | Precondition | Steps | Expected Result | Status | Notes |
|----|-----------|-------------|-------|-----------------|--------|-------|
| PERSIST-01 | Content persists after page reload | Multiple sections edited | 1. Edit several sections<br>2. Reload page | All section content restored. Title unchanged. | | |
| PERSIST-02 | Content persists after browser close | Document open | 1. Edit, close browser<br>2. Reopen app | Content intact. | | |
| PERSIST-03 | Create document via API | Valid auth | 1. `POST /api/documents/` | Document created with 7 default sections. | | |
| PERSIST-04 | Delete document via API | Document owner | 1. `DELETE /api/documents/{id}/` | Document + all related sections, authors, images, references, tables, comments deleted (cascade). | | |
| PERSIST-05 | Concurrent edits — last write wins | 2 users editing same section | 1. User A and User B edit Section 1 simultaneously | Heartbeat sync. Last save wins. No data corruption. | | |

---

## 19. Critical Path (Smoke Test)

Run this set for a quick release validation:

| # | Test | ID |
|---|------|----|
| 1 | Login with Google | AUTH-03 |
| 2 | Accept DPDP consent | AUTH-05 |
| 3 | Dashboard loads with sample doc | DASH-01 |
| 4 | Create new document | DASH-02 |
| 5 | Edit section content (bold, italic) | ED-12, ED-13 |
| 6 | Edit document title | ED-19 |
| 7 | Add author | AUTHORS-02 |
| 8 | Upload image | IMG-02 |
| 9 | Add reference via DOI | REF-02 |
| 10 | Insert citation in editor | REF-07 |
| 11 | Create table | TBL-02 |
| 12 | Generate AI equation | EQ-02 |
| 13 | Use AI rewrite | AI-02 |
| 14 | Add comment | COM-02 |
| 15 | Switch template | TEMPLATE-02 |
| 16 | Compile PDF preview | LATEX-04 |
| 17 | Export PDF | EXPORT-01 |
| 18 | Export LaTeX ZIP | EXPORT-05 |
| 19 | Check pricing modal | PAY-02 |
| 20 | Logout | AUTH-10 |

---

## 20. Bug Report Template

```
**Bug ID:** ___________
**Test Case ID:** ___________
**Title:** [Short description]
**Environment:** [Browser/OS]
**Steps to Reproduce:**
1. 
2. 
3. 
**Expected:** 
**Actual:** 
**Console Errors:** [Yes/No — paste if Yes]
**Screenshots:** [Attached]
**Severity:** [Critical/Major/Minor]
```

---

*End of Test Cases — 100+ manual test cases covering 19 functional areas.*
