import { Editor, Node, mergeAttributes, InputRule } from 'https://esm.sh/@tiptap/core@2.11.5';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.11.5';

const LatexRefNode = Node.create({
  name: 'latexRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      refType: { default: 'ref' },
      label: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span.ref-chip',
        getAttrs: element => ({
          refType: element.getAttribute('data-type'),
          label: element.getAttribute('data-label'),
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const text = HTMLAttributes.refType === 'cite' ? `[${HTMLAttributes.label}]` : `${HTMLAttributes.label}`;
    const icon = HTMLAttributes.refType === 'cite' ? '📚' : '📌';
    return ['span', mergeAttributes(HTMLAttributes, { class: 'ref-chip', 'data-type': HTMLAttributes.refType, 'data-label': HTMLAttributes.label, 'contenteditable': 'false' }), `${icon} ${text}`]
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\\(ref|cite)\{([^}]+)\}/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const start = range.from;
          const end = range.to;
          const refType = match[1];
          const label = match[2];
          tr.replaceWith(start, end, this.type.create({ refType, label }));
        },
      }),
    ]
  },
})

const LatexEqNode = Node.create({
  name: 'latexEq',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      eqType: { default: 'inline' },
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span.eq-chip',
        getAttrs: element => ({
          eqType: element.getAttribute('data-type'),
          latex: element.getAttribute('data-latex'),
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const text = HTMLAttributes.latex;
    const icon = '∑';
    return ['span', mergeAttributes(HTMLAttributes, { class: 'eq-chip', 'data-type': HTMLAttributes.eqType, 'data-latex': HTMLAttributes.latex, 'contenteditable': 'false', 'title': HTMLAttributes.latex }), `${icon} ${text.length > 20 ? text.substring(0, 20) + '...' : text}`]
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\$\$([\s\S]+?)\$\$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const start = range.from;
          const end = range.to;
          const latex = match[1];
          tr.replaceWith(start, end, this.type.create({ eqType: 'block', latex }));
        },
      }),
      new InputRule({
        find: /(?:\s|^)\$([^$]+)\$/,
        handler: ({ state, range, match }) => {
          const { tr } = state;
          const start = range.from + (match[0].startsWith(' ') || match[0].startsWith('\n') ? 1 : 0);
          const end = range.to;
          const latex = match[1];
          tr.replaceWith(start, end, this.type.create({ eqType: 'inline', latex }));
        },
      }),
    ]
  },
})

let editors = {};
let currentDocId = null;
let saveTimeout;
let previewUpdateTimeout;

// Tables state
let tablesList = [];
let currentTableId = null;
let gridData = [["Header 1", "Header 2"], ["", ""]];

// Comments state
let commentsList = [];
let currentRightPanelTab = 'preview';

// Reference popover selection state
let currentRefMenuTab = 'cite';
let selectedTextRange = null;
let activeEditorIdForRef = null;

// User Profile State
let userProfile = null;

// Collaboration State
let heartbeatInterval = null;
let activeLocks = {};

// CSRF helper for Django
function getCsrfToken() {
    if (window.csrfToken) return window.csrfToken;
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (const c of cookies) {
        const [k, v] = c.trim().split('=');
        if (k === name) return decodeURIComponent(v);
    }
    return '';
}

// Custom non-blocking async confirmation dialog to replace native window.confirm()
window.confirmDelete = function (message, confirmText = 'Delete') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        if (!modal || !msgEl || !okBtn || !cancelBtn) {
            // Fallback to native confirm if elements are missing
            resolve(window.confirm(message));
            return;
        }

        const titleEl = document.getElementById('confirm-title');
        if (titleEl) {
            if (confirmText === 'Resolve') {
                titleEl.textContent = 'Resolve Comment?';
            } else if (confirmText === 'Delete') {
                titleEl.textContent = 'Confirm Delete?';
            } else {
                titleEl.textContent = 'Confirm Action?';
            }
        }

        const iconBox = document.getElementById('confirm-icon-box');
        if (iconBox) {
            if (confirmText === 'Resolve' || confirmText === 'Yes') {
                iconBox.className = 'confirm-icon-container primary-accent';
                iconBox.innerHTML = `
                    <svg class="confirm-warning-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                `;
            } else {
                iconBox.className = 'confirm-icon-container';
                iconBox.innerHTML = `
                    <svg class="confirm-warning-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                `;
            }
        }

        msgEl.textContent = message;
        okBtn.textContent = confirmText;
        if (confirmText === 'Resolve' || confirmText === 'Yes') {
            okBtn.className = 'btn-confirm-primary';
        } else {
            okBtn.className = 'btn-confirm-danger';
        }

        modal.classList.add('active');

        const cleanup = (value) => {
            modal.classList.remove('active');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(value);
        };

        okBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
    });
};

// Custom non-blocking async prompt input dialog to replace native window.prompt()
window.customPrompt = function (title, labelText = 'Title', placeholder = '', confirmText = 'Create') {
    return new Promise((resolve) => {
        const modal = document.getElementById('prompt-modal');
        const titleEl = document.getElementById('prompt-title');
        const labelEl = document.getElementById('prompt-label');
        const inputEl = document.getElementById('prompt-input');
        const okBtn = document.getElementById('prompt-ok-btn');
        const cancelBtn = document.getElementById('prompt-cancel-btn');

        if (!modal || !inputEl || !okBtn || !cancelBtn) {
            // Fallback to native prompt if elements are missing
            resolve(window.prompt(title));
            return;
        }

        if (titleEl) titleEl.textContent = title;
        if (labelEl) labelEl.textContent = labelText;
        inputEl.value = '';
        inputEl.placeholder = placeholder;
        okBtn.textContent = confirmText;

        modal.classList.add('active');
        
        // Auto-focus input
        setTimeout(() => inputEl.focus(), 100);

        const cleanup = (value) => {
            modal.classList.remove('active');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            inputEl.onkeydown = null;
            resolve(value);
        };

        okBtn.onclick = () => {
            const val = inputEl.value.trim();
            if (val) cleanup(val);
        };

        cancelBtn.onclick = () => cleanup(null);

        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const val = inputEl.value.trim();
                if (val) cleanup(val);
            } else if (e.key === 'Escape') {
                cleanup(null);
            }
        };
    });
};

// References State - declared at top to avoid Temporal Dead Zone errors
let referencesList = [];
let currentRefId = null;

// Images State
let imagesData = [];

// AI State
let currentAISectionId = null;
let currentAISelection = null;
let currentAIProposal = null;

// Track the last focused editor for toolbar commands
let lastFocusedEditorId = null;

async function initApp() {
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
        if (isResizingLeft && sidebar) {
            // Account for header height offset
            let newWidth = e.clientX;
            let rightWidth = rightPanel ? rightPanel.offsetWidth : 0;
            let maxLeft = window.innerWidth - rightWidth - 350;
            if (newWidth > maxLeft) newWidth = maxLeft;

            if (newWidth > 60 && newWidth < 500) {
                if (newWidth < 120) {
                    if (!sidebar.classList.contains('collapsed')) {
                        sidebar.classList.add('collapsed');
                    }
                } else {
                    sidebar.classList.remove('collapsed');
                }
                if (newWidth <= maxLeft) {
                    sidebar.style.width = `${newWidth}px`;
                }
            }
        }
        if (isResizingRight && rightPanel) {
            let newWidth = window.innerWidth - e.clientX;
            let leftWidth = sidebar ? sidebar.offsetWidth : 0;
            let maxRight = window.innerWidth - leftWidth - 350;
            if (newWidth > maxRight) newWidth = maxRight;

            if (newWidth > 300 && newWidth < 800) {
                if (newWidth <= maxRight) {
                    rightPanel.style.width = `${newWidth}px`;
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
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            if (isCollapsed) {
                sidebar.style.width = '72px';
            } else {
                sidebar.style.width = '224px';
            }
        });
    }

    // Wire up toolbar buttons
    setupToolbar();

    // Wire export buttons
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.onclick = () => exportPdf('export-btn');

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) exportPdfBtn.onclick = () => exportPdf('export-pdf-btn');

    // Wire toolbar figure/cite buttons
    const tbFigure = document.getElementById('tb-figure');
    if (tbFigure) tbFigure.onclick = () => openImagesModal();

    const tbCite = document.getElementById('tb-cite');
    if (tbCite) tbCite.onclick = () => openReferencesModal();

    // Modal button wiring
    const authorsBtn = document.getElementById('authors-btn');
    if (authorsBtn) authorsBtn.onclick = () => openAuthorsModal();

    const imagesBtn = document.getElementById('images-btn');
    if (imagesBtn) imagesBtn.onclick = () => openImagesModal();

    const referencesBtn = document.getElementById('references-btn');
    if (referencesBtn) referencesBtn.onclick = () => openReferencesModal();

    const tablesBtn = document.getElementById('tables-btn');
    if (tablesBtn) tablesBtn.onclick = () => openTablesModal();

    const sidebarEquationBtn = document.getElementById('sidebar-equation-btn');
    if (sidebarEquationBtn) sidebarEquationBtn.onclick = () => openEquationModal();

    const tbEquation = document.getElementById('tb-equation');
    if (tbEquation) tbEquation.onclick = () => openEquationModal();
    
    // Hide floating menu when clicking outside
    document.addEventListener('mousedown', (e) => {
        const trigger = document.getElementById('floating-cite-trigger');
        const menu = document.getElementById('floating-cite-menu');
        // Let's not hide if clicking inside editors or modals
        if (trigger && !trigger.contains(e.target) && menu && !menu.contains(e.target)) {
            // Delay slightly to allow click selections to propagate
            setTimeout(() => {
                const sel = window.getSelection();
                if (sel.isCollapsed) {
                    trigger.style.display = 'none';
                    menu.style.display = 'none';
                }
            }, 150);
        }
    });

    try {
        const profileResp = await fetch('/api/auth/profile/');
        if (profileResp.ok) {
            userProfile = await profileResp.json();
            
            // Update Avatar globally
            const avatarBtns = document.querySelectorAll('.header-avatar');
            const initials = userProfile.first_name ? userProfile.first_name[0] + (userProfile.last_name ? userProfile.last_name[0] : '') : userProfile.email[0].toUpperCase();
            avatarBtns.forEach(btn => btn.textContent = initials);

            if (!userProfile.dpdp_consent_processing) {
                document.getElementById('mandatory-consent-modal').classList.add('active');
            } else {
                await loadDashboard();
            }
        }
    } catch (e) {
        console.error("Failed to load profile:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// ============================================================
// TOOLBAR
// ============================================================

function setupToolbar() {
    const tbBold = document.getElementById('tb-bold');
    const tbItalic = document.getElementById('tb-italic');
    const tbH1 = document.getElementById('tb-h1');
    const tbH2 = document.getElementById('tb-h2');

    if (tbBold) tbBold.onclick = () => {
        const editor = getActiveEditor();
        if (editor) editor.chain().focus().toggleBold().run();
    };

    if (tbItalic) tbItalic.onclick = () => {
        const editor = getActiveEditor();
        if (editor) editor.chain().focus().toggleItalic().run();
    };

    if (tbH1) tbH1.onclick = () => {
        const editor = getActiveEditor();
        if (editor) editor.chain().focus().toggleHeading({ level: 3 }).run();
    };

    if (tbH2) tbH2.onclick = () => {
        const editor = getActiveEditor();
        if (editor) editor.chain().focus().toggleHeading({ level: 4 }).run();
    };
}

function getActiveEditor() {
    if (lastFocusedEditorId && editors[lastFocusedEditorId]) {
        return editors[lastFocusedEditorId];
    }
    // Fallback: return first editor
    const keys = Object.keys(editors);
    return keys.length > 0 ? editors[keys[0]] : null;
}

// ============================================================
// EXPORT
// ============================================================

async function exportPdf(buttonId) {
    if (!currentDocId) return;

    const btn = document.getElementById(buttonId || 'export-btn');
    let originalHtml = '';
    if (btn) {
        originalHtml = btn.innerHTML;
        btn.disabled = true;
        
        // Handle span inside button if exists, otherwise just button text
        const span = btn.querySelector('span');
        if (span) {
            span.textContent = 'Exporting...';
        } else {
            // For simple text buttons (like export-pdf-btn)
            btn.innerHTML = 'Exporting...';
        }
    }

    try {
        const response = await fetch(`/api/document/${currentDocId}/export/pdf`);
        if (response.status === 402) {
            openPricingModal();
            return;
        }
        
        if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `paper_${currentDocId}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } else {
            // Try LaTeX export as fallback
            const latexResp = await fetch(`/api/document/${currentDocId}/export/latex`);
            if (latexResp.status === 402) {
                openPricingModal();
                return;
            }
            if (latexResp.ok) {
                const blob = await latexResp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `paper_${currentDocId}_project.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                alert('Export failed. Please check if LaTeX is installed.');
            }
        }
    } catch (e) {
        console.error('Export error:', e);
        alert('Export failed: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }
}

// ============================================================
// DOCUMENT LOADING
// ============================================================

async function loadDocument(id) {
    try {
        currentDocId = id;
        startHeartbeat();
        const shareBtn = document.getElementById('share-doc-btn');
        if (shareBtn) shareBtn.style.display = 'flex';

        await fetchReferencesSilent();
        await fetchTablesSilent();
        await fetchComments();
        
        const response = await fetch(`/api/documents/${id}/`);
        if (!response.ok) throw new Error("Document not found");

        const doc = await response.json();

        // Update header title
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

        // Update index terms
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

        // Add "Structure" label
        if (nav) {
            const structureLabel = document.createElement('div');
            structureLabel.className = 'nav-section-label';
            structureLabel.textContent = 'Structure';
            nav.appendChild(structureLabel);
        }

        // Sort top-level sections
        const sections = doc.sections.sort((a, b) => a.order - b.order);

        const renderSectionNode = (section, depth = 1) => {
            // --- Navigation Item ---
            const navGroup = document.createElement('div');
            navGroup.className = 'nav-group';
            navGroup.style.position = 'relative';
            
            const navItem = document.createElement('div');
            navItem.className = depth === 1 ? 'nav-item' : 'nav-subitem';
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
            actions.style.gap = '2px';
            actions.style.opacity = '0';
            actions.style.transition = 'opacity 0.15s';

            // Add Subsection Button
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

            // Move Up
            const upBtn = document.createElement('div');
            upBtn.className = 'action-btn move-btn';
            upBtn.innerHTML = '↑';
            upBtn.title = 'Move Up';
            upBtn.onclick = (e) => {
                e.stopPropagation();
                moveSection(section.id, 'up');
            };
            actions.appendChild(upBtn);

            // Move Down
            const downBtn = document.createElement('div');
            downBtn.className = 'action-btn move-btn';
            downBtn.innerHTML = '↓';
            downBtn.title = 'Move Down';
            downBtn.onclick = (e) => {
                e.stopPropagation();
                moveSection(section.id, 'down');
            };
            actions.appendChild(downBtn);

            // Delete
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

            // Hover effect
            navItem.onmouseenter = () => actions.style.opacity = '1';
            navItem.onmouseleave = () => actions.style.opacity = '0';

            navItem.dataset.sectionId = section.id;
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
            }

            // --- Editor Block ---
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'section-block';
            sectionDiv.id = `section-${section.id}`;
            sectionDiv.dataset.type = section.section_type;

            const headerContainer = document.createElement('div');
            headerContainer.className = 'section-header-container';

            const header = document.createElement('input');
            header.type = 'text';
            header.className = 'section-title-input';
            header.placeholder = depth === 1 ? 'Section Title' : 'Subsection Title';
            header.value = section.title;
            header.style.fontSize = depth === 1 ? '1.5rem' : depth === 2 ? '1.2rem' : '1.1rem';
            header.dataset.sectionId = section.id;
            
            header.addEventListener('blur', () => {
                saveSectionTitle(section.id, header.value);
                titleSpan.textContent = header.value || (depth === 1 ? 'Untitled Section' : 'Untitled Subsection');
            });
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') header.blur();
            });

            headerContainer.appendChild(header);

            const editorElement = document.createElement('div');
            editorElement.className = 'editor-area';

            const figBar = document.createElement('div');
            figBar.className = 'fig-ref-bar';
            figBar.dataset.sectionId = section.id;
            sectionDiv.appendChild(headerContainer);
            sectionDiv.appendChild(figBar);
            sectionDiv.appendChild(editorElement);
            if (content) content.appendChild(sectionDiv);

            try {
                const editor = new Editor({
                    element: editorElement,
                    extensions: [
                        StarterKit,
                        LatexRefNode,
                        LatexEqNode,
                    ],
                    content: (section.content || '<p></p>')
                        .replace(/\\(ref|cite)\{([^}]+)\}/g, '<span class="ref-chip" data-type="$1" data-label="$2"></span>')
                        .replace(/\$\$([\s\S]+?)\$\$/g, (m, g1) => `<span class="eq-chip" data-type="block" data-latex="${escapeHtml(g1)}"></span>`)
                        .replace(/\$([^$]+)\$/g, (m, g1) => `<span class="eq-chip" data-type="inline" data-latex="${escapeHtml(g1)}"></span>`),
                    onUpdate: ({ editor }) => {
                        handleEditorUpdate(section.id, editor.getHTML());
                    },
                    onFocus: () => {
                        lastFocusedEditorId = section.id;
                        acquireSectionLock(section.id);
                    },
                    onBlur: () => {
                        releaseSectionLock(section.id);
                    },
                    onSelectionUpdate: ({ editor }) => {
                        handleSelectionUpdate(section.id, editor);
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

        // Add Section button
        const addSectionBtn = document.createElement('div');
        addSectionBtn.className = 'nav-item add-section-nav';
        addSectionBtn.innerHTML = '<span style="color: var(--brand-900); font-weight: 600; font-size: 13px;">+ Add Section</span>';
        addSectionBtn.onclick = () => createSection();
        nav.appendChild(addSectionBtn);

        // Setup Real-time connections
        setupEditorPresence(id);
        setupDocumentWebSocket(id);

        updateFigRefBars();
        await refreshPdfPreview();

    } catch (e) {
        console.error("Error loading document details:", e);
    }
}

// ============================================================
// STATS
// ============================================================

function updateStats() {
    // Word count
    let totalWords = 0;
    let sectionCount = Object.keys(editors).length;
    
    for (const [id, editor] of Object.entries(editors)) {
        const text = editor.state.doc.textContent || '';
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        totalWords += words;
    }
    
    const wordCountEl = document.getElementById('word-count');
    if (wordCountEl) wordCountEl.textContent = totalWords.toLocaleString();
    
    const sectionCountEl = document.getElementById('section-count');
    if (sectionCountEl) sectionCountEl.textContent = sectionCount;
}

// ============================================================
// SAVE FUNCTIONS
// ============================================================

async function saveDocumentTitle(newTitle) {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/documents/${currentDocId}/`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ title: newTitle })
        });
        if (!response.ok) throw new Error("Failed to save title");
        
        updateSaveStatus('Autosaved', '#94a3b8');
    } catch (e) {
        console.error("Error saving document title:", e);
    }
}

async function saveIndexTerms(newTerms) {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/documents/${currentDocId}/`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ index_terms: newTerms })
        });
        if (!response.ok) throw new Error("Failed to save index terms");
        
        updateSaveStatus('Autosaved', '#94a3b8');
        updateLatexPreview();
    } catch (e) {
        console.error("Error saving index terms:", e);
    }
}

async function saveSectionTitle(sectionId, newTitle) {
    if (!newTitle.trim()) return;
    try {
        const response = await fetch(`/api/sections/${sectionId}/`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ title: newTitle.trim() })
        });
        if (!response.ok) throw new Error("Failed to save section title");
        
        // Update sidebar
        const navItemSpan = document.querySelector(`.nav-item[data-section-id="${sectionId}"] span, .nav-subitem[data-section-id="${sectionId}"] span`);
        if (navItemSpan) navItemSpan.textContent = newTitle.trim();

        if (editors[sectionId]) editors[sectionId].sectionTitle = newTitle.trim();

        updateLatexPreview();
        updateSaveStatus('Autosaved', '#94a3b8');
    } catch (e) {
        console.error("Error saving section title:", e);
    }
}

function updateSaveStatus(text, color) {
    const status = document.getElementById('save-status');
    if (status) {
        // Find or create text node
        const svg = status.querySelector('svg');
        // Update text content (preserve SVG)
        status.innerHTML = '';
        if (svg) status.appendChild(svg);
        status.appendChild(document.createTextNode(' ' + text));
        status.style.color = color || '#94a3b8';
    }
}

// ============================================================
// EDITOR UPDATE HANDLERS
// ============================================================

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
    updateSaveStatus('Unsaved changes...', '#f59e0b');
    updateStats();

    clearTimeout(previewUpdateTimeout);
    previewUpdateTimeout = setTimeout(() => {
        updateLatexPreview();
    }, 1000);

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveSection(sectionId, content);
    }, 1000);
}

// ============================================================
// SECTION CRUD
// ============================================================

async function createSection() {
    if (!currentDocId) return;
    const title = await window.customPrompt("Create Section", "Section Title", "e.g. Methodology", "Create");
    if (!title) return;

    try {
        const response = await fetch(`/api/documents/${currentDocId}/add_section/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
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
    if (!await window.confirmDelete("Are you sure you want to delete this section and all its contents?")) return;

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
    const title = await window.customPrompt("Create Subsection", "Subsection Title", "e.g. Subsection Name", "Create");
    if (!title) return;

    try {
        const response = await fetch(`/api/documents/${currentDocId}/add_section/`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
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

// ============================================================
// LATEX PREVIEW
// ============================================================

let autoCompileDebounceTimer = null;

async function refreshPdfPreview() {
    if (!currentDocId) return;

    const overlay = document.getElementById('preview-loading-overlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        const pdfResponse = await fetch(`/api/document/${currentDocId}/preview/pdf`);
        if (pdfResponse.ok) {
            const blob = await pdfResponse.blob();
            const url = URL.createObjectURL(blob);
            const iframe = document.getElementById('latex-preview');
            if (iframe) {
                iframe.src = url + '#toolbar=0&view=FitH&scrollbar=0';
            }
        } else {
            console.error('Failed to update PDF preview:', pdfResponse.status);
            alert("PDF compilation failed. Please check your LaTeX syntax or ensure online compiler is reachable.");
        }
    } catch (e) {
        console.error('Failed to update PDF preview:', e);
        alert("PDF compilation network error.");
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}

async function updateLatexPreview() {
    if (!currentDocId) return;

    // Check Auto-Compile toggle
    const autoCompileToggle = document.getElementById('auto-compile-toggle');
    if (autoCompileToggle && autoCompileToggle.checked) {
        clearTimeout(autoCompileDebounceTimer);
        autoCompileDebounceTimer = setTimeout(() => {
            refreshPdfPreview();
        }, 3000); // 3 seconds debounce
    }
}

// Restore auto-compile preference
document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('auto-compile-toggle');
    if (toggle) {
        const pref = localStorage.getItem('autoCompilePreference');
        if (pref === 'true') toggle.checked = true;
        toggle.addEventListener('change', (e) => {
            localStorage.setItem('autoCompilePreference', e.target.checked);
            if (e.target.checked) refreshPdfPreview();
        });
    }
});

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
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
            <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
            <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
            <style>
                @page {
                    size: 8.5in 11in;
                    margin: 0.75in 0.625in;
                }
                * {
                    box-sizing: border-box;
                }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 3px; }
                
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
                strong { font-weight: bold; }
                em { font-style: italic; }
                
                /* IEEE Table styles */
                .ieee-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 10px 0;
                }
                .ieee-table th, .ieee-table td {
                    border: 0.5px solid #222;
                    padding: 4px 6px;
                    text-align: center;
                }
                .footnotes-list {
                    font-size: 8pt;
                    line-height: 11pt;
                    border-top: 0.5px solid #666;
                    padding-top: 6px;
                    margin-top: 12pt;
                }
                .references-list {
                    font-size: 8pt;
                    line-height: 11pt;
                }
                .reference-item {
                    display: flex;
                    gap: 6px;
                    margin-bottom: 4px;
                }
            </style>
        </head>
        <body>
            ${html}
            <script>
                document.addEventListener("DOMContentLoaded", function() {
                    renderMathInElement(document.body, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false},
                            {left: "\\begin{equation}", right: "\\end{equation}", display: true},
                            {left: "\\begin{align}", right: "\\end{align}", display: true}
                        ],
                        throwOnError : false
                    });
                });
            </script>
        </body>
        </html>
    `);
    iframeDoc.close();
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

// ============================================================
// SAVE CONTENT
// ============================================================

async function saveSection(sectionId, content) {
    updateSaveStatus('Saving...', '#3b82f6');

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
            updateSaveStatus('Autosaved', '#22c55e');
            setTimeout(() => updateSaveStatus('Autosaved', '#94a3b8'), 2000);
        } else {
            updateSaveStatus('Error saving!', '#ef4444');
        }
    } catch (e) {
        updateSaveStatus('Error saving!', '#ef4444');
    }
}

// ============================================================
// AI COMMANDS
// ============================================================

function handleSelectionUpdate(sectionId, editor) {
    const { from, to } = editor.state.selection;
    const aiInput = document.querySelector('.ai-input-area input');

    // AI Selection Logic
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
            currentAISectionId = null;
            currentAISelection = null;
            if (aiInput) {
                aiInput.disabled = true;
                aiInput.placeholder = "Select text to use AI...";
            }
        }
    }

    // Unified floating popover selection trigger logic
    const sel = window.getSelection();
    if (!sel.isCollapsed && sel.rangeCount > 0 && from !== to) {
        selectedTextRange = { from, to };
        activeEditorIdForRef = sectionId;

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const trigger = document.getElementById('floating-cite-trigger');
        if (trigger) {
            trigger.style.top = `${rect.top + window.scrollY - 36}px`;
            trigger.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 40}px`;
            trigger.style.display = 'block';
        }
    } else {
        // Keep trigger if clicked on trigger itself
        setTimeout(() => {
            const trigger = document.getElementById('floating-cite-trigger');
            const menu = document.getElementById('floating-cite-menu');
            const activeElement = document.activeElement;
            if (trigger && !trigger.contains(activeElement) && menu && !menu.contains(activeElement)) {
                trigger.style.display = 'none';
            }
        }, 100);
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
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
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

// ============================================================
// AUTHOR MANAGEMENT
// ============================================================

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
            authorsList.innerHTML = '<p style="color: var(--brand-400); text-align: center; padding: 20px; font-size: 13px;">No authors added yet.</p>';
            return;
        }

        authorsList.innerHTML = authors.map(author => `
            <div class="img-thumb-card" style="cursor: pointer;" onclick="editAuthor(${author.id})">
                <div style="width:40px;height:40px;border-radius:50%;background:var(--brand-100);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;color:var(--brand-700);flex-shrink:0;">
                    ${escapeHtml(author.name.charAt(0).toUpperCase())}
                </div>
                <div class="img-thumb-info">
                    <div class="img-thumb-caption">${escapeHtml(author.name)}</div>
                    <div class="img-thumb-label" style="font-family:inherit;color:var(--brand-500);">${escapeHtml(author.organization || author.email || 'No Details')}</div>
                </div>
                <button class="card-delete-btn" onclick="event.stopPropagation(); deleteAuthor(${author.id})" title="Delete">×</button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Failed to load authors:', e);
    }
}

window.showAddAuthorForm = function () {
    window.resetAuthorForm();
    document.getElementById('author-form-title').textContent = "Add New Author";
    const saveBtn = document.getElementById('save-author-btn');
    if (saveBtn) saveBtn.textContent = "Add Author";
    const deleteBtn = document.getElementById('author-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
};

window.resetAuthorForm = function () {
    document.getElementById('author-id').value = '';
    document.getElementById('author-name').value = '';
    document.getElementById('author-dept').value = '';
    document.getElementById('author-org').value = '';
    document.getElementById('author-city').value = '';
    document.getElementById('author-country').value = '';
    document.getElementById('author-email').value = '';

    const deleteBtn = document.getElementById('author-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';

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
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify(data)
            });
        } else {
            response = await fetch('/api/authors/', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
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

        const deleteBtn = document.getElementById('author-delete-btn');
        if (deleteBtn) deleteBtn.style.display = 'block';

        const errorDiv = document.getElementById('author-form-error');
        if (errorDiv) errorDiv.style.display = 'none';

    } catch (e) {
        console.error('Error fetching author details:', e);
        alert('Error fetching author details');
    }
}

async function deleteAuthor(authorId) {
    const id = authorId || document.getElementById('author-id').value;
    if (!id) return;
    if (!await window.confirmDelete('Are you sure you want to delete this author?')) return;

    try {
        const response = await fetch(`/api/authors/${id}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });

        if (response.ok || response.status === 204) {
            window.resetAuthorForm();
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
                <img src="${escapeHtml(thumb)}" alt="${escapeHtml(caption)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'52\\' height=\\'52\\'%3E%3Crect fill=\\'%23f1f5f9\\' width=\\'52\\' height=\\'52\\'/%3E%3Ctext x=\\'50%25\\' y=\\'55%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'11\\' fill=\\'%2394a3b8\\'%3EIMG%3C/text%3E%3C/svg%3E'">
                <div class="img-thumb-info">
                    <div class="img-thumb-caption">${escapeHtml(caption)}</div>
                    <div class="img-thumb-label">${escapeHtml(label)}</div>
                </div>
                <button class="card-delete-btn" onclick="event.stopPropagation(); deleteImage(${img.id})" title="Delete">×</button>
            </div>`;
    }).join('');

    if (imagesData.length === 0) {
        gallery.innerHTML = '<p style="padding:16px; text-align:center; color:var(--brand-400); font-size:13px;">No images yet.<br>Upload one above.</p>';
    }
}

function selectImage(imgId) {
    const img = imagesData.find(i => i.id === imgId);
    if (!img) return;

    document.getElementById('img-selected-id').value = imgId;
    document.getElementById('img-caption').value = img.caption || '';
    document.getElementById('img-label').value = img.label || '';
    const widthSlider = document.getElementById('img-width');
    widthSlider.value = img.width || 0.9;
    document.getElementById('img-width-val').textContent =
        parseFloat(widthSlider.value).toFixed(2) + '\u00d7 column';

    populateSectionDropdown(img.section);

    const preview = document.getElementById('img-preview-container');
    preview.innerHTML = `<img src="${escapeHtml(img.image_url)}" style="max-width:100%; max-height:220px; object-fit:contain;" alt="preview">`;

    const saveBtn = document.getElementById('img-save-btn');
    if (saveBtn) saveBtn.style.display = '';
    const deleteBtn = document.getElementById('img-delete-btn');
    if (deleteBtn) deleteBtn.style.display = '';

    renderGallery();
}

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

let isUploadingImage = false;
async function uploadImage(file) {
    if (!currentDocId) { alert('No document loaded.'); return; }
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (isUploadingImage) return;

    const zone = document.getElementById('img-drop-zone');
    const origHTML = zone.innerHTML;
    
    // Safety check in case it's already in uploading state
    if (origHTML.includes('Uploading...')) return;
    
    isUploadingImage = true;
    zone.innerHTML = '<div style="padding:20px; color:var(--brand-900);">⏳ Uploading...</div>';

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
            headers: { 'X-CSRFToken': getCsrfToken() },
            body: formData 
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(JSON.stringify(err));
        }

        const newImg = await res.json();
        zone.innerHTML = origHTML;
        zone._setupDone = false;
        setupImageDropZone();
        await loadImages();
        selectImage(newImg.id);
    } catch (e) {
        console.error('Upload error:', e);
        zone.innerHTML = origHTML;
        zone._setupDone = false;
        setupImageDropZone();
        alert('Upload failed: ' + e.message);
    } finally {
        isUploadingImage = false;
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
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
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

        const btn = document.getElementById('img-save-btn');
        btn.textContent = '✓ Saved!';
        btn.style.background = '#22c55e';
        setTimeout(() => { btn.textContent = 'Save Changes'; btn.style.background = ''; }, 1800);
    } catch (e) {
        errDiv.textContent = 'Save failed: ' + e.message;
        errDiv.style.display = 'block';
    }
}


async function deleteImage(imageId) {
    const imgId = imageId || document.getElementById('img-selected-id').value;
    if (!imgId) return;
    if (!await window.confirmDelete('Delete this image from the paper?')) return;

    try {
        const res = await fetch(`/api/images/${imgId}/`, { 
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        if (!res.ok && res.status !== 204) throw new Error('Delete failed');

        document.getElementById('img-selected-id').value = '';
        document.getElementById('img-preview-container').innerHTML =
            '<span>Select an image to preview &amp; edit</span>';
        const saveBtn = document.getElementById('img-save-btn');
        if (saveBtn) saveBtn.style.display = 'none';
        const deleteBtn = document.getElementById('img-delete-btn');
        if (deleteBtn) deleteBtn.style.display = 'none';
        document.getElementById('img-caption').value = '';
        document.getElementById('img-label').value = '';
        document.getElementById('img-width').value = 0.9;
        document.getElementById('img-width-val').textContent = '0.90\u00d7 column';

        await loadImages();
        await refreshPdfPreview();
    } catch (e) {
        alert('Error deleting image: ' + e.message);
    }
}

// ============================================================
// SECTION ↔ IMAGE HELPERS
// ============================================================

function populateSectionDropdown(selectedSectionId) {
    const sel = document.getElementById('img-section');
    if (!sel) return;

    const sectionEntries = Object.entries(editors).map(([id, ed]) => ({
        id: parseInt(id),
        title: ed.sectionTitle || `Section ${id}`,
    }));

    sel.innerHTML = `<option value="">\u2014 End of document (no specific section) \u2014</option>`
        + sectionEntries.map(s =>
            `<option value="${s.id}" ${parseInt(selectedSectionId) === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`
        ).join('');
}

function updateFigRefBars() {
    document.querySelectorAll('.fig-ref-bar').forEach(bar => {
        const sectionId = parseInt(bar.dataset.sectionId);
        const assigned = imagesData.filter(img => img.section === sectionId);

        if (assigned.length === 0) {
            bar.innerHTML = '';
            return;
        }

        bar.innerHTML = `<span style="font-size:11px; color:var(--brand-400); margin-right:6px;">Insert ref:</span>`
            + assigned.map(img => {
                const refLabel = img.label || `fig${img.id}`;
                const chipLabel = img.caption || refLabel;
                return `<button class="fig-ref-chip"
                    title="Insert \\ref{${refLabel}} into editor"
                    onclick="insertFigureRef(${sectionId}, '${refLabel}')">
                    📷 ${escapeHtml(chipLabel)}
                </button>`;
            }).join('');
    });
}

function insertFigureRef(sectionId, refLabel) {
    const editor = editors[sectionId];
    if (!editor) return;
    editor.chain().focus().insertContent(`<span class="ref-chip" data-type="ref" data-label="${refLabel}"></span>`).run();
}

// ============================================================
// REFERENCES (BibTeX) MANAGEMENT
// ============================================================

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



window.insertCitation = insertCitation;

function insertCitation(sectionId, citeKey) {
    const editor = editors[sectionId];
    if (!editor) return;
    editor.chain().focus().insertContent(`&nbsp;<span class="ref-chip" data-type="cite" data-label="${citeKey}"></span>`).run();
}


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
        container.innerHTML = '<p style="color: var(--brand-400); text-align: center; margin-top: 20px; font-size: 13px;">No references yet.</p>';
        return;
    }
    
    referencesList.forEach(ref => {
        const div = document.createElement('div');
        div.className = 'img-thumb-card';
        div.style.cursor = 'pointer';
        div.style.backgroundColor = (currentRefId === ref.id) ? 'var(--brand-50)' : '';
        if (currentRefId === ref.id) {
            div.style.borderColor = 'var(--brand-900)';
        }
        
        div.onclick = () => editReference(ref.id);
        
        div.innerHTML = `
            <div class="img-thumb-info">
                <div class="img-thumb-caption" style="font-size:13px;">[${escapeHtml(ref.citation_key)}]</div>
                <div class="img-thumb-label" style="font-family:inherit; color:var(--brand-500);">${escapeHtml(ref.description || 'No description')}</div>
            </div>
            <button class="card-delete-btn" onclick="event.stopPropagation(); deleteReference(${ref.id})" title="Delete">×</button>
        `;
        
        container.appendChild(div);
    });
}

function switchRefInputMode(mode) {
    const doiSec = document.getElementById('doi-input-section');
    const bibtexSec = document.getElementById('bibtex-input-section');
    const doiBtn = document.getElementById('ref-toggle-doi');
    const bibtexBtn = document.getElementById('ref-toggle-bibtex');

    if (mode === 'doi') {
        if (doiSec) doiSec.style.display = 'block';
        if (bibtexSec) bibtexSec.style.display = 'none';
        if (doiBtn) {
            doiBtn.classList.add('active');
            doiBtn.style.background = '#ffffff';
            doiBtn.style.color = 'var(--brand-900)';
            doiBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        }
        if (bibtexBtn) {
            bibtexBtn.classList.remove('active');
            bibtexBtn.style.background = 'transparent';
            bibtexBtn.style.color = 'var(--brand-500)';
            bibtexBtn.style.boxShadow = 'none';
        }
        const bibtexArea = document.getElementById('ref-bibtex');
        if (bibtexArea) bibtexArea.removeAttribute('required');
    } else {
        if (doiSec) doiSec.style.display = 'none';
        if (bibtexSec) bibtexSec.style.display = 'block';
        if (doiBtn) {
            doiBtn.classList.remove('active');
            doiBtn.style.background = 'transparent';
            doiBtn.style.color = 'var(--brand-500)';
            doiBtn.style.boxShadow = 'none';
        }
        if (bibtexBtn) {
            bibtexBtn.classList.add('active');
            bibtexBtn.style.background = '#ffffff';
            bibtexBtn.style.color = 'var(--brand-900)';
            bibtexBtn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        }
        const bibtexArea = document.getElementById('ref-bibtex');
        if (bibtexArea) bibtexArea.setAttribute('required', 'required');
    }
}
window.switchRefInputMode = switchRefInputMode;

function showAddReferenceForm() {
    currentRefId = null;
    document.getElementById('reference-form-title').textContent = 'Add New Reference';
    document.getElementById('ref-id').value = '';
    document.getElementById('ref-doi-input').value = '';
    document.getElementById('ref-description').value = '';
    document.getElementById('ref-key').value = '';
    document.getElementById('ref-bibtex').value = '';
    
    const deleteBtn = document.getElementById('ref-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    document.getElementById('ref-form-error').style.display = 'none';
    
    switchRefInputMode('doi');
    renderReferencesList();
}

function editReference(id) {
    const ref = referencesList.find(r => r.id === id);
    if (!ref) return;
    
    currentRefId = id;
    document.getElementById('reference-form-title').textContent = 'Edit Reference';
    document.getElementById('ref-id').value = ref.id;
    document.getElementById('ref-doi-input').value = '';
    document.getElementById('ref-description').value = ref.description || '';
    document.getElementById('ref-key').value = ref.citation_key || '';
    document.getElementById('ref-bibtex').value = ref.bibtex || '';
    
    const deleteBtn = document.getElementById('ref-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'block';
    document.getElementById('ref-form-error').style.display = 'none';
    
    switchRefInputMode('bibtex');
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
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
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

async function deleteReference(refId) {
    const id = refId || currentRefId;
    if (!id) return;
    if (!await window.confirmDelete("Are you sure you want to delete this reference?")) return;
    
    try {
        const response = await fetch(`/api/references/${id}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        
        if (!response.ok) throw new Error("Failed to delete");
        
        await fetchReferences();
        if (id === currentRefId) {
            showAddReferenceForm();
        }
        updateLatexPreview();
        updateCiteDropdowns();
    } catch (e) {
        console.error("Error deleting reference:", e);
        alert("Failed to delete reference.");
    }
}

// ============================================================
// GLOBAL EXPORTS
// ============================================================

window.openAuthorsModal = openAuthorsModal;
window.closeAuthorsModal = closeAuthorsModal;
window.openImagesModal = openImagesModal;
window.closeImagesModal = closeImagesModal;
window.openReferencesModal = openReferencesModal;
window.closeReferencesModal = closeReferencesModal;
window.editAuthor = editAuthor;
window.deleteAuthor = deleteAuthor;
window.switchTab = function() {};
window.createSection = createSection;
window.createSubsection = createSubsection;
window.deleteSection = deleteSection;
window.selectImage = selectImage;
window.saveImageMeta = saveImageMeta;
window.deleteImage = deleteImage;
window.insertFigureRef = insertFigureRef;
window.showAddReferenceForm = showAddReferenceForm;
window.autoExtractBibTeXKey = autoExtractBibTeXKey;
window.submitReferenceForm = submitReferenceForm;
window.deleteReference = deleteReference;

function cleanContent(html) {
    if (!html) return '';
    const badPhrases = [
        'Skip to main content', 'Accessibility help', 'Accessibility feedback',
        'Sign in', 'AI Mode', 'Insert citation toolbar', 'Insert fig ref toolbar',
    ];
    for (const phrase of badPhrases) {
        if (html.includes(phrase)) return '<p></p>';
    }
    return html;
}

// ============================================================
// RIGHT PANEL TAB SWITCHING
// ============================================================

function switchRightPanelTab(tabName) {
    currentRightPanelTab = tabName;
    document.querySelectorAll('.preview-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.color = 'var(--brand-400)';
        btn.style.borderBottomColor = 'transparent';
    });
    document.querySelectorAll('.right-panel-tab-content').forEach(content => {
        content.style.display = 'none';
    });

    const activeBtn = document.getElementById(`tab-btn-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.color = 'var(--brand-900)';
        activeBtn.style.borderBottomColor = 'var(--brand-950)';
    }

    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.style.display = 'flex';
    }

    const zoomControls = document.getElementById('preview-zoom-controls');
    if (zoomControls) {
        zoomControls.style.display = (tabName === 'preview') ? 'flex' : 'none';
    }

    if (tabName === 'comments') {
        fetchComments();
    }
}
window.switchRightPanelTab = switchRightPanelTab;

// ============================================================
// SELECTION & UNIFIED REFERENCING POPOVER
// ============================================================



function openFloatingCiteMenu(e) {
    e.preventDefault();
    e.stopPropagation();

    const trigger = document.getElementById('floating-cite-trigger');
    const menu = document.getElementById('floating-cite-menu');
    if (trigger && menu) {
        const triggerRect = trigger.getBoundingClientRect();
        menu.style.top = `${triggerRect.bottom + window.scrollY + 4}px`;
        menu.style.left = `${triggerRect.left + window.scrollX - 70}px`;
        menu.style.display = 'flex';
        switchRefMenuTab('cite');
    }
}
window.openFloatingCiteMenu = openFloatingCiteMenu;

function switchRefMenuTab(tabName, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    currentRefMenuTab = tabName;

    document.querySelectorAll('.ref-menu-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.background = 'none';
        tab.style.color = 'var(--brand-600)';
    });

    const activeTab = Array.from(document.querySelectorAll('.ref-menu-tab')).find(tab => tab.onclick.toString().includes(tabName));
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.background = 'var(--brand-950)';
        activeTab.style.color = 'white';
    }

    populateRefMenuList();
}
window.switchRefMenuTab = switchRefMenuTab;

function populateRefMenuList() {
    const list = document.querySelector('.floating-cite-menu .ref-menu-list');
    if (!list) return;
    list.innerHTML = '';

    if (currentRefMenuTab === 'cite') {
        if (referencesList.length === 0) {
            list.innerHTML = '<div style="padding:10px; font-size:11px; color:var(--brand-400); text-align:center;">No citations found.</div>';
            return;
        }
        referencesList.forEach(ref => {
            const btn = document.createElement('button');
            btn.className = 'floating-cite-item';
            btn.onclick = () => insertFloatingCitation(ref.citation_key);
            btn.innerHTML = `
                <span class="cite-key">[${ref.citation_key}]</span>
                <span class="cite-desc">${escapeHtml(ref.description || 'No Description')}</span>
            `;
            list.appendChild(btn);
        });
    } else if (currentRefMenuTab === 'fig') {
        if (imagesData.length === 0) {
            list.innerHTML = '<div style="padding:10px; font-size:11px; color:var(--brand-400); text-align:center;">No figures uploaded.</div>';
            return;
        }
        imagesData.forEach(img => {
            const btn = document.createElement('button');
            btn.className = 'floating-cite-item';
            btn.onclick = () => insertFloatingFigure(img.label);
            btn.innerHTML = `
                <span class="cite-key">${img.label || 'No Label'}</span>
                <span class="cite-desc">${escapeHtml(img.caption || 'Untitled Figure')}</span>
            `;
            list.appendChild(btn);
        });
    } else if (currentRefMenuTab === 'tab') {
        if (tablesList.length === 0) {
            list.innerHTML = '<div style="padding:10px; font-size:11px; color:var(--brand-400); text-align:center;">No tables created.</div>';
            return;
        }
        tablesList.forEach(tab => {
            const btn = document.createElement('button');
            btn.className = 'floating-cite-item';
            btn.onclick = () => insertFloatingTable(tab.label);
            btn.innerHTML = `
                <span class="cite-key">${tab.label || 'No Label'}</span>
                <span class="cite-desc">${escapeHtml(tab.caption || 'Untitled Table')}</span>
            `;
            list.appendChild(btn);
        });
    } else if (currentRefMenuTab === 'eq') {
        // Find equations inside current active editor content
        const editor = editors[activeEditorIdForRef];
        if (!editor) return;
        const html = editor.getHTML();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const text = doc.body.textContent || '';
        const eqLabelRegex = /\\label\{(eq:[^}]+)\}/g;
        let match;
        const foundLabels = [];
        while ((match = eqLabelRegex.exec(text)) !== null) {
            foundLabels.push(match[1]);
        }

        if (foundLabels.length === 0) {
            list.innerHTML = '<div style="padding:10px; font-size:11px; color:var(--brand-400); text-align:center;">No equation labels found. Add equations with \\label{eq:name} first.</div>';
            return;
        }
        foundLabels.forEach(label => {
            const btn = document.createElement('button');
            btn.className = 'floating-cite-item';
            btn.onclick = () => insertFloatingEquation(label);
            btn.innerHTML = `
                <span class="cite-key">${label}</span>
            `;
            list.appendChild(btn);
        });
    } else if (currentRefMenuTab === 'fn') {
        list.innerHTML = `
            <div style="padding: 6px; display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 10px; font-weight: 700; color: var(--brand-500);">Footnote Text</label>
                <textarea id="fn-text-input" style="width: 100%; border: 1px solid var(--brand-200); border-radius: 4px; padding: 4px; font-size: 11px; resize: none; height: 50px; outline: none;" placeholder="e.g. This work was supported by NSF grant X."></textarea>
                <button type="button" class="btn-primary sm" onclick="insertFloatingFootnote()" style="font-size: 10px; text-transform: none; padding: 4px; width: 100%;">Insert Footnote</button>
            </div>
        `;
    } else if (currentRefMenuTab === 'comment') {
        list.innerHTML = `
            <div style="padding: 6px; display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 10px; font-weight: 700; color: var(--brand-500);">Review Comment</label>
                <textarea id="comment-text-input" style="width: 100%; border: 1px solid var(--brand-200); border-radius: 4px; padding: 4px; font-size: 11px; resize: none; height: 50px; outline: none;" placeholder="e.g. Check spelling or rewrite this sentence."></textarea>
                <button type="button" class="btn-primary sm" onclick="insertFloatingComment()" style="font-size: 10px; text-transform: none; padding: 4px; width: 100%; background: #b45309; border-color: #b45309;">Add Comment</button>
            </div>
        `;
    }
}
window.populateRefMenuList = populateRefMenuList;

function restoreRefMenuSelection() {
    const editor = editors[activeEditorIdForRef];
    if (editor && selectedTextRange) {
        editor.chain().focus().setTextSelection({
            from: selectedTextRange.from,
            to: selectedTextRange.to
        }).run();
    }
}

function insertFloatingCitation(citeKey) {
    const editor = editors[activeEditorIdForRef];
    if (!editor) return;
    restoreRefMenuSelection();
    
    const { from, to } = editor.state.selection;
    if (from === to) {
        editor.chain().focus().insertContent(`&nbsp;<span class="ref-chip" data-type="cite" data-label="${citeKey}"></span>`).run();
    } else {
        editor.chain().focus().insertContentAt(to, `&nbsp;<span class="ref-chip" data-type="cite" data-label="${citeKey}"></span>`).run();
    }

    document.getElementById('floating-cite-trigger').style.display = 'none';
    document.getElementById('floating-cite-menu').style.display = 'none';
}
window.insertFloatingCitation = insertFloatingCitation;

function insertFloatingFigure(figLabel) {
    const editor = editors[activeEditorIdForRef];
    if (!editor) return;
    restoreRefMenuSelection();
    
    const { from, to } = editor.state.selection;
    if (from === to) {
        editor.chain().focus().insertContent(`<span class="ref-chip" data-type="ref" data-label="${figLabel}"></span>`).run();
    } else {
        editor.chain().focus().insertContentAt(to, ` <span class="ref-chip" data-type="ref" data-label="${figLabel}"></span>`).run();
    }

    document.getElementById('floating-cite-trigger').style.display = 'none';
    document.getElementById('floating-cite-menu').style.display = 'none';
}
window.insertFloatingFigure = insertFloatingFigure;

function insertFloatingTable(tabLabel) {
    const editor = editors[activeEditorIdForRef];
    if (!editor) return;
    restoreRefMenuSelection();
    
    const { from, to } = editor.state.selection;
    if (from === to) {
        editor.chain().focus().insertContent(`<span class="ref-chip" data-type="ref" data-label="${tabLabel}"></span>`).run();
    } else {
        editor.chain().focus().insertContentAt(to, ` <span class="ref-chip" data-type="ref" data-label="${tabLabel}"></span>`).run();
    }

    document.getElementById('floating-cite-trigger').style.display = 'none';
    document.getElementById('floating-cite-menu').style.display = 'none';
}
window.insertFloatingTable = insertFloatingTable;

function insertFloatingEquation(eqLabel) {
    const editor = editors[activeEditorIdForRef];
    if (!editor) return;
    restoreRefMenuSelection();
    
    const { from, to } = editor.state.selection;
    if (from === to) {
        editor.chain().focus().insertContent(`<span class="ref-chip" data-type="ref" data-label="${eqLabel}"></span>`).run();
    } else {
        editor.chain().focus().insertContentAt(to, ` <span class="ref-chip" data-type="ref" data-label="${eqLabel}"></span>`).run();
    }

    document.getElementById('floating-cite-trigger').style.display = 'none';
    document.getElementById('floating-cite-menu').style.display = 'none';
}
window.insertFloatingEquation = insertFloatingEquation;

function insertFloatingFootnote() {
    const noteText = document.getElementById('fn-text-input').value.trim();
    if (!noteText) return;

    const editor = editors[activeEditorIdForRef];
    if (!editor) return;
    restoreRefMenuSelection();

    const { from, to } = editor.state.selection;
    if (from === to) {
        editor.chain().focus().insertContent(`\\footnote{${noteText}}`).run();
    } else {
        editor.chain().focus().insertContentAt(to, `\\footnote{${noteText}}`).run();
    }

    document.getElementById('floating-cite-trigger').style.display = 'none';
    document.getElementById('floating-cite-menu').style.display = 'none';
}
window.insertFloatingFootnote = insertFloatingFootnote;

async function insertFloatingComment() {
    const commentText = document.getElementById('comment-text-input').value.trim();
    if (!commentText) return;

    const editor = editors[activeEditorIdForRef];
    if (!editor) return;
    restoreRefMenuSelection();

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText) {
        alert("Please select some text to add a review comment to.");
        return;
    }

    try {
        const payload = {
            document: currentDocId,
            section: activeEditorIdForRef,
            text: commentText,
            quote: selectedText
        };
        const response = await fetch('/api/comments/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const comment = await response.json();
            // Wrap selected text inside a mark tag
            editor.chain().focus()
                .setTextSelection({ from, to })
                .deleteSelection()
                .insertContent(`<mark class="comment-highlight" data-comment-id="${comment.id}">${selectedText}</mark>`)
                .run();
            
            // Clean up and load comments
            document.getElementById('floating-cite-trigger').style.display = 'none';
            document.getElementById('floating-cite-menu').style.display = 'none';
            await fetchComments();
        } else {
            alert("Failed to save comment.");
        }
    } catch(e) {
        console.error("Error creating comment:", e);
        alert("Failed to save comment.");
    }
}
window.insertFloatingComment = insertFloatingComment;

// ============================================================
// REVIEW COMMENTS MANAGEMENT
// ============================================================

async function fetchComments() {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/comments/?document=${currentDocId}`);
        commentsList = await response.json();
        renderComments();
    } catch (e) {
        console.error("Error fetching comments:", e);
    }
}
window.fetchComments = fetchComments;

function renderComments() {
    const list = document.getElementById('comments-list');
    if (!list) return;
    list.innerHTML = '';

    const activeComments = commentsList.filter(c => !c.resolved);
    const countEl = document.getElementById('comments-count');
    if (countEl) countEl.textContent = activeComments.length;

    // Also update footer count bubble
    const footerCount = document.querySelector('.preview-comments-btn span');
    if (footerCount) footerCount.textContent = activeComments.length;

    if (activeComments.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px 20px; color:var(--brand-400); font-size:13px;">No active comments. Highlight text in the editor to comment!</div>';
        return;
    }

    activeComments.forEach(comment => {
        const date = new Date(comment.created_at).toLocaleDateString(undefined, {month:'short', day:'numeric'});
        const card = document.createElement('div');
        card.className = 'comment-card';
        card.innerHTML = `
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(comment.author_name)}</span>
                <span class="comment-date">${date}</span>
            </div>
            <div class="comment-quote">"${escapeHtml(comment.quote)}"</div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
            <div class="comment-actions">
                <button type="button" class="comment-btn" onclick="scrollToComment(${comment.section}, ${comment.id})">Go to</button>
                <button type="button" class="comment-btn resolve-btn" onclick="resolveComment(${comment.id})">Resolve</button>
            </div>
        `;
        list.appendChild(card);
    });
}
window.renderComments = renderComments;

function scrollToComment(sectionId, commentId) {
    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Find comment mark element inside the editor of that section and flash it
        const editorEl = target.querySelector(`.comment-highlight[data-comment-id="${commentId}"]`);
        if (editorEl) {
            editorEl.style.backgroundColor = '#fbbf24';
            setTimeout(() => {
                editorEl.style.backgroundColor = '';
            }, 1000);
        }
    }
}
window.scrollToComment = scrollToComment;

async function resolveComment(commentId) {
    if (!await window.confirmDelete("Are you sure you want to resolve this comment and remove its highlight?", "Resolve")) return;

    try {
        const response = await fetch(`/api/comments/${commentId}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });

        if (response.ok || response.status === 204) {
            // Find section that holds this comment highlight
            const comment = commentsList.find(c => c.id === commentId);
            if (comment) {
                const editor = editors[comment.section];
                if (editor) {
                    const html = editor.getHTML();
                    // Replace <mark class="comment-highlight" data-comment-id="commentId">text</mark> with just text
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const mark = tempDiv.querySelector(`mark[data-comment-id="${commentId}"]`);
                    if (mark) {
                        const text = mark.innerHTML;
                        mark.replaceWith(text);
                        // Save changes
                        editor.commands.setContent(tempDiv.innerHTML);
                        saveSection(comment.section, tempDiv.innerHTML);
                    }
                }
            }
            await fetchComments();
            await updateLatexPreview();
        } else {
            alert("Failed to resolve comment.");
        }
    } catch(e) {
        console.error("Error resolving comment:", e);
        alert("Failed to resolve comment.");
    }
}
window.resolveComment = resolveComment;

// ============================================================
// TABLES MANAGEMENT (GRID EDITOR)
// ============================================================

async function openTablesModal() {
    const modal = document.getElementById('tables-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        await fetchTables();
        showAddTableForm();
    }
}
window.openTablesModal = openTablesModal;

function closeTablesModal() {
    const modal = document.getElementById('tables-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    }
}
window.closeTablesModal = closeTablesModal;

async function fetchTables() {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/tables/?document=${currentDocId}`);
        tablesList = await response.json();
        tablesList.sort((a, b) => a.id - b.id);
        renderTablesList();
    } catch(e) {
        console.error("Error fetching tables:", e);
    }
}
window.fetchTables = fetchTables;

async function fetchTablesSilent() {
    if (!currentDocId) return;
    try {
        const response = await fetch(`/api/tables/?document=${currentDocId}`);
        tablesList = await response.json();
        tablesList.sort((a, b) => a.id - b.id);
    } catch(e) {
        console.error("Error fetching tables silently:", e);
    }
}
window.fetchTablesSilent = fetchTablesSilent;

function renderTablesList() {
    const container = document.getElementById('tables-list');
    if (!container) return;
    container.innerHTML = '';

    if (tablesList.length === 0) {
        container.innerHTML = '<p style="color:var(--brand-400); text-align:center; margin-top:20px; font-size:13px;">No tables yet.</p>';
        return;
    }

    tablesList.forEach(tab => {
        const div = document.createElement('div');
        div.className = 'img-thumb-card';
        div.style.cursor = 'pointer';
        div.style.backgroundColor = (currentTableId === tab.id) ? 'var(--brand-50)' : '';
        if (currentTableId === tab.id) {
            div.style.borderColor = 'var(--brand-900)';
        }

        div.onclick = () => editTable(tab.id);

        div.innerHTML = `
            <div class="img-thumb-info">
                <div class="img-thumb-caption" style="font-size:13px;">[${escapeHtml(tab.label)}]</div>
                <div class="img-thumb-label" style="font-family:inherit; color:var(--brand-500);">${escapeHtml(tab.caption || 'No Caption')}</div>
            </div>
            <button class="card-delete-btn" onclick="event.stopPropagation(); deleteTable(${tab.id})" title="Delete">×</button>
        `;
        container.appendChild(div);
    });
}
window.renderTablesList = renderTablesList;

function showAddTableForm() {
    currentTableId = null;
    document.getElementById('table-form-title').textContent = 'Add New Table';
    document.getElementById('table-id').value = '';
    document.getElementById('table-caption').value = '';
    document.getElementById('table-label').value = '';
    
    const styleSelect = document.getElementById('table-style');
    if (styleSelect) styleSelect.value = 'standard';
    
    gridData = [["Header 1", "Header 2"], ["Row 1 Col 1", "Row 1 Col 2"]];
    renderGrid();

    populateTableSectionDropdown(null);
    const deleteBtn = document.getElementById('table-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'none';
    document.getElementById('table-form-error').style.display = 'none';
    renderTablesList();
}
window.showAddTableForm = showAddTableForm;

function populateTableSectionDropdown(selectedSectionId) {
    const sel = document.getElementById('table-section');
    if (!sel) return;

    const sectionEntries = Object.entries(editors).map(([id, ed]) => ({
        id: parseInt(id),
        title: ed.sectionTitle || `Section ${id}`,
    }));

    sel.innerHTML = `<option value="">\u2014 End of document (no specific section) \u2014</option>`
        + sectionEntries.map(s =>
            `<option value="${s.id}" ${parseInt(selectedSectionId) === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`
        ).join('');
}

function renderGrid() {
    const container = document.getElementById('table-grid-container');
    if (!container) return;
    container.innerHTML = '';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    gridData.forEach((row, rIdx) => {
        const tr = document.createElement('tr');
        row.forEach((cell, cIdx) => {
            const cellType = (rIdx === 0) ? 'th' : 'td';
            const el = document.createElement(cellType);
            el.className = (rIdx === 0) ? 'table-grid-header-cell' : 'table-grid-cell';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = cell;
            input.oninput = (e) => {
                gridData[rIdx][cIdx] = e.target.value;
            };

            el.appendChild(input);
            tr.appendChild(el);
        });
        table.appendChild(tr);
    });

    container.appendChild(table);
}
window.renderGrid = renderGrid;

function addGridRow() {
    const cols = gridData[0].length;
    const newRow = Array(cols).fill('');
    gridData.push(newRow);
    renderGrid();
}
window.addGridRow = addGridRow;

function removeGridRow() {
    if (gridData.length > 2) {
        gridData.pop();
        renderGrid();
    }
}
window.removeGridRow = removeGridRow;

function addGridCol() {
    gridData.forEach(row => row.push(''));
    renderGrid();
}
window.addGridCol = addGridCol;

function removeGridCol() {
    if (gridData[0].length > 1) {
        gridData.forEach(row => row.pop());
        renderGrid();
    }
}
window.removeGridCol = removeGridCol;

function editTable(id) {
    const tab = tablesList.find(t => t.id === id);
    if (!tab) return;

    currentTableId = id;
    document.getElementById('table-form-title').textContent = 'Edit Table';
    document.getElementById('table-id').value = tab.id;
    document.getElementById('table-caption').value = tab.caption || '';
    document.getElementById('table-label').value = tab.label || '';

    const styleSelect = document.getElementById('table-style');
    if (styleSelect) styleSelect.value = tab.style || 'standard';

    try {
        gridData = JSON.parse(tab.content);
    } catch(e) {
        gridData = [["Header 1", "Header 2"], ["", ""]];
    }
    renderGrid();

    populateTableSectionDropdown(tab.section);
    const deleteBtn = document.getElementById('table-delete-btn');
    if (deleteBtn) deleteBtn.style.display = 'block';
    document.getElementById('table-form-error').style.display = 'none';
    renderTablesList();
}
window.editTable = editTable;

async function submitTableForm() {
    if (!currentDocId) return;

    const id = document.getElementById('table-id').value;
    const caption = document.getElementById('table-caption').value.trim();
    const label = document.getElementById('table-label').value.trim();
    const sectionEl = document.getElementById('table-section');
    const section = sectionEl && sectionEl.value ? parseInt(sectionEl.value) : null;
    const styleEl = document.getElementById('table-style');
    const style = styleEl ? styleEl.value : 'standard';

    const errDiv = document.getElementById('table-form-error');
    errDiv.style.display = 'none';

    if (!caption || !label) {
        errDiv.textContent = 'Caption and LaTeX Label are required.';
        errDiv.style.display = 'block';
        return;
    }

    const payload = {
        document: currentDocId,
        caption: caption,
        label: label,
        section: section,
        style: style,
        content: JSON.stringify(gridData)
    };

    const isUpdate = !!id;
    const url = isUpdate ? `/api/tables/${id}/` : '/api/tables/';
    const method = isUpdate ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(JSON.stringify(err));
        }

        await fetchTables();
        if (!isUpdate) {
            showAddTableForm();
        }
        await updateLatexPreview();
    } catch (e) {
        console.error("Error saving table:", e);
        errDiv.textContent = 'Error saving table. Verify connection and fields.';
        errDiv.style.display = 'block';
    }
}
window.submitTableForm = submitTableForm;

async function deleteTable(tableId) {
    const id = tableId || currentTableId;
    if (!id) return;
    if (!await window.confirmDelete("Are you sure you want to delete this table?")) return;

    try {
        const response = await fetch(`/api/tables/${id}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });

        if (!response.ok) throw new Error("Delete failed");
        
        await fetchTables();
        if (id === currentTableId) {
            showAddTableForm();
        }
        await updateLatexPreview();
    } catch(e) {
        console.error("Error deleting table:", e);
        alert("Failed to delete table.");
    }
}
window.deleteTable = deleteTable;

// ============================================================
// AI EQUATION HELPER MODAL
// ============================================================

const eqPresets = [
    { name: "Quadratic Formula", math: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", label: "eq:quadratic" },
    { name: "Bayes' Theorem", math: "P(A|B) = \\frac{P(B|A)P(A)}{P(B)}", label: "eq:bayes" },
    { name: "Euler's Identity", math: "e^{i\\pi} + 1 = 0", label: "eq:euler" },
    { name: "Normal Distribution", math: "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}", label: "eq:normal" },
    { name: "Einstein's Relativity", math: "E = m c^2", label: "eq:relativity" },
    { name: "Fourier Transform", math: "\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx", label: "eq:fourier" }
];

function openEquationModal() {
    const modal = document.getElementById('equation-modal');
    if (modal) {
        modal.classList.add('active');
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        switchEquationTab('text');
        renderEqPresets();
        
        // Setup drop zone first time
        const zone = document.getElementById('eq-drop-zone');
        const input = document.getElementById('eq-file-input');
        if (zone && !zone._setupDone) {
            zone._setupDone = true;
            zone.onclick = () => input.click();
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--brand-900)'; });
            zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.style.borderColor = '';
                if (e.dataTransfer.files[0]) processImageToMath(e.dataTransfer.files[0]);
            });
            input.onchange = () => {
                if (input.files[0]) processImageToMath(input.files[0]);
                input.value = '';
            };
        }
    }
}
window.openEquationModal = openEquationModal;

function closeEquationModal() {
    const modal = document.getElementById('equation-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    }
}
window.closeEquationModal = closeEquationModal;

function switchEquationTab(tab) {
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.color = 'var(--brand-500)';
        btn.style.borderBottomColor = 'transparent';
    });
    document.querySelectorAll('.eq-tab-content').forEach(c => c.style.display = 'none');

    const activeBtn = document.getElementById(`eq-tab-btn-${tab}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.color = 'var(--brand-900)';
        activeBtn.style.borderBottomColor = 'var(--brand-950)';
    }
    const activeContent = document.getElementById(`eq-tab-content-${tab}`);
    if (activeContent) activeContent.style.display = 'block';
}
window.switchEquationTab = switchEquationTab;

function renderEqPresets() {
    const grid = document.getElementById('eq-presets-grid');
    if (!grid) return;
    grid.innerHTML = eqPresets.map((preset, idx) => `
        <div class="eq-preset-card" onclick="loadEquationPreset(${idx})">
            <div class="eq-preset-title">${preset.name}</div>
            <div class="eq-preset-math">$$${preset.math}$$</div>
        </div>
    `).join('');
    
    // Auto-render presets in KaTeX
    setTimeout(() => {
        if (window.renderMathInElement) {
            window.renderMathInElement(grid, {
                delimiters: [{left: "$$", right: "$$", display: true}]
            });
        }
    }, 100);
}
window.renderEqPresets = renderEqPresets;

window.loadEquationPreset = function(idx) {
    const preset = eqPresets[idx];
    if (!preset) return;
    showEquationOutput(preset.math, preset.label);
};

function showEquationOutput(latex, label) {
    document.getElementById('eq-latex-output').value = latex;
    document.getElementById('eq-label').value = label || 'eq:new';
    document.getElementById('eq-preview-area').style.display = 'block';
    
    // Render visual preview in KaTeX
    const renderEl = document.getElementById('eq-math-render');
    if (renderEl && window.katex) {
        try {
            window.katex.render(latex, renderEl, { displayMode: true, throwOnError: false });
        } catch(e) {
            renderEl.textContent = latex;
        }
    }
}

async function processTextToMath() {
    const desc = document.getElementById('eq-description').value.trim();
    if (!desc) { alert("Please type a description of the equation."); return; }

    const genBtn = document.querySelector('#eq-tab-content-text button');
    const origText = genBtn.textContent;
    genBtn.textContent = '⏳ Processing...';
    genBtn.disabled = true;

    try {
        const res = await fetch('/api/ai/equation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ description: desc })
        });
        const data = await res.json();
        if (data.latex) {
            showEquationOutput(data.latex, 'eq:ai_generated');
        } else {
            alert('AI Generation failed: ' + (data.error || 'Unknown error'));
        }
    } catch(e) {
        alert('Network error: ' + e.message);
    } finally {
        genBtn.textContent = origText;
        genBtn.disabled = false;
    }
}
window.processTextToMath = processTextToMath;

async function processImageToMath(file) {
    const zone = document.getElementById('eq-drop-zone');
    const origHTML = zone.innerHTML;
    zone.innerHTML = '<div style="padding:20px; color:var(--brand-900);">⏳ Scanning image with AI Gemini...</div>';

    const formData = new FormData();
    formData.append('image', file);

    try {
        const res = await fetch('/api/ai/equation', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCsrfToken() },
            body: formData
        });
        const data = await res.json();
        if (data.latex) {
            showEquationOutput(data.latex, 'eq:scanned');
        } else {
            alert('AI Scanner failed: ' + (data.error || 'Unknown error'));
        }
    } catch(e) {
        alert('Network error: ' + e.message);
    } finally {
        zone.innerHTML = origHTML;
    }
}
window.processImageToMath = processImageToMath;

function insertEquationIntoDoc() {
    const latex = document.getElementById('eq-latex-output').value.trim();
    const label = document.getElementById('eq-label').value.trim();
    
    if (!latex) return;
    
    // Find active section or fallback to first section
    const activeId = lastFocusedEditorId || Object.keys(editors)[0];
    const editor = editors[activeId];
    if (!editor) return;

    const labelStr = label ? ` \\label{${label}}` : '';
    const formulaBlock = `\n\\begin{equation}${labelStr}\n${latex}\n\\end{equation}\n`;
    
    editor.chain().focus().insertContent(formulaBlock).run();
    closeEquationModal();
    updateLatexPreview();
}
window.insertEquationIntoDoc = insertEquationIntoDoc;

// ============================================================
// DOI FETCH
// ============================================================

async function fetchDoiData() {
    const doi = document.getElementById('ref-doi-input').value.trim();
    if (!doi) { alert("Please type or paste a DOI."); return; }

    const btn = document.getElementById('ref-doi-fetch-btn');
    const origText = btn.textContent;
    btn.textContent = '⏳ Fetching...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/references/fetch_doi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ doi: doi })
        });
        const data = await response.json();
        if (data.bibtex) {
            document.getElementById('ref-bibtex').value = data.bibtex;
            autoExtractBibTeXKey(data.bibtex);
            
            // Extract title or journal as description
            const fields = parseBibtexFields(data.bibtex);
            if (fields.title) {
                document.getElementById('ref-description').value = fields.title.replace(/[{}]/g, '');
            }
            
            // Auto-switch to BibTeX tab for inspection
            switchRefInputMode('bibtex');
        } else {
            alert("Fetch failed: " + (data.error || "Could not resolve DOI. Make sure the DOI is valid."));
        }
    } catch(e) {
        alert("Network error: " + e.message);
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
}
window.fetchDoiData = fetchDoiData;

// ============================================================
// BIBTEX PARSER & IEEE FORMATTER HELPERS
// ============================================================

function parseBibtexFields(bibtex) {
    const fields = {};
    if (!bibtex) return fields;
    
    const cleanBib = bibtex.replace(/\s+/g, ' ');
    const typeMatch = cleanBib.match(/@([a-zA-Z]+)\s*\{/);
    if (typeMatch) {
        fields.type = typeMatch[1].toLowerCase();
    }
    
    const fieldRegex = /([a-zA-Z_]+)\s*=\s*(?:\{([^}]*)\}|"([^"]*)"|([0-9a-zA-Z]+))/g;
    let match;
    while ((match = fieldRegex.exec(cleanBib)) !== null) {
        const key = match[1].toLowerCase();
        const value = (match[2] || match[3] || match[4] || '').trim();
        fields[key] = value;
    }
    return fields;
}
window.parseBibtexFields = parseBibtexFields;

function formatBibtexToIEEE(bibtex, fallbackDescription) {
    const fields = parseBibtexFields(bibtex);
    if (!fields.title) {
        return fallbackDescription || 'Untitled Reference';
    }
    
    let formattedAuthors = '';
    if (fields.author) {
        const authorList = fields.author.split(/\s+and\s+/i);
        const formattedList = authorList.map(author => {
            const parts = author.split(',').map(p => p.trim());
            if (parts.length === 2) {
                const firstNames = parts[1].split(/\s+/);
                const initials = firstNames.map(n => n.charAt(0) + '.').join(' ');
                return `${initials} ${parts[0]}`;
            } else {
                const nameParts = author.split(/\s+/);
                if (nameParts.length > 1) {
                    const last = nameParts.pop();
                    const initials = nameParts.map(n => n.charAt(0) + '.').join(' ');
                    return `${initials} ${last}`;
                }
                return author;
            }
        });
        
        if (formattedList.length === 1) {
            formattedAuthors = formattedList[0];
        } else if (formattedList.length === 2) {
            formattedAuthors = `${formattedList[0]} and ${formattedList[1]}`;
        } else if (formattedList.length > 2) {
            formattedAuthors = `${formattedList.slice(0, -1).join(', ')}, and ${formattedList[formattedList.length - 1]}`;
        }
    }
    
    let result = '';
    if (formattedAuthors) {
        result += formattedAuthors + ', ';
    }
    
    const cleanTitle = fields.title.replace(/[{}]/g, '');
    if (fields.type === 'book') {
        result += `<i>${cleanTitle}</i>. `;
    } else {
        result += `"${cleanTitle}," `;
    }
    
    let venue = '';
    if (fields.type === 'article' && fields.journal) {
        venue = `<i>${fields.journal.replace(/[{}]/g, '')}</i>`;
    } else if (fields.type === 'inproceedings' && fields.booktitle) {
        venue = `in <i>${fields.booktitle.replace(/[{}]/g, '')}</i>`;
    } else if (fields.publisher) {
        venue = fields.publisher.replace(/[{}]/g, '');
    }
    
    if (venue) {
        result += venue;
        if (fields.volume) result += `, vol. ${fields.volume}`;
        if (fields.number) result += `, no. ${fields.number}`;
        if (fields.pages) result += `, pp. ${fields.pages}`;
        if (fields.year) result += `, ${fields.year}`;
        result += '.';
    } else if (fields.year) {
        result += `${fields.year}.`;
    }
    
    return result;
}
window.formatBibtexToIEEE = formatBibtexToIEEE;

// ============================================================
// MODIFIED LATEX PREVIEW RENDERING (INCLUDES FIG/TAB/EQ/FN)
// ============================================================



function convertLatexToHTML(latex) {
    let html = '';

    // 1. Build Citation Map
    const citationMap = new Map();
    let citationCount = 0;
    const citeRegex = /\\cite\{([^}]+)\}/g;
    let citeMatch;
    while ((citeMatch = citeRegex.exec(latex)) !== null) {
        const keys = citeMatch[1].split(',').map(k => k.trim());
        keys.forEach(key => {
            if (!citationMap.has(key)) {
                citationCount++;
                citationMap.set(key, citationCount);
            }
        });
    }

    // 2. Build Figure, Table, and Equation Reference Maps
    const figMap = new Map();
    let figCount = 0;
    const tabMap = new Map();
    let tabCount = 0;
    const eqMap = new Map();
    let eqCount = 0;

    const figLabelRegex = /\\begin\{figure\}[\s\S]*?\\label\{([^}]+)\}[\s\S]*?\\end\{figure\}/g;
    let figLabelMatch;
    while ((figLabelMatch = figLabelRegex.exec(latex)) !== null) {
        const label = figLabelMatch[1].trim();
        if (!figMap.has(label)) {
            figCount++;
            figMap.set(label, figCount);
        }
    }

    const tabLabelRegex = /\\begin\{table\}[\s\S]*?\\label\{([^}]+)\}[\s\S]*?\\end\{table\}/g;
    let tabLabelMatch;
    while ((tabLabelMatch = tabLabelRegex.exec(latex)) !== null) {
        const label = tabLabelMatch[1].trim();
        if (!tabMap.has(label)) {
            tabCount++;
            tabMap.set(label, tabCount);
        }
    }

    const eqLabelRegex = /\\label\{(eq:[^}]+)\}/g;
    let eqLabelMatch;
    while ((eqLabelMatch = eqLabelRegex.exec(latex)) !== null) {
        const label = eqLabelMatch[1].trim();
        if (!eqMap.has(label)) {
            eqCount++;
            eqMap.set(label, eqCount);
        }
    }

    // 3. Scan for Footnotes
    const footnoteMap = [];
    const fnRegex = /\\footnote\{([^}]+)\}/g;
    let fnCount = 0;
    let processedLatex = latex.replace(fnRegex, (match, noteText) => {
        fnCount++;
        footnoteMap.push({ num: fnCount, text: noteText.trim() });
        return `<sup>[${fnCount}]</sup>`;
    });

    // 4. Resolve references in processedLatex
    processedLatex = processedLatex.replace(/~?\\cite\{([^}]+)\}/g, (match, keyStr) => {
        const keys = keyStr.split(',').map(k => k.trim());
        const numbers = keys.map(key => citationMap.has(key) ? citationMap.get(key) : '?');
        const space = match.startsWith('~') ? '&nbsp;' : '';
        return `${space}[${numbers.join(', ')}]`;
    });

    processedLatex = processedLatex.replace(/\\ref\{([^}]+)\}/g, (match, label) => {
        const cleanLabel = label.trim();
        if (figMap.has(cleanLabel)) {
            return figMap.get(cleanLabel);
        } else if (tabMap.has(cleanLabel)) {
            return toRoman(tabMap.get(cleanLabel));
        } else if (eqMap.has(cleanLabel)) {
            return `(${eqMap.get(cleanLabel)})`;
        }
        return '?';
    });

    // Render title
    const titleMatch = processedLatex.match(/\\title\{([^}]+)\}/);
    if (titleMatch) {
        html += `<h1 class="title">${escapeHtml(titleMatch[1])}</h1>`;
    }

    // Render authors
    const authorRegex = /\\IEEEauthorblockN\{([^}]+)\}\s*\\IEEEauthorblockA\{([\s\S]*?)\}(?=\\and|\\author|\s*\})/g;
    let authorMatch;
    const authorBlocks = [];
    while ((authorMatch = authorRegex.exec(processedLatex)) !== null) {
        const name = authorMatch[1].trim();
        const affiliation = authorMatch[2].trim().split('\\\\').map(a => a.trim()).filter(Boolean);
        authorBlocks.push({ name, affiliation });
    }

    if (authorBlocks.length > 0) {
        html += `<div style="display: flex; justify-content: center; gap: 40px; margin-bottom: 20pt; text-align: center; font-size: 10pt; text-indent: 0; flex-wrap: wrap;">`;
        authorBlocks.forEach(ab => {
            html += `<div style="flex: 1; min-width: 140px; text-indent: 0;">`;
            html += `<div style="font-weight: bold; margin-bottom: 2px;">${escapeHtml(ab.name)}</div>`;
            ab.affiliation.forEach(line => {
                html += `<div style="font-style: italic; color: #333; font-size: 9pt; line-height: 11pt;">${escapeHtml(line)}</div>`;
            });
            html += `</div>`;
        });
        html += `</div>`;
    }

    html += `<div class="body">`;

    // Render abstract
    const abstractMatch = processedLatex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
    if (abstractMatch) {
        const abstractText = abstractMatch[1].trim();
        html += `<div class="abstract" style="text-indent: 0; margin-bottom: 12pt;">`;
        html += `<span class="abstract-label" style="font-weight: bold; font-style: italic;">Abstract—</span>`;
        html += `<span class="abstract-text" style="font-weight: bold; font-style: italic;">${escapeHtml(abstractText)}</span>`;
        html += `</div>`;
    }

    // Render index terms
    const keywordsMatch = processedLatex.match(/\\begin\{IEEEkeywords\}([\s\S]*?)\\end\{IEEEkeywords\}/);
    if (keywordsMatch) {
        const keywordsText = keywordsMatch[1].trim();
        html += `<div class="keywords" style="text-indent: 0; margin-bottom: 12pt;">`;
        html += `<span class="keywords-label" style="font-weight: bold; font-style: italic;">Keywords—</span>`;
        html += `<span class="keywords-text" style="font-weight: bold; font-style: italic;">${escapeHtml(keywordsText)}</span>`;
        html += `</div>`;
    }

    // Parse sections
    const sectionRegex = /\\(section|subsection|subsubsection)\{([^}]+)\}([\s\S]*?)(?=\\(section|subsection|subsubsection)\{|\\bibliographystyle|\\end\{document\})/g;
    let sectionMatch;
    let sectionCount = 0;
    let subSectionCount = 0;
    let subSubSectionCount = 0;

    while ((sectionMatch = sectionRegex.exec(processedLatex)) !== null) {
        const type = sectionMatch[1];
        const title = sectionMatch[2];
        let content = sectionMatch[3].trim();

        // Parse figures inside section content
        content = content.replace(/\\begin\{figure\}([\s\S]*?)\\end\{figure\}/g, (match, figBody) => {
            const labelMatch = figBody.match(/\\label\{([^}]+)\}/);
            const captionMatch = figBody.match(/\\caption\{([^}]+)\}/);
            const label = labelMatch ? labelMatch[1].trim() : '';
            const caption = captionMatch ? captionMatch[1].trim() : '';
            const num = figMap.get(label) || '?';
            
            const matchingImg = imagesData.find(img => img.label === label);
            const imgSrc = matchingImg ? matchingImg.image_url : '';
            
            return `
            <div class="preview-figure" style="text-align: center; margin: 12pt 0; text-indent: 0; page-break-inside: avoid;">
                ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" style="max-width: 100%; max-height: 200px; display: block; margin: 0 auto 6px;">` : `<div style="border: 1px dashed var(--brand-300); padding: 20px; background: #fafafa; display: inline-block; max-width: 90%; font-size: 8pt; color: #666; margin-bottom: 6px;">[Figure ${num}]</div>`}
                <div style="font-size: 8pt; line-height: 11pt; font-family: sans-serif; text-align: center; font-weight: normal; margin-top: 4px;">Fig. ${num}. ${escapeHtml(caption)}</div>
            </div>
            `;
        });

        // Parse tables inside section content
        content = content.replace(/\\begin\{table\}([\s\S]*?)\\end\{table\}/g, (match, tableBody) => {
            const labelMatch = tableBody.match(/\\label\{([^}]+)\}/);
            const captionMatch = tableBody.match(/\\caption\{([^}]+)\}/);
            const label = labelMatch ? labelMatch[1].trim() : '';
            const caption = captionMatch ? captionMatch[1].trim() : '';
            const num = tabMap.get(label) || '?';
            const romanNum = toRoman(num);
            
            const matchingTab = tablesList.find(t => t.label === label);
            let tableHtml = '';
            if (matchingTab) {
                try {
                    const grid = JSON.parse(matchingTab.content);
                    const styleVal = matchingTab.style || 'standard';
                    
                    let tableStyles = 'margin: 0 auto; border-collapse: collapse; font-size: 8pt; line-height: 11pt; width: 90%;';
                    if (styleVal === 'booktabs' || styleVal === 'minimal') {
                        tableStyles += 'border-top: 1.5px solid black; border-bottom: 1.5px solid black;';
                    } else if (styleVal === 'standard') {
                        tableStyles += 'border: 1px solid black;';
                    } else if (styleVal === 'no_vertical') {
                        tableStyles += 'border-top: 1px solid black; border-bottom: 1px solid black;';
                    }

                    tableHtml += `<table style="${tableStyles}">`;
                    grid.forEach((row, rIdx) => {
                        let rowStyles = '';
                        if (styleVal === 'booktabs' && rIdx === 0) {
                            rowStyles = 'border-bottom: 1px solid black;';
                        } else if (styleVal === 'no_vertical') {
                            rowStyles = 'border-bottom: 1px solid black;';
                        } else if (styleVal === 'standard') {
                            rowStyles = 'border-bottom: 1px solid black;';
                        }
                        
                        tableHtml += `<tr style="${rowStyles}">`;
                        row.forEach(cell => {
                            let cellStyles = `padding: 4px 6px; text-align: center; ${rIdx === 0 ? 'font-weight: bold; text-transform: uppercase;' : ''}`;
                            if (styleVal === 'standard') {
                                cellStyles += 'border-right: 1px solid black; border-left: 1px solid black;';
                            }
                            tableHtml += `<td style="${cellStyles}">${escapeHtml(cell)}</td>`;
                        });
                        tableHtml += `</tr>`;
                    });
                    tableHtml += `</table>`;
                } catch(e) {
                    tableHtml = `<div style="color:red; font-size: 8pt;">[Table ${romanNum} Data Error]</div>`;
                }
            } else {
                tableHtml = `<div style="border: 1px dashed var(--brand-300); padding: 10px; background: #fafafa; display: inline-block; font-size: 8pt; color: #666;">[Table ${romanNum}]</div>`;
            }
            
            return `
            <div class="preview-table" style="text-align: center; margin: 12pt 0; text-indent: 0; page-break-inside: avoid;">
                <div style="font-size: 8pt; font-family: sans-serif; text-transform: uppercase; margin-bottom: 6px; text-align: center; letter-spacing: 0.05em;">TABLE ${romanNum}<br><span style="text-transform: none; font-style: italic;">${escapeHtml(caption)}</span></div>
                ${tableHtml}
            </div>
            `;
        });

        content = content.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
        content = content.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');

        const paragraphs = content.split(/\n\n+/);

        if (type === 'section') {
            sectionCount++;
            subSectionCount = 0;
            subSubSectionCount = 0;
            const romanSectionNum = toRoman(sectionCount);
            html += `<div class="section-title" style="font-size: 10pt; font-weight: bold; text-align: center; margin: 16pt 0 8pt 0; text-transform: uppercase; letter-spacing: 0.05em; text-indent: 0; page-break-after: avoid;">${romanSectionNum}. ${escapeHtml(title)}</div>`;
        } else if (type === 'subsection') {
            subSectionCount++;
            subSubSectionCount = 0;
            const letter = String.fromCharCode(64 + subSectionCount);
            html += `<div style="font-size: 10pt; font-style: italic; font-weight: normal; text-align: left; margin: 12pt 0 6pt 0; text-indent: 0; page-break-after: avoid;">${letter}. ${escapeHtml(title)}</div>`;
        } else {
            subSubSectionCount++;
            html += `<div style="font-size: 10pt; font-style: italic; font-weight: normal; text-align: left; margin: 10pt 0 4pt 0; text-indent: 0; display: inline; margin-right: 6px; page-break-after: avoid;">${subSubSectionCount}) ${escapeHtml(title)}:</div>`;
        }

        paragraphs.forEach((para, pIdx) => {
            if (para.trim()) {
                const textIndent = (pIdx === 0 && type !== 'section' && type !== 'subsection') ? '0' : '0.175in';
                html += `<p style="margin: 0; text-indent: ${textIndent}; line-height: 12pt; text-align: justify; margin-bottom: 4px;">${para.trim()}</p>`;
            }
        });
    }

    html += `</div>`;

    // 5. Append Footnotes at the bottom
    if (footnoteMap.length > 0) {
        html += `<hr style="margin-top: 24px; border: 0.5px solid black; width: 30%; margin-left: 0; text-indent: 0;">`;
        html += `<div class="footnotes-list" style="font-size: 8pt; line-height: 11pt; text-indent: 0; margin-top: 6px;">`;
        footnoteMap.forEach(fn => {
            html += `<div id="fn-${fn.num}" style="margin-bottom: 4px; text-indent: 0; display: flex; gap: 4px; text-align: justify;">`;
            html += `<div style="font-size: 8pt; font-weight: bold; min-width: 15px;">[${fn.num}]</div>`;
            html += `<div style="flex: 1;">${escapeHtml(fn.text)}</div>`;
            html += `</div>`;
        });
        html += `</div>`;
    }

    // 6. Append References bibliography
    if (citationMap.size > 0) {
        html += `<div style="font-size: 10pt; font-weight: bold; text-align: center; margin: 20pt 0 10pt 0; text-transform: uppercase; letter-spacing: 0.05em; text-indent: 0; page-break-after: avoid;">References</div>`;
        html += `<div class="references-list" style="margin-top: 12pt; text-indent: 0;">`;
        for (const [key, num] of citationMap.entries()) {
            const ref = referencesList.find(r => r.citation_key === key);
            const formatted = ref ? formatBibtexToIEEE(ref.bibtex, ref.description) : `Unknown reference: ${key}`;
            html += `<div class="reference-item" style="display: flex; gap: 8px; margin-bottom: 8px; font-size: 8pt; line-height: 11pt; text-align: left; text-indent: 0; page-break-inside: avoid;">`;
            html += `<div style="min-width: 20px; text-align: right; text-indent: 0;">[${num}]</div>`;
            html += `<div style="flex: 1; text-indent: 0;">${formatted}</div>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    return html;
}

// Global window mappings
window.openAuthorsModal = openAuthorsModal;
window.closeAuthorsModal = closeAuthorsModal;
window.openImagesModal = openImagesModal;
window.closeImagesModal = closeImagesModal;
window.openReferencesModal = openReferencesModal;
window.closeReferencesModal = closeReferencesModal;
window.editAuthor = editAuthor;
window.deleteAuthor = deleteAuthor;
window.switchTab = function() {};
window.createSection = createSection;
window.createSubsection = createSubsection;
window.deleteSection = deleteSection;
window.selectImage = selectImage;
window.saveImageMeta = saveImageMeta;
window.deleteImage = deleteImage;
window.insertFigureRef = insertFigureRef;
window.showAddReferenceForm = showAddReferenceForm;
window.autoExtractBibTeXKey = autoExtractBibTeXKey;
window.submitReferenceForm = submitReferenceForm;
window.deleteReference = deleteReference;

// Tables window mapping
window.openTablesModal = openTablesModal;
window.closeTablesModal = closeTablesModal;
window.showAddTableForm = showAddTableForm;
window.editTable = editTable;
window.submitTableForm = submitTableForm;
window.deleteTable = deleteTable;
window.addGridRow = addGridRow;
window.removeGridRow = removeGridRow;
window.addGridCol = addGridCol;
window.removeGridCol = removeGridCol;

// Equation window mapping
window.openEquationModal = openEquationModal;
window.closeEquationModal = closeEquationModal;
window.switchEquationTab = switchEquationTab;
window.processTextToMath = processTextToMath;
window.processImageToMath = processImageToMath;
window.insertEquationIntoDoc = insertEquationIntoDoc;

// Comments window mapping
window.scrollToComment = scrollToComment;
window.resolveComment = resolveComment;
window.switchRefMenuTab = switchRefMenuTab;
window.insertFloatingFootnote = insertFloatingFootnote;
window.insertFloatingComment = insertFloatingComment;
window.refreshPdfPreview = refreshPdfPreview;


window._realHandleCredentialResponse = async function(response) {
    try {
        const res = await fetch('/api/auth/google/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ token: response.credential })
        });
        const data = await res.json();
        if (data.success) {
            window.location.reload();
        } else {
            alert("Authentication failed: " + data.error);
        }
    } catch (e) {
        console.error("Auth error:", e);
    }
};

if (window._pendingGoogleResponse) {
    window._realHandleCredentialResponse(window._pendingGoogleResponse);
}
// ============================================================
// DASHBOARD & PROFILE LOGIC
// ============================================================

window.toggleHeaderVisibility = function(isDashboard) {
    const divider = document.getElementById('header-divider');
    const docInfo = document.getElementById('header-doc-info');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (divider) divider.style.display = isDashboard ? 'none' : 'block';
    if (docInfo) docInfo.style.display = isDashboard ? 'none' : 'flex';
    if (sidebarToggle) sidebarToggle.style.visibility = isDashboard ? 'hidden' : 'visible';
};

window.loadDashboard = async function() {
    document.getElementById('editor-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'flex';
    if(typeof toggleHeaderVisibility === 'function') toggleHeaderVisibility(true);
    
    // Hide share UI when on dashboard
    const shareBtn = document.getElementById('share-doc-btn');
    if (shareBtn) shareBtn.style.display = 'none';
    const collabAvatars = document.getElementById('collab-avatars-group');
    if (collabAvatars) collabAvatars.style.display = 'none';
    
    stopHeartbeat();
    
    // Autofill feedback form if user profile is available
    if (window.userProfile) {
        const feedbackName = document.getElementById('feedback-name');
        const feedbackEmail = document.getElementById('feedback-email');
        if (feedbackName && !feedbackName.value) {
            feedbackName.value = `${userProfile.first_name} ${userProfile.last_name}`.trim() || userProfile.username || '';
        }
        if (feedbackEmail && !feedbackEmail.value) {
            feedbackEmail.value = userProfile.email || '';
        }
    }
    
    try {
        const response = await fetch('/api/documents/');
        const docs = await response.json();
        
        const grid = document.getElementById('dashboard-grid');
        grid.innerHTML = '';
        
        docs.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'document-card';
            card.onclick = () => {
                document.getElementById('dashboard-view').style.display = 'none';
                document.getElementById('editor-view').style.display = 'flex';
                if(typeof toggleHeaderVisibility === 'function') toggleHeaderVisibility(false);
                loadDocument(doc.id);
            };
            
            const isShared = doc.user && userProfile && doc.user.id !== userProfile.id;
            const sharedBadge = isShared ? `<span style="font-size: 10px; font-weight:600; padding: 2px 6px; background:#eff6ff; color:#3b82f6; border-radius:4px; margin-left: 8px;">Shared</span>` : '';
            
            const dateStr = new Date(doc.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            
            card.innerHTML = `
                <div>
                    <h3 class="doc-card-title">${escapeHtml(doc.title) || 'Untitled Paper'}${sharedBadge}</h3>
                    <div class="doc-card-meta">${escapeHtml(doc.index_terms) || 'No tags'}</div>
                </div>
                <div class="doc-card-footer">
                    <span class="doc-card-date">Last modified: ${dateStr}</span>
                    <div class="doc-card-actions">
                        ${!isShared ? `
                        <button class="doc-card-btn delete" onclick="event.stopPropagation(); window.deleteDocument(${doc.id}, '${doc.title.replace(/'/g, "\\'")}')" title="Delete Paper">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to load dashboard:", e);
    }
};

window.createNewDocument = async function() {
    try {
        const title = await window.customPrompt("New Paper", "Paper Title", "e.g. A Study on Neural Networks", "Create");
        if (!title) return;
        
        const response = await fetch('/api/documents/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ title })
        });
        
        if (response.ok) {
            const doc = await response.json();
            document.getElementById('dashboard-view').style.display = 'none';
            document.getElementById('editor-view').style.display = 'flex';
            if(typeof toggleHeaderVisibility === 'function') toggleHeaderVisibility(false);
            loadDocument(doc.id);
        }
    } catch (e) {
        console.error("Failed to create document:", e);
    }
};

window.deleteDocument = async function(id, title) {
    const confirm = await window.confirmDelete(`Are you sure you want to delete "${title}"?`, 'Delete');
    if (!confirm) return;
    
    try {
        await fetch(`/api/documents/${id}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        loadDashboard();
    } catch (e) {
        console.error("Failed to delete document:", e);
    }
};

window.openProfileModal = function() {
    if (!userProfile) return;
    document.getElementById('modal-user-name').textContent = `${userProfile.first_name} ${userProfile.last_name}`;
    document.getElementById('modal-user-email').textContent = userProfile.email;
    document.getElementById('dpdp-processing-check').checked = userProfile.dpdp_consent_processing;
    document.getElementById('dpdp-comm-check').checked = userProfile.dpdp_consent_communication;
    
    document.getElementById('profile-modal').classList.add('active');
};

window.closeProfileModal = function() {
    document.getElementById('profile-modal').classList.remove('active');
};

window.saveProfileSettings = async function() {
    const processing = document.getElementById('dpdp-processing-check').checked;
    const comm = document.getElementById('dpdp-comm-check').checked;
    
    try {
        const response = await fetch('/api/auth/profile/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                dpdp_consent_processing: processing,
                dpdp_consent_communication: comm
            })
        });
        if (response.ok) {
            userProfile.dpdp_consent_processing = processing;
            userProfile.dpdp_consent_communication = comm;
        }
    } catch (e) {
        console.error("Failed to update profile settings:", e);
    }
};

window.acceptMandatoryConsent = async function() {
    const processing = document.getElementById('mandatory-dpdp-check').checked;
    if (!processing) {
        alert("You must consent to the privacy policy to use the application.");
        return;
    }
    
    try {
        const response = await fetch('/api/auth/profile/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                dpdp_consent_processing: true,
                dpdp_consent_communication: false
            })
        });
        if (response.ok) {
            document.getElementById('mandatory-consent-modal').classList.remove('active');
            userProfile.dpdp_consent_processing = true;
            loadDashboard();
        }
    } catch (e) {
        console.error("Failed to update mandatory consent:", e);
    }
};

window.logoutUser = async function() {
    try {
        await fetch('/api/auth/logout/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        window.location.reload();
    } catch (e) {
        console.error("Logout failed:", e);
    }
};

window.promptAccountDeletion = async function() {
    const confirm = await window.confirmDelete("Are you sure you want to permanently erase your account and ALL data? This action cannot be undone.", "Delete");
    if (!confirm) return;
    
    try {
        await fetch('/api/auth/delete_account/', {
            method: 'POST',
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        window.location.reload();
    } catch (e) {
        console.error("Account deletion failed:", e);
    }
};

window.openPrivacyModal = function() {
    document.getElementById('privacy-policy-modal').classList.add('active');
};
window.closePrivacyModal = function() {
    document.getElementById('privacy-policy-modal').classList.remove('active');
};

/* ============================================================
   PRICING & PAYMENTS LOGIC
   ============================================================ */

window.openPricingModal = async function() {
    document.getElementById('pricing-modal').style.display = 'flex';
    document.getElementById('ui-credit-balance').textContent = 'Loading...';
    try {
        const res = await fetch('/api/payments/credits/', {
            headers: { 'X-CSRFToken': getCsrfToken() }
        });
        if (res.ok) {
            const data = await res.json();
            document.getElementById('ui-credit-balance').textContent = data.remaining;
        } else {
            document.getElementById('ui-credit-balance').textContent = 'Error';
        }
    } catch (e) {
        document.getElementById('ui-credit-balance').textContent = 'Error';
    }
};

window.closePricingModal = function() {
    document.getElementById('pricing-modal').style.display = 'none';
};

window.redeemCode = async function() {
    const code = document.getElementById('redeem-code-input').value.trim();
    const msgEl = document.getElementById('redeem-message');
    if (!code) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#ef4444';
        msgEl.textContent = 'Please enter a code.';
        return;
    }
    
    try {
        const res = await fetch('/api/payments/redeem/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken() 
            },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        
        msgEl.style.display = 'block';
        if (res.ok && data.success) {
            msgEl.style.color = '#10b981';
            msgEl.textContent = `Success! ${data.credits_added} credits added.`;
            document.getElementById('ui-credit-balance').textContent = data.remaining;
            document.getElementById('redeem-code-input').value = '';
        } else {
            msgEl.style.color = '#ef4444';
            msgEl.textContent = data.error || 'Failed to redeem code.';
        }
    } catch (e) {
        msgEl.style.display = 'block';
        msgEl.style.color = '#ef4444';
        msgEl.textContent = 'Network error.';
    }
};

window.toggleContactForm = function() {
    const container = document.getElementById('contact-form-container');
    container.style.display = container.style.display === 'none' ? 'block' : 'none';
};

window.submitContactForm = async function() {
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const institution = document.getElementById('contact-institution').value;
    const message = document.getElementById('contact-message').value;
    
    if (!name || !email || !institution || !message) {
        alert("Please fill all fields");
        return;
    }
    
    try {
        const res = await fetch('/api/payments/contact/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken() 
            },
            body: JSON.stringify({ name, email, institution, message })
        });
        if (res.ok) {
            alert("Request sent successfully! Our team will contact you soon.");
            toggleContactForm();
            document.getElementById('contact-message').value = '';
        } else {
            alert("Failed to send request.");
        }
    } catch (e) {
        alert("Network error.");
    }
};

// Check for payment status in URL on load
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('payment')) {
        const status = urlParams.get('payment');
        if (status === 'success') {
            // Optional: call showToast if you have it
            openPricingModal();
        } else if (status === 'failed') {
            alert('Payment failed or cancelled.');
        }
        
        // Clean URL
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({path:newUrl}, '', newUrl);
    }
});

window.submitDashboardFeedback = async function(event) {
    event.preventDefault();
    
    const name = document.getElementById('feedback-name').value;
    const email = document.getElementById('feedback-email').value;
    const institution = document.getElementById('feedback-institution').value;
    const message = document.getElementById('feedback-message').value;
    const statusMsg = document.getElementById('feedback-status-msg');
    
    if (!name || !email || !institution || !message) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#ef4444';
        statusMsg.style.background = '#fef2f2';
        statusMsg.textContent = 'Please fill out all fields.';
        return;
    }
    
    try {
        const res = await fetch('/api/payments/contact/', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken() 
            },
            body: JSON.stringify({ name, email, institution, message })
        });
        
        statusMsg.style.display = 'block';
        if (res.ok) {
            statusMsg.style.color = '#10b981';
            statusMsg.style.background = '#ecfdf5';
            statusMsg.textContent = 'Thank you for your feedback!';
            document.getElementById('feedback-message').value = '';
            document.getElementById('feedback-institution').value = '';
        } else {
            statusMsg.style.color = '#ef4444';
            statusMsg.style.background = '#fef2f2';
            statusMsg.textContent = 'Failed to submit feedback. Please try again.';
        }
    } catch (e) {
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#ef4444';
        statusMsg.style.background = '#fef2f2';
        statusMsg.textContent = 'Network error. Please check your connection.';
    }
};

// ============================================================
// COLLABORATIVE EDITING & PRESENCE LOGIC
// ============================================================

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, 5000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

async function sendHeartbeat() {
    if (!currentDocId) return;
    try {
        const res = await fetch(`/api/documents/${currentDocId}/heartbeat/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
        if (!res.ok) return;
        
        const data = await res.json();
        renderCollaboratorAvatars(data.active_users);
        updateSectionLocks(data.locks);
    } catch (e) {
        console.error("Heartbeat error:", e);
    }
}

function renderCollaboratorAvatars(users) {
    const container = document.getElementById('collab-avatars-group');
    if (!container) return;
    
    // Filter out self so we only show others
    const otherUsers = users.filter(u => u.email !== userProfile.email);
    
    if (otherUsers.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    
    container.style.display = 'flex';
    container.innerHTML = otherUsers.map((user, idx) => {
        const initials = user.first_name ? user.first_name[0] + (user.last_name ? user.last_name[0] : '') : user.email[0].toUpperCase();
        const fullName = `${user.first_name} ${user.last_name}`.trim() || user.username;
        const colorClass = `collab-avatar-${(idx % 5) + 1}`;
        return `<div class="collab-avatar ${colorClass}" title="${escapeHtml(fullName)} (${escapeHtml(user.email)})">${escapeHtml(initials)}</div>`;
    }).join('');
}

function updateSectionLocks(locks) {
    activeLocks = locks || {};
    
    for (const [sectionId, editor] of Object.entries(editors)) {
        const wrapper = document.getElementById(`section-${sectionId}`);
        if (!wrapper) continue;
        
        const lockInfo = activeLocks[sectionId];
        
        if (lockInfo && lockInfo.email !== userProfile.email) {
            // Locked by someone else
            if (!wrapper.classList.contains('locked')) {
                wrapper.classList.add('locked');
                editor.setEditable(false);
            }
            
            let banner = wrapper.querySelector('.section-lock-banner');
            if (!banner) {
                banner = document.createElement('div');
                banner.className = 'section-lock-banner';
                banner.innerHTML = `
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block; margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span>${escapeHtml(lockInfo.name)} is editing</span>
                `;
                wrapper.appendChild(banner);
            } else {
                banner.querySelector('span').textContent = `${lockInfo.name} is editing`;
            }
            
            const titleInput = wrapper.querySelector('.section-title-input');
            if (titleInput) titleInput.disabled = true;
        } else {
            // Unlocked or locked by self
            if (wrapper.classList.contains('locked')) {
                wrapper.classList.remove('locked');
                editor.setEditable(true);
                
                const banner = wrapper.querySelector('.section-lock-banner');
                if (banner) banner.remove();
            }
            
            const titleInput = wrapper.querySelector('.section-title-input');
            if (titleInput) titleInput.disabled = false;
        }
    }
}

async function acquireSectionLock(sectionId) {
    if (!currentDocId) return;
    try {
        const res = await fetch(`/api/sections/${sectionId}/lock/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
        if (res.status === 423) {
            // Locked by someone else
            const data = await res.json();
            const editor = editors[sectionId];
            if (editor) {
                editor.setEditable(false);
                const wrapper = document.getElementById(`section-${sectionId}`);
                if (wrapper) {
                    wrapper.classList.add('locked');
                    let banner = wrapper.querySelector('.section-lock-banner');
                    if (!banner) {
                        banner = document.createElement('div');
                        banner.className = 'section-lock-banner';
                        banner.innerHTML = `
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:block; margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            <span>Locked</span>
                        `;
                        wrapper.appendChild(banner);
                    }
                }
            }
        } else if (res.ok) {
            // Successfully locked
            const wrapper = document.getElementById(`section-${sectionId}`);
            if (wrapper && wrapper.classList.contains('locked')) {
                wrapper.classList.remove('locked');
                const banner = wrapper.querySelector('.section-lock-banner');
                if (banner) banner.remove();
                const editor = editors[sectionId];
                if (editor) editor.setEditable(true);
            }
        }
    } catch (e) {
        console.error("Lock error:", e);
    }
}

async function releaseSectionLock(sectionId) {
    if (!currentDocId) return;
    try {
        await fetch(`/api/sections/${sectionId}/unlock/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            }
        });
    } catch (e) {
        console.error("Unlock error:", e);
    }
}

window.openShareModal = async function() {
    const modal = document.getElementById('share-modal');
    if (!modal) return;
    modal.classList.add('active');
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
    document.getElementById('share-email-input').value = '';
    document.getElementById('share-error').style.display = 'none';
    await loadCollaborators();
};

window.closeShareModal = function() {
    const modal = document.getElementById('share-modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.opacity = '0';
        modal.style.pointerEvents = 'none';
    }
};

async function loadCollaborators() {
    if (!currentDocId) return;
    try {
        const docRes = await fetch(`/api/documents/${currentDocId}/`);
        const doc = await docRes.json();
        const isOwner = doc.user && userProfile && doc.user.id === userProfile.id;
        
        const collabRes = await fetch(`/api/documents/${currentDocId}/collaborators/`);
        const collabs = await collabRes.json();
        
        const listContainer = document.getElementById('share-collabs-list');
        if (!listContainer) return;
        
        const ownerName = doc.user ? `${doc.user.first_name} ${doc.user.last_name}`.trim() || doc.user.username : 'Unknown';
        const ownerEmail = doc.user ? doc.user.email : '';
        
        let html = `
            <div class="share-collab-item">
                <div class="collab-info">
                    <span style="font-weight:600;">${escapeHtml(ownerName)}</span>
                    <span class="collab-email">${escapeHtml(ownerEmail)}</span>
                </div>
                <span class="owner-badge">Owner</span>
            </div>
        `;
        
        collabs.forEach(collab => {
            const fullName = `${collab.first_name} ${collab.last_name}`.trim() || collab.username;
            html += `
                <div class="share-collab-item">
                    <div class="collab-info">
                        <span style="font-weight:600;">${escapeHtml(fullName)}</span>
                        <span class="collab-email">${escapeHtml(collab.email)}</span>
                    </div>
                    ${isOwner ? `<button class="btn-remove" onclick="removeCollaborator('${escapeHtml(collab.email)}')">Remove</button>` : ''}
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
    } catch (e) {
        console.error("Failed to load collaborators:", e);
    }
}

window.addCollaborator = async function() {
    const emailInput = document.getElementById('share-email-input');
    const email = emailInput.value.trim();
    const errorEl = document.getElementById('share-error');
    
    if (!email) return;
    errorEl.style.display = 'none';
    
    try {
        const res = await fetch(`/api/documents/${currentDocId}/share/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ email })
        });
        
        const data = await res.json();
        if (res.ok) {
            emailInput.value = '';
            await loadCollaborators();
        } else {
            if (res.status === 404 && data.unregistered) {
                errorEl.style.display = 'block';
                errorEl.textContent = data.message || `User is not registered. An email invite has been sent directly to them.`;
                errorEl.style.color = 'var(--brand-600)';
            } else {
                errorEl.style.display = 'block';
                errorEl.textContent = data.error || 'Failed to add collaborator.';
                errorEl.style.color = '';
            }
        }
    } catch (e) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'Network error while adding collaborator.';
        errorEl.style.color = '';
    }
};

window.removeCollaborator = async function(email) {
    if (!await window.confirmDelete(`Remove ${email} from collaborators?`, 'Remove')) return;
    
    try {
        const res = await fetch(`/api/documents/${currentDocId}/unshare/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ email })
        });
        
        if (res.ok) {
            await loadCollaborators();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to remove collaborator.');
        }
    } catch (e) {
        alert('Network error.');
    }
};
