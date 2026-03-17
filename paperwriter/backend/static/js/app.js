import { Editor } from 'https://esm.sh/@tiptap/core@2.11.5';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.5';

let editors = {};
let currentDocId = null;
let saveTimeout;
let previewUpdateTimeout;

// AI State
let currentAISectionId = null;
let currentAISelection = null;
let currentAIProposal = null;

let activePreviewTab = true;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("PaperWriter Frontend Initialized");

    const aiInput = document.querySelector('.ai-input-area input');
    if (aiInput) {
        aiInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !aiInput.disabled) {
                handleAICommand(aiInput.value);
                aiInput.value = '';
            }
        });
    }

    window.closeModal = closeModal;
    window.acceptAIChange = acceptAIChange;
    window.switchTab = switchTab;
    window.closeAuthorsModal = closeAuthorsModal;
    window.editAuthor = editAuthor;
    window.deleteAuthor = deleteAuthor;

    const authorsBtn = document.getElementById('authors-btn');
    if (authorsBtn) {
        authorsBtn.onclick = () => openAuthorsModal();
    }

    const imagesBtn = document.getElementById('images-btn');
    if (imagesBtn) {
        imagesBtn.onclick = () => openImagesModal();
    }

    // Expose image functions to global scope
    window.closeImagesModal = closeImagesModal;
    window.deleteImage = deleteImage;
    window.saveImageMeta = saveImageMeta;
    window.selectImage = selectImage;
    window.insertFigureRef = insertFigureRef;

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.textContent = "Export as PDF";
        exportBtn.onclick = async () => {
            if (currentDocId) {
                try {
                    const response = await fetch(`/api/document/${currentDocId}/export/pdf`);
                    if (response.ok) {
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `paper_${currentDocId}.pdf`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                    } else {
                        const error = await response.json();
                        alert(`PDF export failed: ${error.message || error.error}\n\nPlease wait for LaTeX installation to complete.`);
                    }
                } catch (e) {
                    console.error('Export error:', e);
                    alert('Export failed. LaTeX may still be installing.');
                }
            }
        };
    }

    try {
        const response = await fetch('/api/documents/');
        const docs = await response.json();

        if (docs.length > 0) {
            currentDocId = docs[0].id;
            await loadDocument(currentDocId);
        } else {
            const titleEl = document.getElementById('doc-title');
            if (titleEl) titleEl.value = "No documents found.";
        }
    } catch (e) {
        console.error("Failed to load documents:", e);
        const titleEl = document.getElementById('doc-title');
        if (titleEl) titleEl.value = "Error loading documents.";
    }
});

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');

    const content = document.getElementById(`tab-${tabId}`);
    if (content) content.classList.add('active');

    activePreviewTab = (tabId === 'preview');
}

async function loadDocument(id) {
    try {
        const response = await fetch(`/api/documents/${id}/`);
        if (!response.ok) throw new Error("Document not found");

        const doc = await response.json();

        const titleEl = document.getElementById('doc-title');
        if (titleEl) {
            titleEl.value = doc.title;
            // Remove old listeners by cloning
            const newTitleEl = titleEl.cloneNode(true);
            titleEl.parentNode.replaceChild(newTitleEl, titleEl);
            
            newTitleEl.addEventListener('blur', () => saveDocumentTitle(newTitleEl.value));
            newTitleEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') newTitleEl.blur();
            });
        }

        const nav = document.getElementById('section-nav');
        const content = document.getElementById('editor-content');

        if (nav) nav.innerHTML = '';
        if (content) content.innerHTML = '';
        editors = {};

        const sections = doc.sections.sort((a, b) => a.order - b.order);

        sections.forEach(section => {
            const navItem = document.createElement('div');
            navItem.className = 'nav-item';
            navItem.textContent = section.title;
            navItem.dataset.sectionId = section.id;
            navItem.onclick = () => {
                const target = document.getElementById(`section-${section.id}`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                    navItem.classList.add('active');
                }
            };
            if (nav) nav.appendChild(navItem);

            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'section-block';
            sectionDiv.id = `section-${section.id}`;
            sectionDiv.dataset.type = section.section_type;

            const headerContainer = document.createElement('div');
            headerContainer.className = 'section-header-container';
            headerContainer.style.display = 'flex';
            headerContainer.style.alignItems = 'center';
            headerContainer.style.justifyContent = 'space-between';
            headerContainer.style.marginBottom = '10px';

            const header = document.createElement('input');
            header.type = 'text';
            header.className = 'section-title-input';
            header.value = section.title;
            header.dataset.sectionId = section.id;
            
            // Auto update section title globally
            header.addEventListener('blur', () => saveSectionTitle(section.id, header.value));
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') header.blur();
            });

            const toolbar = document.createElement('div');
            toolbar.className = 'editor-toolbar';
            toolbar.innerHTML = `
                <button onclick="editors[${section.id}].chain().focus().toggleBold().run()" title="Bold"><b>B</b></button>
                <button onclick="editors[${section.id}].chain().focus().toggleItalic().run()" title="Italic"><i>I</i></button>
                <button onclick="editors[${section.id}].chain().focus().toggleHeading({ level: 3 }).run()" title="Subheading (H3)">H3</button>
                <button onclick="editors[${section.id}].chain().focus().toggleHeading({ level: 4 }).run()" title="Sub-subheading (H4)">H4</button>
            `;

            headerContainer.appendChild(header);
            headerContainer.appendChild(toolbar);

            const editorElement = document.createElement('div');
            editorElement.className = 'editor-area';

            // --- 📷 Insert Figure Ref toolbar ---
            const figBar = document.createElement('div');
            figBar.className = 'fig-ref-bar';
            figBar.dataset.sectionId = section.id;
            figBar.innerHTML = `
                <span style="font-size:11px; color:#888; margin-right:6px;">Insert figure ref:</span>
                <span class="fig-ref-placeholder" style="font-size:11px; color:#bbb; font-style:italic;">upload images first</span>
            `;

            sectionDiv.appendChild(headerContainer);
            sectionDiv.appendChild(figBar);
            sectionDiv.appendChild(editorElement);
            if (content) content.appendChild(sectionDiv);

            try {
                const editor = new Editor({
                    element: editorElement,
                    extensions: [
                        StarterKit.configure({
                            heading: {
                                levels: [3, 4],
                            },
                        }),
                    ],
                    content: section.content || `<p></p>`,
                    onUpdate: ({ editor }) => {
                        handleEditorUpdate(section.id, editor.getHTML());
                    },
                    onSelectionUpdate: ({ editor }) => {
                        handleSelectionUpdate(section.id, editor);
                    },
                    editorProps: {
                        attributes: {
                            class: 'prose focus:outline-none',
                        },
                    },
                });
                editors[section.id] = editor;
                editors[section.id].sectionTitle = section.title;
                editors[section.id].sectionType = section.section_type;
            } catch (err) {
                console.error("Failed to initialize editor", section.id, err);
            }
        });

        await updateLatexPreview();

    } catch (e) {
        console.error("Error loading document details:", e);
    }
}

async function saveDocumentTitle(newTitle) {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/documents/${currentDocId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });
        if (!response.ok) throw new Error("Failed to save title");
        
        const status = document.getElementById('save-status');
        if (status) {
            status.textContent = 'Saved';
            status.style.color = '#86868b';
        }
    } catch (e) {
        console.error("Error saving document title:", e);
    }
}

async function saveSectionTitle(sectionId, newTitle) {
    if (!newTitle.trim()) return; // Disallow empty titles
    try {
        const response = await fetch(`/api/sections/${sectionId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle.trim() })
        });
        if (!response.ok) throw new Error("Failed to save section title");
        
        // Update sidebar nav item
        const navItem = document.querySelector(`.nav-item[data-section-id="${sectionId}"]`);
        if (navItem) navItem.textContent = newTitle.trim();

        // Update editor object header
        if (editors[sectionId]) editors[sectionId].sectionTitle = newTitle.trim();

        // Regenerate doc on right
        updateLatexPreview();

        const status = document.getElementById('save-status');
        if (status) {
            status.textContent = 'Saved';
            status.style.color = '#86868b';
        }
    } catch (e) {
        console.error("Error saving section title:", e);
    }
}

function handleEditorUpdate(sectionId, content) {
    const status = document.getElementById('save-status');
    if (status) {
        status.textContent = 'Unsaved changes...';
        status.style.color = '#ff9500';
    }

    clearTimeout(previewUpdateTimeout);
    previewUpdateTimeout = setTimeout(() => {
        updateLatexPreview();
    }, 1000);

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSection(sectionId, content);
    }, 1000);
}

async function updateLatexPreview() {
    if (!currentDocId) return;

    try {
        // Try to get compiled PDF first
        const pdfResponse = await fetch(`/api/document/${currentDocId}/export/pdf`);

        if (pdfResponse.ok) {
            // Show PDF in iframe
            const blob = await pdfResponse.blob();
            const url = URL.createObjectURL(blob);
            const iframe = document.getElementById('latex-preview');
            if (iframe) {
                iframe.src = url;
            }
        } else {
            // Fallback to HTML rendering
            const response = await fetch(`/api/document/${currentDocId}/latex`);
            const data = await response.json();

            if (data.latex) {
                renderLatexAsHTML(data.latex);
            }
        }
    } catch (e) {
        console.error('Failed to update preview:', e);
        // Try HTML fallback
        try {
            const response = await fetch(`/api/document/${currentDocId}/latex`);
            const data = await response.json();
            if (data.latex) {
                renderLatexAsHTML(data.latex);
            }
        } catch (e2) {
            console.error('Fallback also failed:', e2);
        }
    }
}

function renderLatexAsHTML(latexSource) {
    const iframe = document.getElementById('latex-preview');
    if (!iframe) return;

    const html = convertLatexToHTML(latexSource);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @page {
                    size: 8.5in 11in;
                    margin: 0.75in 0.625in;
                }
                
                * {
                    box-sizing: border-box;
                }
                
                body {
                    font-family: "Times New Roman", Times, serif;
                    font-size: 10pt;
                    line-height: 12pt;
                    margin: 0.75in 0.625in;
                    background: white;
                    color: #000;
                }
                
                .title {
                    text-align: center;
                    font-size: 24pt;
                    font-weight: bold;
                    margin: 0 0 18pt 0;
                    line-height: 26pt;
                }
                
                .author-block {
                    text-align: center;
                    margin-bottom: 20pt;
                    font-size: 11pt;
                    line-height: 13pt;
                }
                
                .author-block strong {
                    font-weight: normal;
                }
                
                .affiliation {
                    font-size: 10pt;
                    font-style: italic;
                    line-height: 12pt;
                }
                
                .body {
                    column-count: 2;
                    column-gap: 0.25in;
                    text-align: justify;
                    hyphens: auto;
                }
                
                .abstract {
                    margin: 0 0 6pt 0;
                    text-align: justify;
                }
                
                .abstract-label {
                    font-weight: bold;
                    font-style: italic;
                }
                
                .abstract-text {
                    font-weight: bold;
                    font-style: italic;
                }
                
                .keywords {
                    margin: 0 0 12pt 0;
                    text-align: justify;
                }
                
                .keywords-label {
                    font-weight: bold;
                    font-style: italic;
                }
                
                .keywords-text {
                    font-weight: bold;
                    font-style: italic;
                }
                
                .section-title {
                    font-size: 10pt;
                    font-weight: bold;
                    text-align: center;
                    margin: 12pt 0 6pt 0;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                
                p {
                    margin: 0;
                    text-indent: 0.175in;
                    line-height: 12pt;
                    text-align: justify;
                    hyphens: auto;
                }
                
                p + p {
                    margin-top: 0;
                }
                
                strong {
                    font-weight: bold;
                }
                
                em {
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            ${html}
        </body>
        </html>
    `);
    iframeDoc.close();
}

function convertLatexToHTML(latex) {
    let html = '';

    const titleMatch = latex.match(/\\title\{([^}]+)\}/);
    if (titleMatch) {
        html += `<h1 class="title">${escapeHtml(titleMatch[1])}</h1>`;
    }

    const authorMatch = latex.match(/\\author\{[^}]*\\IEEEauthorblockN\{([^}]+)\}/);
    if (authorMatch) {
        html += `<div class="author-block">`;
        html += `<div><strong>${escapeHtml(authorMatch[1])}</strong></div>`;
        html += `<div class="affiliation">dept. name of organization</div>`;
        html += `<div class="affiliation">City, Country</div>`;
        html += `<div class="affiliation">email</div>`;
        html += `</div>`;
    }

    html += `<div class="body">`;

    const abstractMatch = latex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
    if (abstractMatch) {
        const abstractText = abstractMatch[1].trim();
        html += `<div class="abstract">`;
        html += `<span class="abstract-label"><i>Abstract</i>—</span>`;
        html += `<span class="abstract-text">${escapeHtml(abstractText)}</span>`;
        html += `</div>`;
    }

    const keywordsMatch = latex.match(/\\begin\{IEEEkeywords\}([\s\S]*?)\\end\{IEEEkeywords\}/);
    if (keywordsMatch) {
        const keywordsText = keywordsMatch[1].trim();
        html += `<div class="keywords">`;
        html += `<span class="keywords-label"><i>Keywords—</i></span>`;
        html += `<span class="keywords-text">${escapeHtml(keywordsText)}</span>`;
        html += `</div>`;
    }

    const sectionRegex = /\\section\{([^}]+)\}([\s\S]*?)(?=\\section\{|\\end\{document\})/g;
    let sectionMatch;
    let sectionNum = 1;

    while ((sectionMatch = sectionRegex.exec(latex)) !== null) {
        const title = sectionMatch[1];
        let content = sectionMatch[2].trim();

        content = content.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
        content = content.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');

        const paragraphs = content.split(/\n\n+/);

        const roman = toRoman(sectionNum++);
        html += `<div class="section-title">${roman}. ${escapeHtml(title).toUpperCase()}</div>`;

        paragraphs.forEach(para => {
            if (para.trim()) {
                html += `<p>${para.trim()}</p>`;
            }
        });
    }

    html += `</div>`;

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function toRoman(num) {
    const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
    let roman = '';
    for (let i in lookup) {
        while (num >= lookup[i]) {
            roman += i;
            num -= lookup[i];
        }
    }
    return roman;
}

async function saveSection(sectionId, content) {
    const status = document.getElementById('save-status');
    if (status) {
        status.textContent = 'Saving...';
        status.style.color = '#007aff';
    }

    try {
        const response = await fetch(`/api/section/${sectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });

        if (response.ok) {
            if (status) {
                status.textContent = 'Saved';
                status.style.color = '#34c759';
                setTimeout(() => { status.style.color = '#86868b'; }, 2000);
            }
        } else {
            if (status) {
                status.textContent = 'Error saving!';
                status.style.color = '#ff3b30';
            }
        }
    } catch (e) {
        if (status) status.textContent = 'Error saving!';
    }
}

function handleSelectionUpdate(sectionId, editor) {
    const { from, to } = editor.state.selection;
    const aiInput = document.querySelector('.ai-input-area input');

    if (from !== to) {
        currentAISectionId = sectionId;
        currentAISelection = { from, to };

        if (aiInput) {
            aiInput.disabled = false;
            aiInput.placeholder = "Ask AI to rewrite, shorten...";
        }

        const text = editor.state.doc.textBetween(from, to, ' ');
        const chat = document.getElementById('ai-chat');
        if (chat) chat.innerHTML = `<div class="ai-message system">Selected: "${text.substring(0, 50)}..."</div>`;
    } else {
        if (document.activeElement.tagName !== 'INPUT') {
            if (aiInput) {
                aiInput.disabled = true;
                aiInput.placeholder = "Select text to use AI...";
            }
        }
    }
}

async function handleAICommand(command) {
    const editor = editors[currentAISectionId];
    if (!editor || !currentAISelection) return;

    const { from, to } = currentAISelection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');

    if (!selectedText) return;

    const chat = document.getElementById('ai-chat');
    if (chat) {
        chat.innerHTML += `<div class="ai-message user">Command: ${command}</div>`;
        chat.innerHTML += `<div class="ai-message system">Processing...</div>`;
    }

    const aiInput = document.querySelector('.ai-input-area input');
    if (aiInput) aiInput.disabled = true;

    try {
        const response = await fetch('/api/ai/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command: command,
                selected_text: selectedText,
                section_context: "Academic Section"
            }),
        });

        const data = await response.json();

        if (data.error) {
            if (chat) chat.innerHTML += `<div class="ai-message error">Error: ${data.error}</div>`;
            if (aiInput) aiInput.disabled = false;
        } else {
            if (chat) chat.innerHTML += `<div class="ai-message system">Suggestion ready. Reviewing...</div>`;
            showDiffModal(selectedText, data.result);
            currentAIProposal = data.result;
            if (aiInput) aiInput.disabled = false;
        }

    } catch (e) {
        if (chat) chat.innerHTML += `<div class="ai-message error">Network Error</div>`;
        if (aiInput) aiInput.disabled = false;
    }
}

function showDiffModal(original, suggested) {
    const origEl = document.getElementById('diff-original');
    const suggEl = document.getElementById('diff-suggested');

    if (origEl) origEl.textContent = original;
    if (suggEl) suggEl.textContent = suggested;

    const modal = document.getElementById('ai-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
    }
}

function closeModal() {
    const modal = document.getElementById('ai-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    }
}

function acceptAIChange() {
    const editor = editors[currentAISectionId];
    if (editor && currentAIProposal && currentAISelection) {
        const { from, to } = currentAISelection;

        editor.chain()
            .focus()
            .setTextSelection({ from, to })
            .deleteSelection()
            .insertContent(currentAIProposal)
            .run();

        currentAIProposal = null;
        closeModal();

        const chat = document.getElementById('ai-chat');
        if (chat) chat.innerHTML += `<div class="ai-message system" style="color:green">Change applied.</div>`;
    }
}

// Author Management Functions
async function openAuthorsModal() {
    const modal = document.getElementById('authors-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        await loadAuthors();
        if (window.showAddAuthorForm) window.showAddAuthorForm();
    }
}

function closeAuthorsModal() {
    const modal = document.getElementById('authors-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    }
}

async function loadAuthors() {
    if (!currentDocId) return;

    try {
        const response = await fetch(`/api/documents/${currentDocId}/`);
        const doc = await response.json();
        const authors = doc.authors || [];

        const authorsList = document.getElementById('authors-list');
        if (!authorsList) return;

        if (authors.length === 0) {
            authorsList.innerHTML = '<p style="color: #86868b; text-align: center;">No authors added yet. Click "Add Author" to get started.</p>';
            return;
        }

        authorsList.innerHTML = authors.map(author => `
            <div class="author-card" style="background: #f5f5f7; padding: 10px; border-radius: 6px; margin-bottom: 8px; border: 1px solid #eee;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 0; margin-right: 10px;">
                        <h4 style="margin: 0 0 2px 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(author.name)}</h4>
                        <p style="margin: 0; font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(author.organization || author.email || 'No Details')}</p>
                    </div>
                    <div style="display: flex; gap: 5px; flex-shrink: 0;">
                        <button onclick="editAuthor(${author.id})" style="background: #007aff; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;">Edit</button>
                        <button onclick="deleteAuthor(${author.id})" style="background: #ff3b30; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer;">Del</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load authors:', e);
    }
}

// Helper functions for form
window.showAddAuthorForm = function () {
    window.resetAuthorForm();
    document.getElementById('author-form-title').textContent = "Add New Author";
    const saveBtn = document.getElementById('save-author-btn');
    if (saveBtn) saveBtn.textContent = "Add Author";
};

window.resetAuthorForm = function () {
    document.getElementById('author-id').value = '';
    document.getElementById('author-name').value = '';
    document.getElementById('author-dept').value = '';
    document.getElementById('author-org').value = '';
    document.getElementById('author-city').value = '';
    document.getElementById('author-country').value = '';
    document.getElementById('author-email').value = '';

    const errorDiv = document.getElementById('author-form-error');
    if (errorDiv) errorDiv.style.display = 'none';
};

window.submitAuthorForm = async function () {
    const authorId = document.getElementById('author-id').value;
    const name = document.getElementById('author-name').value;

    if (!name) {
        alert("Name is required");
        return;
    }

    const data = {
        document: currentDocId,
        name: name,
        department: document.getElementById('author-dept').value,
        organization: document.getElementById('author-org').value,
        city: document.getElementById('author-city').value,
        country: document.getElementById('author-country').value,
        email: document.getElementById('author-email').value
    };

    const errorDiv = document.getElementById('author-form-error');
    if (errorDiv) errorDiv.style.display = 'none';

    try {
        let response;
        if (authorId) {
            response = await fetch(`/api/authors/${authorId}/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch('/api/authors/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }

        if (response.ok) {
            await loadAuthors();
            await updateLatexPreview();
            if (!authorId) window.resetAuthorForm();
        } else {
            const errorText = await response.text();
            if (errorDiv) {
                errorDiv.textContent = `Error: ${errorText}`;
                errorDiv.style.display = 'block';
            } else {
                alert(`Error: ${errorText}`);
            }
        }
    } catch (e) {
        if (errorDiv) {
            errorDiv.textContent = `Network Error: ${e.message}`;
            errorDiv.style.display = 'block';
        } else {
            alert(`Network Error: ${e.message}`);
        }
    }
};

async function editAuthor(authorId) {
    try {
        const response = await fetch(`/api/authors/${authorId}/`);
        const author = await response.json();

        document.getElementById('author-id').value = author.id;
        document.getElementById('author-name').value = author.name;
        document.getElementById('author-dept').value = author.department || '';
        document.getElementById('author-org').value = author.organization || '';
        document.getElementById('author-city').value = author.city || '';
        document.getElementById('author-country').value = author.country || '';
        document.getElementById('author-email').value = author.email || '';

        document.getElementById('author-form-title').textContent = "Edit Author";
        const saveBtn = document.getElementById('save-author-btn');
        if (saveBtn) saveBtn.textContent = "Update Author";

        const errorDiv = document.getElementById('author-form-error');
        if (errorDiv) errorDiv.style.display = 'none';

    } catch (e) {
        console.error('Error fetching author details:', e);
        alert('Error fetching author details');
    }
}

async function deleteAuthor(authorId) {
    if (!confirm('Are you sure you want to delete this author?')) return;

    try {
        const response = await fetch(`/api/authors/${authorId}/`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadAuthors();
            await updateLatexPreview();
        } else {
            alert('Failed to delete author');
        }
    } catch (e) {
        console.error('Error deleting author:', e);
        alert('Error deleting author');
    }
}

// ============================================================
// IMAGE MANAGEMENT
// ============================================================

let imagesData = []; // cache of images for current doc

async function openImagesModal() {
    const modal = document.getElementById('images-modal');
    if (!modal) return;
    modal.classList.add('active');
    setupImageDropZone();
    await loadImages();
}

function closeImagesModal() {
    const modal = document.getElementById('images-modal');
    if (modal) modal.classList.remove('active');
}

async function loadImages() {
    if (!currentDocId) return;
    try {
        const res = await fetch(`/api/images/?document=${currentDocId}`);
        if (!res.ok) throw new Error('Failed to fetch images');
        imagesData = await res.json();
        renderGallery();
        updateFigRefBars();
    } catch (e) {
        console.error('Error loading images:', e);
    }
}


function renderGallery() {
    const gallery = document.getElementById('images-gallery');
    if (!gallery) return;

    const selectedId = document.getElementById('img-selected-id')?.value;

    gallery.innerHTML = imagesData.map(img => {
        const caption = img.caption || 'Untitled';
        const label = img.label || 'No label';
        const thumb = img.image_url || '';
        const sel = String(img.id) === String(selectedId) ? ' selected' : '';
        return `
            <div class="img-thumb-card${sel}" onclick="selectImage(${img.id})">
                <img src="${escapeHtml(thumb)}" alt="${escapeHtml(caption)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'52\' height=\'52\'%3E%3Crect fill=\'%23eee\' width=\'52\' height=\'52\'/%3E%3Ctext x=\'50%25\' y=\'55%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' font-size=\'11\' fill=\'%23aaa\'%3EIMG%3C/text%3E%3C/svg%3E'">
                <div class="img-thumb-info">
                    <div class="img-thumb-caption">${escapeHtml(caption)}</div>
                    <div class="img-thumb-label">${escapeHtml(label)}</div>
                </div>
            </div>`;
    }).join('');

    if (imagesData.length === 0) {
        gallery.innerHTML = '<p style="padding:16px; text-align:center; color:#aaa; font-size:13px;">No images yet.<br>Upload one above.</p>';
    }
}

function selectImage(imgId) {
    const img = imagesData.find(i => i.id === imgId);
    if (!img) return;

    // update hidden id
    document.getElementById('img-selected-id').value = imgId;

    // populate form fields
    document.getElementById('img-caption').value = img.caption || '';
    document.getElementById('img-label').value = img.label || '';
    const widthSlider = document.getElementById('img-width');
    widthSlider.value = img.width || 0.9;
    document.getElementById('img-width-val').textContent =
        parseFloat(widthSlider.value).toFixed(2) + '\u00d7 column';

    // populate section dropdown with current assignment
    populateSectionDropdown(img.section);

    // show preview
    const preview = document.getElementById('img-preview-container');
    preview.innerHTML = `<img src="${escapeHtml(img.image_url)}" style="max-width:100%; max-height:220px; border-radius:8px; object-fit:contain;" alt="preview">`;

    // show action buttons
    document.getElementById('img-save-btn').style.display = '';
    document.getElementById('img-delete-btn').style.display = '';

    // highlight in gallery
    renderGallery();
}

// ---- Drag & Drop / Click to Upload ----
function setupImageDropZone() {
    const zone = document.getElementById('img-drop-zone');
    const input = document.getElementById('img-file-input');
    if (!zone || zone._setupDone) return;
    zone._setupDone = true;

    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) uploadImage(file);
    });

    input.addEventListener('change', () => {
        if (input.files[0]) uploadImage(input.files[0]);
        input.value = '';
    });
}

async function uploadImage(file) {
    if (!currentDocId) {
        alert('No document loaded.');
        return;
    }
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }

    const zone = document.getElementById('img-drop-zone');
    const origHTML = zone.innerHTML;
    zone.innerHTML = '<div style="padding:20px; color:#007aff;">⏳ Uploading...</div>';

    try {
        const formData = new FormData();
        formData.append('document', currentDocId);
        formData.append('image', file);
        formData.append('caption', file.name.replace(/\.[^.]+$/, ''));
        formData.append('label', 'fig:' + file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/\s+/g, '-'));
        formData.append('width', '0.9');
        formData.append('order', imagesData.length);

        const res = await fetch('/api/images/', {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(JSON.stringify(err));
        }

        const newImg = await res.json();
        zone.innerHTML = origHTML;
        setupImageDropZone();
        await loadImages();
        selectImage(newImg.id);     // auto-select newly uploaded
        await updateLatexPreview();
    } catch (e) {
        console.error('Upload error:', e);
        zone.innerHTML = origHTML;
        setupImageDropZone();
        alert('Upload failed: ' + e.message);
    }
}

async function saveImageMeta() {
    const imgId = document.getElementById('img-selected-id').value;
    if (!imgId) return;

    const caption = document.getElementById('img-caption').value.trim();
    const label = document.getElementById('img-label').value.trim();
    const width = parseFloat(document.getElementById('img-width').value);
    const sectionEl = document.getElementById('img-section');
    const section = sectionEl && sectionEl.value ? parseInt(sectionEl.value) : null;

    const errDiv = document.getElementById('img-form-error');
    errDiv.style.display = 'none';

    try {
        const res = await fetch(`/api/images/${imgId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption, label, width, section }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(JSON.stringify(err));
        }

        await loadImages();
        selectImage(parseInt(imgId));
        updateFigRefBars();
        await updateLatexPreview();

        // Brief success flash on button
        const btn = document.getElementById('img-save-btn');
        btn.textContent = '\u2713 Saved!';
        btn.style.background = '#34c759';
        setTimeout(() => { btn.textContent = 'Save Changes'; btn.style.background = ''; }, 1800);
    } catch (e) {
        errDiv.textContent = 'Save failed: ' + e.message;
        errDiv.style.display = 'block';
    }
}


async function deleteImage() {
    const imgId = document.getElementById('img-selected-id').value;
    if (!imgId) return;
    if (!confirm('Delete this image from the paper?')) return;

    try {
        const res = await fetch(`/api/images/${imgId}/`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) throw new Error('Delete failed');

        document.getElementById('img-selected-id').value = '';
        document.getElementById('img-preview-container').innerHTML =
            '<span style="color:#bbb;font-size:13px;">Select an image to preview &amp; edit</span>';
        document.getElementById('img-save-btn').style.display = 'none';
        document.getElementById('img-delete-btn').style.display = 'none';
        document.getElementById('img-caption').value = '';
        document.getElementById('img-label').value = '';
        document.getElementById('img-width').value = 0.9;
        document.getElementById('img-width-val').textContent = '0.90\u00d7 column';

        await loadImages();
        await updateLatexPreview();
    } catch (e) {
        alert('Error deleting image: ' + e.message);
    }
}

// ============================================================
// SECTION ↔ IMAGE HELPERS
// ============================================================

/**
 * Populate the "Place After Section" <select> with document sections.
 * @param {number|null} selectedSectionId  - the currently assigned section id
 */
function populateSectionDropdown(selectedSectionId) {
    const sel = document.getElementById('img-section');
    if (!sel) return;

    // Gather sections from active editors
    const sectionEntries = Object.entries(editors).map(([id, ed]) => ({
        id: parseInt(id),
        title: ed.sectionTitle || `Section ${id}`,
    }));

    sel.innerHTML = `<option value="">\u2014 End of document (no specific section) \u2014</option>`
        + sectionEntries.map(s =>
            `<option value="${s.id}" ${parseInt(selectedSectionId) === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`
        ).join('');
}

/**
 * Refresh the "Insert \ref{}" chip bars that appear above each section editor.
 * Shows one chip per image assigned to that section.
 */
function updateFigRefBars() {
    document.querySelectorAll('.fig-ref-bar').forEach(bar => {
        const sectionId = parseInt(bar.dataset.sectionId);
        const assigned = imagesData.filter(img => img.section === sectionId);

        if (assigned.length === 0) {
            bar.innerHTML = `
                <span style="font-size:11px; color:#bbb; font-style:italic;">
                    No images assigned to this section yet.
                </span>`;
            return;
        }

        bar.innerHTML = `<span style="font-size:11px; color:#888; margin-right:6px;">Insert ref:</span>`
            + assigned.map(img => {
                const refLabel = img.label || `fig${img.id}`;
                const chipLabel = img.caption || refLabel;
                return `<button class="fig-ref-chip"
                    title="Insert \\ref{${refLabel}} into editor"
                    onclick="insertFigureRef(${sectionId}, '${refLabel}')">
                    \ud83d\udcf7 ${escapeHtml(chipLabel)}
                </button>`;
            }).join('');
    });
}

/**
 * Insert \ref{label} at the cursor position in the given section's editor.
 */
function insertFigureRef(sectionId, refLabel) {
    const editor = editors[sectionId];
    if (!editor) return;
    editor.chain().focus().insertContent(`\\ref{${refLabel}}`).run();
}
