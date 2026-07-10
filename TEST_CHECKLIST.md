# PaperWriter — Manual Testing Checklist

> **URL:** https://paperwriter.app
> **Date:** ___________  **Tester:** ___________  **Browser:** ___________
>
> Print this or open on a second screen. Check off each item as you test.
> Keep a notepad handy for bugs.

---

## Before You Start

- [ ] Use a **normal browser window** (incognito can block Google Sign-In)
- [ ] Open DevTools → Console tab (keep it open, watch for red errors)
- [ ] Open Network tab to observe API calls
- [ ] Have 2 different browsers or profiles ready for collaboration tests
- [ ] Confirm you're on **https://paperwriter.app**
- [ ] Check that the Gemini API key and Razorpay keys are configured in production

---

## 1. First-Time User Flow

- [ ] Landing page loads without errors
- [ ] Google Sign-In button is visible
- [ ] Sign in with a Google account
- [ ] A consent popup appears (DPDP) — check the box and accept it
- [ ] Dashboard appears with a sample document already created
- [ ] Click the sample document — editor opens with sections loaded

**Notes:** _______________________________

---

## 2. Dashboard

- [ ] "New Paper" button creates a new document and opens the editor
- [ ] Clicking a document card opens that document
- [ ] The PaperWriter brand logo returns you to the dashboard
- [ ] The feedback form at the bottom works (fill and submit)
- [ ] New document comes with 7 default sections (Abstract, Introduction, Related Work, Methodology, Results, Conclusion, References)

**Notes:** _______________________________

---

## 3. Writing & Editing

- [ ] Click a section in the left sidebar — editor loads that section's content
- [ ] Type text into the editor — auto-save indicator shows "Autosaved"
- [ ] Switch between sections — each section keeps its own content
- [ ] Edit the document title in the header bar — it saves
- [ ] Reload the page — all content is still there
- [ ] No formatting toolbar is visible (bold/italic/heading buttons should NOT appear)

**Notes:** _______________________________

---

## 4. Sections (Add / Reorder / Delete)

- [ ] Add a new section — a prompt asks for a title, then it appears in the sidebar
- [ ] Add a subsection to a section — it nests underneath
- [ ] Add a sub-subsection (3 levels deep) — nesting works
- [ ] Click the up arrow on a section — it moves up in order
- [ ] Click the down arrow on a section — it moves down in order
- [ ] Delete a section — confirmation dialog appears, then it's removed
- [ ] The Abstract and References sections can be reordered/deleted (no special protection)

**Notes:** _______________________________

---

## 5. Authors

- [ ] Open Authors modal from the sidebar
- [ ] Add an author with just a name (required field) — saves successfully
- [ ] Add an author with all fields filled (name, department, organization, city, country, email)
- [ ] Click an author in the list — their info loads in the edit form
- [ ] Edit an author's info and save — it updates
- [ ] Delete an author — confirmation shows, then they're removed
- [ ] Export PDF — author block shows "1st Name", "2nd Name" etc. with affiliation details

**Notes:** _______________________________

---

## 6. Images / Figures

- [ ] Open Figures modal from the sidebar
- [ ] Click the upload area — select a PNG or JPG file — it uploads and appears in the gallery
- [ ] Drag and drop an image onto the upload area — it uploads
- [ ] Try uploading a .txt or .exe file — error message shown
- [ ] Try uploading an image larger than 10MB — error shown
- [ ] Click an uploaded image — metadata form appears on the right
- [ ] Set a caption
- [ ] Set a LaTeX label (e.g. `fig:architecture`)
- [ ] Set the image width using the slider
- [ ] Assign the image to a specific section via dropdown
- [ ] Click "Save Changes" — metadata persists
- [ ] View LaTeX preview — `\begin{figure}[htbp]` block appears with `\includegraphics`, `\caption`, `\label`
- [ ] Delete an image — confirmation dialog, then removed

**Notes:** _______________________________

---

## 7. References / Citations

- [ ] Open Citations modal from the sidebar
- [ ] Toggle to "Fetch by DOI"
- [ ] Enter a real DOI (e.g. `10.1109/CVPR.2016.90`) — click "Fetch Citation"
- [ ] DOI auto-populates the citation key and BibTeX fields — click Save
- [ ] Try an invalid DOI — error shown
- [ ] Toggle to "Paste BibTeX"
- [ ] Paste a valid BibTeX entry — citation key auto-extracts — click Save
- [ ] Click a reference in the list — its data loads in the edit form
- [ ] Edit a reference and save — it updates
- [ ] Delete a reference — confirmation, then removed

**Floating Reference Menu:**
- [ ] Highlight text in the editor — a floating "Reference" button appears near the selection
- [ ] Click the floating button — a menu opens with tabs
- [ ] "Cite" tab — pick a reference — `\cite{key}` chip is inserted inline
- [ ] "Figure" tab (if images exist) — pick an image — `\ref{fig:xxx}` chip inserted
- [ ] "Table" tab (if tables exist) — pick a table — `\ref{tab:xxx}` chip inserted
- [ ] "Eq" tab — inserts an equation reference chip
- [ ] "Footnote" tab — type footnote text, it inserts as `\footnote{text}`
- [ ] The floating menu appears near the selection and doesn't clip off-screen

**Notes:** _______________________________

---

## 8. Tables

- [ ] Open Tables modal from the sidebar
- [ ] Click "+ New" — fill in caption and label
- [ ] Type data into the grid cells
- [ ] Click "+ Row" — a row is added
- [ ] Click "- Row" — a row is removed
- [ ] Click "+ Col" — a column is added
- [ ] Click "- Col" — a column is removed
- [ ] Change the table style and save
- [ ] Click a table in the list — its data loads for editing
- [ ] Edit and save — changes persist
- [ ] Delete a table — confirmation, then removed
- [ ] View LaTeX preview — `\begin{table}[htbp]` with `\caption`, `\label`, and `\begin{tabular}` renders correctly

**Notes:** _______________________________

---

## 9. Equations (AI)

- [ ] Open Equations modal from the sidebar
- [ ] "AI Describe" tab — type "integral of x squared from 0 to infinity" — click "Generate LaTeX"
- [ ] LaTeX code appears in the output field
- [ ] A visual KaTeX preview renders below the LaTeX
- [ ] Set an optional equation label
- [ ] Click "Insert into Document" — equation chip appears in the editor
- [ ] "AI Scan Image" tab — upload a photo of a math formula
- [ ] AI returns LaTeX from the image
- [ ] "Presets" tab — click a preset equation — it fills in
- [ ] View LaTeX preview — equations appear as `$...$` (inline) or `$$...$$` (block)
- [ ] If no Gemini key is configured, AI features show an appropriate error

**Notes:** _______________________________

---

## 10. AI Writing Assistant

- [ ] Highlight text in the editor — the AI input area becomes enabled
- [ ] Type a command like "rewrite this more formally" — hit enter or click submit
- [ ] AI returns rewritten text — click to apply — the selected text is replaced
- [ ] Try "shorten this" — works
- [ ] Try "expand this with more detail" — works
- [ ] Try submitting with no text selected — AI input is disabled with message "Select text to use AI..."

**Notes:** _______________________________

---

## 11. Comments

- [ ] Click the "Comments" tab in the right panel
- [ ] Highlight text in the editor — floating menu → "Comment" tab
- [ ] Type a comment and submit — it appears in the comments panel
- [ ] The comment shows: the quoted text, your name, and a timestamp
- [ ] Click "Resolve" on a comment — it marks as resolved
- [ ] Reload the page — comments persist

**Notes:** _______________________________

---

## 12. Document Settings / Templates

- [ ] Click the format badge in the header (e.g. "IEEE (Conference)")
- [ ] Modal opens with template list on the left, settings on the right
- [ ] Click "ACM" — the right panel updates with ACM style options
- [ ] Change the style (e.g. Conference → Journal)
- [ ] Test all 6 templates: IEEE, ACM, Elsevier, Springer LNCS, APA, MLA
- [ ] Each template shows the correct style options for it
- [ ] Edit the Index Terms / Keywords field and save
- [ ] View LaTeX — `\documentclass` and preamble match the selected template
- [ ] Export PDF for each template — all compile correctly with the right formatting

**Notes:** _______________________________

---

## 13. LaTeX Preview & PDF

- [ ] The right panel shows the raw LaTeX source code for the document
- [ ] Edit a section — LaTeX updates after auto-save
- [ ] Click "Compile PDF" in the preview panel — spinner shows, then PDF renders inline
- [ ] The inline PDF preview does NOT deduct from your download credits
- [ ] Word count and section count show in the preview footer
- [ ] Zoom in and zoom out buttons work on the PDF preview
- [ ] Auto-compile checkbox — when enabled, PDF recompiles automatically after edits

**Notes:** _______________________________

---

## 14. Exporting

- [ ] Click "Export Document" in the sidebar
- [ ] Choose "Export PDF" — file downloads
- [ ] Open the downloaded PDF — it's properly formatted (title, author block, sections, figures, tables, references)
- [ ] Choose "Export LaTeX Project (ZIP)" — ZIP file downloads
- [ ] Unzip it — verify it contains: `.tex` source, `.bib` bibliography, `.cls` class file, images
- [ ] The LaTeX project compiles locally (if you have pdflatex installed)

**Notes:** _______________________________

---

## 15. Collaboration & Sharing

> Requires two separate browser profiles or computers.

**Sharing:**
- [ ] User A (document owner) opens the Share modal
- [ ] Enter User B's email, select role "Editor", click Add
- [ ] User B logs in on a different browser — the shared document appears on their dashboard
- [ ] User B opens the document — they can view and edit sections
- [ ] Remove User B from collaborators — the document disappears from their dashboard
- [ ] Share as "Viewer" — User B can see but NOT edit
- [ ] Share as "Commenter" — User B can comment but NOT edit

**Export Permissions:**
- [ ] Check "Allow collaborators to export" — User B can export (credits deducted from User A)
- [ ] Uncheck it — User B gets an error when trying to export

**Real-Time Presence:**
- [ ] Both users have the same document open — each sees the other's avatar in the header
- [ ] User A starts editing a section — User B sees it's locked
- [ ] After User A stops editing (~20 seconds), the lock automatically releases
- [ ] Changes made by one user sync to the other user's view

**Notes:** _______________________________

---

## 16. Payments & Credits

- [ ] Click "Upgrade" in the header — pricing modal opens
- [ ] Shows your current credit balance (new users start with 1)
- [ ] Export a PDF — credit goes from 1 to 0
- [ ] Try exporting again — error: "No downloads remaining" with a link to buy more
- [ ] Click the buy link — redirects to Razorpay payment page
- [ ] Complete a payment — redirected back, credits are added to your balance

**Redeem Codes:**
- [ ] Enter a valid redeem code — "Credits added" message, balance increases
- [ ] Enter an invalid code — error: "Invalid code"
- [ ] Try to redeem the same code twice — error: "Code already used by you"

**Credit Safety:**
- [ ] Compile PDF in the preview panel (not export) — credits are NOT deducted
- [ ] Export LaTeX ZIP — credits ARE deducted

**Notes:** _______________________________

---

## 17. Security Quick Checks

- [ ] Open a private/incognito window (after clearing site data), try loading a document URL directly — should redirect to login or return 401
- [ ] Paste `<script>alert('test')</script>` into a section — save, then view the page — no alert should fire
- [ ] Log out, then try `GET /api/documents/` via browser URL bar — should return 401 or redirect to login

**Notes:** _______________________________

---

## 18. Cross-Browser

- [ ] All the above works in **Chrome**
- [ ] All the above works in **Firefox**
- [ ] All the above works in **Edge**
- [ ] Resize browser to phone width — a "Mobile Device Detected" warning overlay appears
- [ ] Click "I understand, proceed anyway" — the layout stacks vertically (usable but not ideal)

**Notes:** _______________________________

---

## 19. Profile & Account

- [ ] Click your avatar in the header — profile modal opens
- [ ] Your name and email are correct
- [ ] DPDP consent checkboxes reflect your current settings
- [ ] Toggle a consent checkbox and reopen — setting persists
- [ ] Click "Sign Out" — returns to landing page
- [ ] Click "Erase My Data" — confirm — account is deleted
- [ ] Sign in again — you get a fresh account with a new sample document

**Notes:** _______________________________

---

## 20. Final Smoke Test (5 minutes)

Run these in order, back to back:

- [ ] Login → dashboard loads with sample document
- [ ] Create a new paper → editor opens
- [ ] Type content into a section
- [ ] Add an author
- [ ] Upload an image and set a label
- [ ] Add a reference via DOI
- [ ] Insert a citation into the text via floating menu
- [ ] Create a table
- [ ] Use AI to generate an equation
- [ ] Use AI to rewrite some text
- [ ] Compile PDF preview — it renders
- [ ] Export PDF — file downloads
- [ ] Share the document with another user
- [ ] Logout

**Pass/Fail:** _______________

---

## Bug Report Skeleton

```
Title:
Steps:
  1.
  2.
  3.
Expected:
Actual:
Browser/OS:
Console errors? (Y/N):
Screenshot? (Y/N):
```
