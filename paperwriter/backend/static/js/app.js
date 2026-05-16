import { Editor } from 'https://esm.sh/@tiptap/core@2.11.5';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.5';

let editors = {};
let currentDocId = null;
let saveTimeout;
let previewUpdateTimeout;

// CSRF helper for Django

// CSRF helper for Django
function getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
        const [k, v] = c.trim().split('=');
        if (k === name) return decodeURIComponent(v);
    }
    return '';
}

// References State - declared at top to avoid Temporal Dead Zone errors
let referencesList = [];
let currentRefId = null;

// Images State
let imagesData = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log("PaperWriter Frontend Initialized");

    const app = document.getElementById('app');
    const resizerLeft = document.getElementById('resizer-left');
    const resizerRight = document.getElementById('resizer-right');
    const sidebar = document.getElementById('sidebar');
    const rightPanel = document.getElementById('right-panel');

    let isResizingLeft = false;
    let isResizingRight = false;

    if (resizerLeft) {
        resizerLeft.addEventListener('mousedown', (e) => {
            isResizingLeft = true;
            document.body.style.cursor = 'col-resize';
            resizerLeft.classList.add('dragging');
            document.body.classList.add('is-resizing');
        });
    }

    if (resizerRight) {
        resizerRight.addEventListener('mousedown', (e) => {
            isResizingRight = true;
            document.body.style.cursor = 'col-resize';
            resizerRight.classList.add('dragging');
            document.body.classList.add('is-resizing');
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isResizingLeft && sidebar && app) {
            let newWidth = e.clientX;
            
            // Calculate limits based on dynamic window sizing
            let rightWidth = rightPanel ? rightPanel.offsetWidth : 0;
            // Ensure center panel has absolute minimum 350px width
            let maxLeft = window.innerWidth - rightWidth - 350;
            // Also ensure left sidebar never expands beyond its own maximum or squishes center
            if (newWidth > maxLeft) {
                newWidth = maxLeft;
            }

            // Left panel bounds: collapse at 120, max width 500
            if (newWidth > 60 && newWidth < 500) {
                if (newWidth < 120) {
                    if (!sidebar.classList.contains('collapsed')) {
                        sidebar.classList.add('collapsed');
                        if (rightPanel) {
                            let half = (window.innerWidth - 72) / 2;
                            rightPanel.style.width = `${half}px`;
                            app.style.setProperty('--right-panel-width', `${half}px`);
                        }
                    }
                } else {
                    sidebar.classList.remove('collapsed');
                }
                // Only resize if we haven't hit the center squish limit
                if (newWidth <= maxLeft) {
                    sidebar.style.width = `${newWidth}px`;
                    app.style.setProperty('--sidebar-width', `${newWidth}px`);
                }
            }
        }
        if (isResizingRight && rightPanel && app) {
            let newWidth = window.innerWidth - e.clientX;
            let leftWidth = sidebar ? sidebar.offsetWidth : 0;
            
            // Ensure center panel has absolute minimum 350px width
            let maxRight = window.innerWidth - leftWidth - 350;
            if (newWidth > maxRight) {
                newWidth = maxRight;
            }

            // Right panel bounds: absolute min width 300px
            if (newWidth > 300 && newWidth < 800) {
                if (newWidth <= maxRight) {
                    rightPanel.style.width = `${newWidth}px`;
                    app.style.setProperty('--right-panel-width', `${newWidth}px`);
                }
            }
        }
    });

    document.addEventListener('mouseup', () => {
        isResizingLeft = false;
        isResizingRight = false;
        document.body.style.cursor = 'default';
        document.body.classList.remove('is-resizing');
        if (resizerLeft) resizerLeft.classList.remove('dragging');
        if (resizerRight) resizerRight.classList.remove('dragging');
    });

    // Sidebar Toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle && sidebar && app) {
        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            if (isCollapsed) {
                sidebar.style.width = '72px';
                app.style.setProperty('--sidebar-width', '72px');
                if (rightPanel) {
                    let half = (window.innerWidth - 72) / 2;
                    rightPanel.style.width = `${half}px`;
                    app.style.setProperty('--right-panel-width', `${half}px`);
                }
            } else {
                sidebar.style.width = '280px';
                app.style.setProperty('--sidebar-width', '280px');
            }
        });
    }

    // Modal Logic Improvements
    const originalOpenModal = window.openModal;
    window.openModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
        }
    };

    const originalCloseModal = window.closeModal;
    window.closeModal = (modalId) => {
        const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 300);
        }
    };

    // Update existing button click handlers to use new openModal
    const authorsBtn = document.getElementById('authors-btn');
    if (authorsBtn) authorsBtn.onclick = () => openAuthorsModal();

    const imagesBtn = document.getElementById('images-btn');
    if (imagesBtn) imagesBtn.onclick = () => openImagesModal();

    const referencesBtn = document.getElementById('references-btn');
    if (referencesBtn) referencesBtn.onclick = () => openReferencesModal();

    try {
        const response = await fetch('/api/documents/');
        const docs = await response.json();

        if (docs.length > 0) {
            currentDocId = docs[0].id;
            await loadDocument(currentDocId);
        }
    } catch (e) {
        console.error("Failed to load documents:", e);
    }
});

// (switchTab removed)

async function loadDocument(id) {
    try {
        currentDocId = id;
        await fetchReferencesSilent();
        
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

        const indexTermsEl = document.getElementById('doc-index-terms');
        if (indexTermsEl) {
            indexTermsEl.value = doc.index_terms || '';
            const newIndexTermsEl = indexTermsEl.cloneNode(true);
            indexTermsEl.parentNode.replaceChild(newIndexTermsEl, indexTermsEl);
            
            newIndexTermsEl.addEventListener('blur', () => saveIndexTerms(newIndexTermsEl.value));
            newIndexTermsEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') newIndexTermsEl.blur();
            });
        }

        const nav = document.getElementById('section-nav');
        const content = document.getElementById('editor-content');

        if (nav) nav.innerHTML = '';
        if (content) content.innerHTML = '';
        editors = {};

        // Sort top-level sections
        const sections = doc.sections.sort((a, b) => a.order - b.order);
        console.log("Sections to render:", sections.length, sections);

        const renderSectionNode = (section, depth = 1) => {
            // --- Navigation Item ---
            const navGroup = document.createElement('div');
            navGroup.className = 'nav-group';
            navGroup.style.position = 'relative';
            
            const navItem = document.createElement('div');
            navItem.className = depth === 1 ? 'nav-item' : 'nav-subitem';
            navItem.style.paddingLeft = `${depth === 1 ? 16 : 32 + (depth - 2) * 12}px`;
            navItem.style.display = 'flex';
            navItem.style.alignItems = 'center';
            navItem.style.gap = '8px';
            
            const titleSpan = document.createElement('span');
            titleSpan.textContent = section.title || (depth === 1 ? 'Untitled Section' : 'Untitled Subsection');
            titleSpan.style.flex = '1';
            titleSpan.style.overflow = 'hidden';
            titleSpan.style.textOverflow = 'ellipsis';
            navItem.appendChild(titleSpan);

            // Action Buttons Container
            const actions = document.createElement('div');
            actions.className = 'nav-actions';
            actions.style.display = 'flex';
            actions.style.gap = '4px';
            actions.style.opacity = '0';
            actions.style.transition = 'opacity 0.2s';

            // Add Subsection Button (+) in Sidebar
            if (depth < 3) {
                const addSub = document.createElement('div');
                addSub.className = 'action-btn add-sub';
                addSub.innerHTML = '+';
                addSub.title = 'Add Subsection';
                addSub.onclick = (e) => {
                    e.stopPropagation();
                    createSubsection(section.id);
                };
                actions.appendChild(addSub);
            }

            // Move Up Button
            const upBtn = document.createElement('div');
            upBtn.className = 'action-btn move-btn';
            upBtn.innerHTML = '↑';
            upBtn.title = 'Move Up';
            upBtn.onclick = (e) => {
                e.stopPropagation();
                moveSection(section.id, 'up');
            };
            actions.appendChild(upBtn);

            // Move Down Button
            const downBtn = document.createElement('div');
            downBtn.className = 'action-btn move-btn';
            downBtn.innerHTML = '↓';
            downBtn.title = 'Move Down';
            downBtn.onclick = (e) => {
                e.stopPropagation();
                moveSection(section.id, 'down');
            };
            actions.appendChild(downBtn);

            // Delete Button
            const delBtn = document.createElement('div');
            delBtn.className = 'action-btn delete-btn';
            delBtn.innerHTML = '×';
            delBtn.title = 'Delete Section';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteSection(section.id);
            };
            actions.appendChild(delBtn);

            navItem.appendChild(actions);

            // Hover effect for actions
            navItem.onmouseenter = () => actions.style.opacity = '1';
            navItem.onmouseleave = () => actions.style.opacity = '0';

            navItem.dataset.sectionId = section.id; // Crucial for title sync
            navItem.onclick = () => {
                const target = document.getElementById(`section-${section.id}`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.querySelectorAll('.nav-item, .nav-subitem').forEach(el => el.classList.remove('active'));
                    navItem.classList.add('active');
                }
            };
            navGroup.appendChild(navItem);
            const navContainer = document.getElementById('section-nav');
            if (navContainer) {
                navContainer.appendChild(navGroup);
            } else {
                console.error("Sidebar container #section-nav not found in the DOM!");
            }

            // --- Editor Block ---
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'section-block';
            sectionDiv.id = `section-${section.id}`;
            sectionDiv.dataset.type = section.section_type;

            const headerContainer = document.createElement('div');
            headerContainer.className = 'section-header-container';
            headerContainer.style.display = 'flex';
            headerContainer.style.alignItems = 'center';
            headerContainer.style.justifyContent = 'space-between';
            headerContainer.style.marginBottom = '20px';

            const header = document.createElement('input');
            header.type = 'text';
            header.className = 'section-title-input';
            header.placeholder = depth === 1 ? 'Section Title' : 'Subsection Title';
            header.value = section.title;
            header.style.fontSize = depth === 1 ? '1.5rem' : depth === 2 ? '1.2rem' : '1.1rem';
            header.style.fontWeight = '700';
            header.dataset.sectionId = section.id;
            
            header.addEventListener('blur', () => {
                saveSectionTitle(section.id, header.value);
                titleSpan.textContent = header.value || (depth === 1 ? 'Untitled Section' : 'Untitled Subsection');
            });
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') header.blur();
            });


            headerContainer.appendChild(header);
            // (no toolbar — clean editor)

            const editorElement = document.createElement('div');
            editorElement.className = 'editor-area';

            const figBar = document.createElement('div');
            figBar.className = 'fig-ref-bar';
            figBar.dataset.sectionId = section.id;
            
            const citeBar = document.createElement('div');
            citeBar.className = 'cite-ref-bar';
            citeBar.dataset.sectionId = section.id;
            citeBar.innerHTML = `<span style="font-size:11px; color:#bbb; font-style:italic;">Insert citation toolbar</span>`;

            sectionDiv.appendChild(headerContainer);
            sectionDiv.appendChild(figBar);
            sectionDiv.appendChild(citeBar);
            sectionDiv.appendChild(editorElement);
            if (content) content.appendChild(sectionDiv);

            try {
                const editor = new Editor({
                    element: editorElement,
                    extensions: [
                        StarterKit, // Use StarterKit with all defaults
                    ],
                    content: section.content || '<p></p>',
                    onUpdate: ({ editor }) => {
                        handleEditorUpdate(section.id, editor.getHTML());
                    },
                    editorProps: { attributes: { class: 'prose focus:outline-none' } },
                });
                editors[section.id] = editor;
                editors[section.id].sectionTitle = section.title;
                editors[section.id].sectionType = section.section_type;
            } catch (err) {
                console.error("Failed to initialize editor", section.id, err);
            }

            // Recursive subsections
            if (section.subsections && section.subsections.length > 0) {
                const subNavContainer = document.createElement('div');
                section.subsections.sort((a, b) => a.order - b.order).forEach(sub => {
                    subNavContainer.appendChild(renderSectionNode(sub, depth + 1));
                });
                navGroup.appendChild(subNavContainer);
            }
            return navGroup;
        };

        sections.forEach(s => nav.appendChild(renderSectionNode(s)));

        // Add Section button in Sidebar
        const addSectionBtn = document.createElement('div');
        addSectionBtn.className = 'nav-item add-section-nav';
        addSectionBtn.innerHTML = '<span style="color: var(--accent-color); font-weight: 600;">+ Add Section</span>';
        addSectionBtn.onclick = () => createSection();
        nav.appendChild(addSectionBtn);

        updateCiteDropdowns();
        updateFigRefBars();
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

async function saveIndexTerms(newTerms) {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/documents/${currentDocId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index_terms: newTerms })
        });
        if (!response.ok) throw new Error("Failed to save index terms");
        
        const status = document.getElementById('save-status');
        if (status) {
            status.textContent = 'Saved';
            status.style.color = '#86868b';
        }
        updateLatexPreview();
    } catch (e) {
        console.error("Error saving index terms:", e);
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
        const navItemSpan = document.querySelector(`.nav-item[data-section-id="${sectionId}"] span, .nav-subitem[data-section-id="${sectionId}"] span`);
        if (navItemSpan) navItemSpan.textContent = newTitle.trim();

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

function updateSidebarSubitems(sectionId, content) {
    const container = document.getElementById(`nav-subitems-${sectionId}`);
    if (!container) return;
    
    container.innerHTML = '';
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    const h3s = doc.querySelectorAll('h3');
    
    h3s.forEach((h3, index) => {
        const text = h3.textContent.trim();
        if (!text) return;
        
        const subitem = document.createElement('div');
        subitem.className = 'nav-subitem';
        subitem.textContent = text;
        subitem.title = text;
        
        subitem.onclick = (e) => {
            e.stopPropagation();
            const sectionEl = document.getElementById(`section-${sectionId}`);
            if (sectionEl) {
                const actualH3s = sectionEl.querySelectorAll('.ProseMirror h3');
                if (actualH3s[index]) {
                    actualH3s[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    document.querySelectorAll('.nav-item, .nav-subitem').forEach(el => el.classList.remove('active'));
                    subitem.classList.add('active');
                }
            }
        };
        
        container.appendChild(subitem);
    });
}

function handleEditorUpdate(sectionId, content) {
    updateSidebarSubitems(sectionId, content);
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

async function createSection() {
    if (!currentDocId) return;
    const title = prompt("Enter section title:");
    if (!title) return;

    try {
        const response = await fetch(`/api/documents/${currentDocId}/add_section/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title })
        });
        if (!response.ok) throw new Error("Failed to create section");
        await loadDocument(currentDocId);
    } catch (e) {
        console.error("Error creating section:", e);
        alert("Failed to create section: " + e.message);
    }
}

async function deleteSection(sectionId) {
    if (!confirm("Are you sure you want to delete this section and all its contents?")) return;

    try {
        const response = await fetch(`/api/sections/${sectionId}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        if (!response.ok && response.status !== 204) throw new Error("Failed to delete section");
        await loadDocument(currentDocId);
    } catch (e) {
        console.error("Error deleting section:", e);
        alert("Delete failed: " + e.message);
    }
}

async function createSubsection(parentId) {
    const title = prompt("Enter subsection title:");
    if (!title) return;

    try {
        const response = await fetch(`/api/documents/${currentDocId}/add_section/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: title,
                parent: parentId,
                section_type: 'custom'
            })
        });
        if (!response.ok) throw new Error("Failed to create subsection");
        await loadDocument(currentDocId);
    } catch (e) {
        console.error("Error creating subsection:", e);
        alert("Failed to create subsection: " + e.message);
    }
}

window.createSubsection = createSubsection;

async function moveSection(sectionId, direction) {
    try {
        const response = await fetch(`/api/sections/${sectionId}/move/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ direction: direction })
        });
        if (!response.ok) throw new Error("Failed to move section");
        await loadDocument(currentDocId); 
    } catch (e) {
        console.error("Error moving section:", e);
        alert("Move failed: " + e.message);
    }
}
window.moveSection = moveSection;

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
                iframe.src = url + '#toolbar=0&view=FitH&scrollbar=0';
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
                
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 3px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
                
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
        const response = await fetch(`/api/sections/${sectionId}/`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
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
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });

        if (response.ok || response.status === 204) {
            await loadAuthors();
            await updateLatexPreview();
        } else {
            const errText = await response.text();
            alert('Failed to delete author: ' + errText);
        }
    } catch (e) {
        console.error('Error deleting author:', e);
        alert('Error deleting author');
    }
}

// ============================================================
// IMAGE MANAGEMENT
// ============================================================
// (imagesData declared at top of file)

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

async function fetchReferencesSilent() {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/references/?document=${currentDocId}`);
        referencesList = await response.json();
        referencesList.sort((a, b) => a.id - b.id);
    } catch (e) {
        console.error("Error fetching references silently:", e);
    }
}

function updateCiteDropdowns() {
    document.querySelectorAll('.cite-ref-bar').forEach(bar => {
        const sectionId = parseInt(bar.dataset.sectionId);
        
        if (referencesList.length === 0) {
            bar.innerHTML = `
                <span style="font-size:11px; color:#888; margin-right:6px;">Insert citation:</span>
                <span style="font-size:11px; color:#bbb; font-style:italic;">add references first</span>`;
            return;
        }

        let selectHtml = `<select onchange="if(this.value) { insertCitation(${sectionId}, this.value); this.value=''; }" style="font-size: 11px; padding: 2px 4px; border-radius: 4px; border: 1px solid #ddd; background: #fff; cursor: pointer;">`;
        selectHtml += `<option value="">-- select to cite --</option>`;
        referencesList.forEach(ref => {
            selectHtml += `<option value="${ref.citation_key}">[${ref.citation_key}] ${escapeHtml(ref.description || '')}</option>`;
        });
        selectHtml += `</select>`;

        bar.innerHTML = `<span style="font-size:11px; color:#888; margin-right:6px;">Insert citation:</span>` + selectHtml;
    });
}

window.insertCitation = insertCitation;

function insertCitation(sectionId, citeKey) {
    const editor = editors[sectionId];
    if (!editor) return;
    editor.chain().focus().insertContent(`~\\cite{${citeKey}}`).run();
}


// ==========================================
// REFERENCES (BibTeX) MANAGEMENT
// ==========================================
// (referencesList and currentRefId declared at top of file)

function openReferencesModal() {
    if (!currentDocId) {
        alert("Please select a document first.");
        return;
    }
    const modal = document.getElementById('references-modal');
    if (modal) {
        modal.classList.add('active');
        fetchReferences();
        showAddReferenceForm();
    }
}

function closeReferencesModal() {
    const modal = document.getElementById('references-modal');
    if (modal) modal.classList.remove('active');
}

async function fetchReferences() {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/references/?document=${currentDocId}`);
        referencesList = await response.json();
        referencesList.sort((a, b) => a.id - b.id);
        renderReferencesList();
    } catch (e) {
        console.error("Error fetching references:", e);
    }
}

function renderReferencesList() {
    const container = document.getElementById('references-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (referencesList.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center; margin-top: 20px; font-size: 13px;">No references yet.</p>';
        return;
    }
    
    referencesList.forEach(ref => {
        const div = document.createElement('div');
        div.style.padding = '12px 10px';
        div.style.borderBottom = '1px solid #eee';
        div.style.cursor = 'pointer';
        div.style.backgroundColor = (currentRefId === ref.id) ? '#e6f7ff' : 'transparent';
        
        div.onclick = () => editReference(ref.id);
        
        div.onmouseover = () => { if (currentRefId !== ref.id) div.style.backgroundColor = '#f9f9f9'; };
        div.onmouseout = () => { if (currentRefId !== ref.id) div.style.backgroundColor = 'transparent'; };
        
        div.innerHTML = `
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #333;">[${ref.citation_key}]</div>
            <div style="font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${ref.description || 'No description'}
            </div>
        `;
        
        container.appendChild(div);
    });
}

function showAddReferenceForm() {
    currentRefId = null;
    document.getElementById('reference-form-title').textContent = 'Add New BibTeX Reference';
    document.getElementById('ref-id').value = '';
    document.getElementById('ref-description').value = '';
    document.getElementById('ref-key').value = '';
    document.getElementById('ref-bibtex').value = '';
    
    document.getElementById('ref-delete-btn').style.display = 'none';
    document.getElementById('ref-form-error').style.display = 'none';
    
    renderReferencesList();
}

function editReference(id) {
    const ref = referencesList.find(r => r.id === id);
    if (!ref) return;
    
    currentRefId = id;
    document.getElementById('reference-form-title').textContent = 'Edit Reference';
    document.getElementById('ref-id').value = ref.id;
    document.getElementById('ref-description').value = ref.description || '';
    document.getElementById('ref-key').value = ref.citation_key || '';
    document.getElementById('ref-bibtex').value = ref.bibtex || '';
    
    document.getElementById('ref-delete-btn').style.display = 'block';
    document.getElementById('ref-form-error').style.display = 'none';
    
    renderReferencesList();
}

function autoExtractBibTeXKey(bibtex) {
    if (!bibtex) return;
    const match = bibtex.match(/@[a-zA-Z]+{([^,]+),/);
    if (match && match[1]) {
        const inputKey = document.getElementById('ref-key');
        if (!inputKey.value || currentRefId === null) {
            inputKey.value = match[1].trim();
        }
    }
}

async function submitReferenceForm() {
    if (!currentDocId) return;
    
    const id = document.getElementById('ref-id').value;
    const description = document.getElementById('ref-description').value;
    const key = document.getElementById('ref-key').value;
    const bibtex = document.getElementById('ref-bibtex').value;
    
    const errDiv = document.getElementById('ref-form-error');
    errDiv.style.display = 'none';
    
    if (!key || !bibtex) {
        errDiv.textContent = 'Citation key and raw BibTeX are required.';
        errDiv.style.display = 'block';
        return;
    }
    
    const isUpdate = !!id;
    const url = isUpdate ? `/api/references/${id}/` : '/api/references/';
    const method = isUpdate ? 'PUT' : 'POST';
    
    const payload = {
        document: currentDocId,
        citation_key: key,
        description: description,
        bibtex: bibtex
    };
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(JSON.stringify(err));
        }
        
        await fetchReferences();
        if (!isUpdate) {
            showAddReferenceForm();
        }
        
        updateLatexPreview();
        updateCiteDropdowns();
        
    } catch (e) {
        console.error("Error saving reference:", e);
        errDiv.textContent = 'Error saving reference. Make sure the citation key does not have spaces or weird characters.';
        errDiv.style.display = 'block';
    }
}

async function deleteReference() {
    if (!currentRefId) return;
    if (!confirm("Are you sure you want to delete this reference?")) return;
    
    try {
        const response = await fetch(`/api/references/${currentRefId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error("Failed to delete");
        
        await fetchReferences();
        showAddReferenceForm();
        updateLatexPreview();
        updateCiteDropdowns();
    } catch (e) {
        console.error("Error deleting reference:", e);
        alert("Failed to delete reference.");
    }
}
// Global Exports for Modal Triggering
window.openAuthorsModal = openAuthorsModal;
window.closeAuthorsModal = closeAuthorsModal;
window.openImagesModal = openImagesModal;
window.closeImagesModal = closeImagesModal;
window.openReferencesModal = openReferencesModal;
window.closeReferencesModal = closeReferencesModal;
window.editAuthor = editAuthor;
window.deleteAuthor = deleteAuthor;
window.switchTab = switchTab;
window.createSection = createSection;
window.createSubsection = createSubsection;
window.deleteSection = deleteSection;

function cleanContent(html) {
    if (!html) return '';
    // Remove common accessibility and navigation garbage
    const badPhrases = [
        'Skip to main content', 'Accessibility help', 'Accessibility feedback',
        'Sign in', 'AI Mode', 'Insert citation toolbar', 'Insert fig ref toolbar',
    ];
    for (const phrase of badPhrases) {
        if (html.includes(phrase)) return '<p></p>';
    }
    return html;
}
