// md-annotate webview — self-contained
(function() {
'use strict';

var vscodeApi = acquireVsCodeApi();

// ─── defaults.js ───
const defaultBackend = {
    resolveLinkPath() { return null; },
    getResourceUrl(path) { return path; },
    async listLinkTargets() { return []; },
    async readFile() { return ''; },
    openFile() { },
    async saveAttachment() { return ''; },
};
const defaultOptions = {
    tabSize: 4,
    useTab: true,
    readableLineWidth: true,
    showLineNumber: true,
    showIndentGuide: true,
    foldHeading: true,
    foldIndent: true,
    autoPairBrackets: true,
    autoPairMarkdown: true,
    spellcheck: false,
    theme: 'dark',
    cssVariables: {},
};

// ─── mock-app.js ───
function buildMockApp(be, opts) {
    return {
        vault: {
            getConfig(key) {
                const configs = {
                    tabSize: opts.tabSize,
                    useTab: opts.useTab,
                    readableLineLength: opts.readableLineWidth,
                    showFrontmatter: false,
                    livePreview: true,
                    autoPairBrackets: opts.autoPairBrackets,
                    autoPairMarkdown: opts.autoPairMarkdown,
                    rightToLeft: false,
                    spellcheck: opts.spellcheck,
                    showLineNumber: opts.showLineNumber,
                    showIndentGuide: opts.showIndentGuide,
                    foldHeading: opts.foldHeading,
                    foldIndent: opts.foldIndent,
                    smartIndentList: true,
                    propertiesInDocument: 'visible',
                };
                return configs[key];
            },
            adapter: {
                getResourcePath(p) { return be.getResourceUrl(p); },
            },
            on() { return { id: 0 }; },
            off() { },
            offref() { },
            getAbstractFileByPath(path) {
                const resolved = be.resolveLinkPath(path, '');
                return resolved ? { path: resolved } : null;
            },
        },
        workspace: {
            openLinkText(link) { be.openFile(link); },
            getLeaf() { return { openLinkText(link) { be.openFile(link); } }; },
            getActiveFile() { return null; },
            activeEditor: null,
            on() { return { id: 0 }; },
            off() { },
            offref() { },
            trigger() { },
            editorExtensions: [],
            editorSuggest: { close() { }, isShowingSuggestion() { return false; }, trigger() { } },
        },
        metadataCache: {
            getFirstLinkpathDest(link, sourcePath) {
                const resolved = be.resolveLinkPath(link, sourcePath);
                return resolved ? { path: resolved } : null;
            },
            getFileCache() { return null; },
            getCache() { return null; },
            on() { return { id: 0 }; },
            off() { },
            offref() { },
        },
        internalPlugins: { getPluginById() { return null; } },
        plugins: { getPlugin() { return null; } },
        keymap: { pushScope() { }, popScope() { }, getRootScope() { return {}; } },
        commands: { executeCommandById() { } },
        isVimEnabled() { return false; },
        mobileToolbar: { update() { } },
    };
}
function buildMockEditor(view, editorEl, mockApp, mockOwner, be, EditorView, EditorState) {
    const mockEditor = {
        app: mockApp,
        get path() { return mockOwner.file?.path || ''; },
        get file() { return mockOwner.file; },
        cm: view,
        editor: null,
        editorEl,
        livePreviewPlugin: null,
        cleanupLivePreview: null,
        sourceMode: false,
        scope: null,
        owner: mockOwner,
        clipboardManager: buildClipboardManager(view, be, editorEl),
        addChild(c) { return c; },
        removeChild(_c) { },
        register(_cb) { },
        registerEvent(_ref) { },
        editorSuggest: { close() { }, isShowingSuggestion() { return false; }, trigger() { } },
        editTableCell(_table, cell) {
            const miniDiv = document.createElement('div');
            const miniState = EditorState.create({ doc: cell?.text || '' });
            const miniView = new EditorView({ state: miniState, parent: miniDiv });
            return { editor: { cm: miniView }, containerEl: miniDiv };
        },
        destroyTableCell() { },
        onUpdate(_update, _docChanged) { },
        onEditorClick(_e) { },
        updateLinkPopup() { },
    };
    mockEditor.editor = {
        cm: view,
        getSelection() { return ''; },
        getCursor() { return { line: 0, ch: 0 }; },
        getLine(_n) { return ''; },
        removeHighlights() { },
        expandText() { },
    };
    return mockEditor;
}
function buildClipboardManager(view, be, editorEl) {
    return {
        handleDragOver(e) {
            e.preventDefault();
            editorEl.classList.add('is-drop-target');
        },
        async handleDrop(e) {
            editorEl.classList.remove('is-drop-target');
            const files = e.dataTransfer?.files;
            if (!files || files.length === 0)
                return;
            e.preventDefault();
            for (const file of Array.from(files)) {
                const buf = await file.arrayBuffer();
                const savedPath = await be.saveAttachment(file.name, buf);
                if (savedPath) {
                    const insert = file.type.startsWith('image/') ? `![[${savedPath}]]` : `[[${savedPath}]]`;
                    const { from, to } = view.state.selection.main;
                    view.dispatch({
                        changes: { from, to, insert },
                        selection: { anchor: from + insert.length },
                        userEvent: 'input.drop',
                    });
                }
            }
        },
        handlePaste(e) {
            const items = e.clipboardData?.items;
            if (items) {
                for (const item of Array.from(items)) {
                    if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        if (!blob)
                            return;
                        blob.arrayBuffer().then(async (buf) => {
                            const name = `paste-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
                            const savedPath = await be.saveAttachment(name, buf);
                            if (savedPath) {
                                const insert = `![[${savedPath}]]`;
                                const { from, to } = view.state.selection.main;
                                view.dispatch({
                                    changes: { from, to, insert },
                                    selection: { anchor: from + insert.length },
                                    userEvent: 'input.paste',
                                });
                            }
                        });
                        return;
                    }
                }
            }
            const html = e.clipboardData?.getData('text/html');
            if (!html)
                return;
            if (!window.TurndownService)
                return;
            try {
                const td = new window.TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
                const md = td.turndown(html);
                if (!md || !md.trim())
                    return;
                e.preventDefault();
                const { from, to } = view.state.selection.main;
                view.dispatch({
                    changes: { from, to, insert: md },
                    selection: { anchor: from + md.length },
                    userEvent: 'input.paste',
                });
            }
            catch (err) {
                console.warn('Paste conversion failed:', err);
            }
        },
    };
}

// ─── extensions.js ───
/**
 * CodeMirror 扩展的组装逻辑。
 * 将 Obsidian 暴露的各原子扩展按用户配置拼装为完整 extension 数组。
 */
function buildLocalExtensions(view, mockOwner, mockEditor, editorEl, opts, be, deps) {
    const { jB, WB, EditorView, keymap, hangingIndent, language, listRegex, indentMore, indentLess, newlineAndIndent } = deps;
    return [
        jB.init(() => view),
        WB.init(() => mockOwner),
        EditorView.updateListener.of((update) => {
            if (update.docChanged && opts.onChange) {
                opts.onChange(update.state.doc.toString());
            }
        }),
        EditorView.domEventHandlers({
            paste(e) { mockEditor.clipboardManager.handlePaste(e); },
            dragover(e) { mockEditor.clipboardManager.handleDragOver(e); },
            drop(e) { mockEditor.clipboardManager.handleDrop(e); },
            dragleave(_e) { editorEl.classList.remove('is-drop-target'); },
        }),
        hangingIndent,
        language,
        keymap.of([
            {
                key: 'Enter',
                run(v) {
                    const state = v.state;
                    const { head } = state.selection.main;
                    const line = state.doc.lineAt(head);
                    const match = listRegex.exec(line.text);
                    if (!match)
                        return false;
                    const prefix = match[0];
                    const blockquote = match[1] || '';
                    const listMarker = match[2] || '';
                    // Neither blockquote nor list marker — let default behavior handle it
                    if (!blockquote && !listMarker)
                        return false;
                    // Empty line: just blockquote/list prefix with no content after
                    if (line.text.slice(prefix.length).trim() === '') {
                        v.dispatch({
                            changes: { from: line.from, to: line.to, insert: '' },
                            userEvent: 'input.type',
                        });
                        return true;
                    }
                    if (listMarker) {
                        // List continuation
                        let newMarker = listMarker;
                        const ordNum = match[4];
                        if (ordNum) {
                            const sep = match[5];
                            newMarker = (parseInt(ordNum) + 1) + sep;
                        }
                        const checkbox = match[6] !== undefined ? '[ ] ' : '';
                        if (checkbox)
                            newMarker = newMarker.replace(/\[.\] $/, '');
                        const insert = '\n' + blockquote + newMarker + checkbox;
                        v.dispatch({
                            changes: { from: head, insert },
                            selection: { anchor: head + insert.length },
                            userEvent: 'input.type',
                        });
                    } else {
                        // Blockquote-only continuation
                        const insert = '\n' + blockquote;
                        v.dispatch({
                            changes: { from: head, insert },
                            selection: { anchor: head + insert.length },
                            userEvent: 'input.type',
                        });
                    }
                    return true;
                },
                shift(v) { return newlineAndIndent(v); },
                preventDefault: true,
            },
            {
                key: 'Tab',
                run(v) { return indentMore(v); },
                shift(v) { return indentLess(v); },
            },
            {
                key: 'Mod-s',
                run(v) {
                    if (opts.onSave)
                        opts.onSave(v.state.doc.toString());
                    return true;
                },
                preventDefault: true,
            },
        ]),
    ];
}
function buildDynamicExtensions(mockApp, mockEditor, view, editorEl, opts, deps) {
    const { EditorView, EditorState, KB, indentUnit, lineNumbers, activeLineGutter, highlightActiveLineGutter, indentGuide, foldGutter, foldExtensions, foldHeading, foldIndent, foldEffect, pT, lT, fT, iB, frontmatterHandler, keymap, } = deps;
    const tabSize = opts.tabSize;
    const useTab = opts.useTab;
    const indent = useTab ? '\t' : ' '.repeat(Math.min(Math.max(tabSize, 2), 4));
    const exts = [
        EditorState.tabSize.of(tabSize),
        indentUnit.of(indent),
        EditorView.contentAttributes.of({
            spellcheck: String(opts.spellcheck),
            autocorrect: 'on',
            autocapitalize: 'on',
            contenteditable: 'true',
        }),
        KB.init(() => true),
    ];
    if (opts.showLineNumber) {
        exts.push(lineNumbers({ fixed: false }), activeLineGutter, highlightActiveLineGutter());
    }
    if (opts.showIndentGuide) {
        exts.push(indentGuide);
    }
    if (opts.foldHeading || opts.foldIndent) {
        editorEl.classList.add('is-folding');
        exts.push(foldGutter(), ...foldExtensions);
        if (opts.foldHeading)
            exts.push(foldHeading);
        if (opts.foldIndent)
            exts.push(foldIndent);
        exts.push(foldEffect);
    }
    const livePreviewExts = window.__kH(mockEditor, view);
    exts.push(livePreviewExts);
    if (opts.autoPairBrackets || opts.autoPairMarkdown) {
        const brackets = [];
        if (opts.autoPairBrackets)
            brackets.push('(', '[', '{', "'", '"');
        if (opts.autoPairMarkdown)
            brackets.push('*', '_', '`', '```');
        exts.push(pT, lT);
        exts.push(keymap.of(fT));
        exts.push(EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]));
        exts.push(iB);
        exts.push(frontmatterHandler);
    }
    return exts;
}

// ─── link-handler.js ───
function setupLinkClickHandler(view, editorEl, opts, be) {
    editorEl.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || !target.closest)
            return;
        const internalLink = target.closest('.internal-link, .cm-hmd-internal-link');
        if (internalLink) {
            e.preventDefault();
            e.stopPropagation();
            const linkText = internalLink.getAttribute('data-href')
                || internalLink.getAttribute('href')
                || internalLink.textContent?.trim() || '';
            if (linkText) {
                if (opts.onLinkClick) {
                    opts.onLinkClick(linkText, opts.filePath || '');
                }
                else {
                    be.openFile(linkText);
                }
            }
            return;
        }
        const externalLink = target.closest('.external-link');
        if (externalLink) {
            const href = externalLink.getAttribute('href') || externalLink.getAttribute('data-href') || '';
            if (href && /^https?:|^mailto:/.test(href)) {
                e.preventDefault();
                e.stopPropagation();
                if (opts.onExternalLinkClick) {
                    opts.onExternalLinkClick(href);
                }
                else {
                    window.open(href, '_blank');
                }
                return;
            }
        }
        const underline = target.closest('.cm-underline');
        if (underline) {
            const linkParent = underline.closest('.cm-hmd-internal-link');
            if (linkParent) {
                e.preventDefault();
                e.stopPropagation();
                const pos = view.posAtDOM(underline);
                const linkContent = extractLinkAtPos(view, pos);
                if (linkContent) {
                    if (opts.onLinkClick) {
                        opts.onLinkClick(linkContent, opts.filePath || '');
                    }
                    else {
                        be.openFile(linkContent);
                    }
                }
                return;
            }
            const extParent = underline.closest('.cm-link');
            if (extParent) {
                const urlEl = extParent.parentElement?.querySelector('.cm-url, .cm-string');
                if (urlEl) {
                    const url = urlEl.textContent?.replace(/^\(|\)$/g, '') || '';
                    if (/^https?:/.test(url)) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (opts.onExternalLinkClick) {
                            opts.onExternalLinkClick(url);
                        }
                        else {
                            window.open(url, '_blank');
                        }
                    }
                }
            }
        }
    });
}
function extractLinkAtPos(view, pos) {
    const doc = view.state.doc.toString();
    const before = doc.lastIndexOf('[[', pos);
    if (before !== -1 && before >= pos - 200) {
        const after = doc.indexOf(']]', before + 2);
        if (after !== -1 && after < pos + 200) {
            const content = doc.slice(before + 2, after);
            const pipeIdx = content.indexOf('|');
            return pipeIdx !== -1 ? content.slice(0, pipeIdx) : content;
        }
    }
    return null;
}

// ─── expand-text.js ───
/**
 * 中文括号自动转换：【【→[[, 】】→]]
 */
const rules = [
    { regex: /(！)?【【$/, replace: (m) => m[1] ? '![[' : '[[' },
    { regex: /】】$/, replace: () => ']]' },
];
function setupExpandText(view) {
    const { EditorView, StateEffect } = window.__cm6;
    const listener = EditorView.updateListener.of((update) => {
        if (!update.docChanged)
            return;
        const isUserInput = update.transactions.some((tr) => tr.isUserEvent('input'));
        if (!isUserInput)
            return;
        const state = update.state;
        const cursor = state.selection.main.head;
        const line = state.doc.lineAt(cursor);
        const textBefore = line.text.slice(0, cursor - line.from);
        for (const rule of rules) {
            const match = textBefore.match(rule.regex);
            if (match) {
                const replaceText = rule.replace(match);
                const from = cursor - match[0].length;
                setTimeout(() => {
                    view.dispatch({
                        changes: { from, to: cursor, insert: replaceText },
                        selection: { anchor: from + replaceText.length },
                        userEvent: 'input.type',
                    });
                }, 0);
                break;
            }
        }
    });
    view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
}

// ─── suggest.js ───
function setupSuggest(view, config) {
    const { EditorView, StateEffect } = window.__cm6;
    let suggestEl = null;
    let suggestItems = [];
    let selectedIdx = 0;
    let triggerFrom = -1;
    let active = true;
    function createSuggestEl() {
        if (suggestEl)
            return suggestEl;
        suggestEl = document.createElement('div');
        suggestEl.className = 'md-lp-suggest';
        suggestEl.style.cssText = 'position:fixed;z-index:1000;background:var(--background-secondary,#252526);border:1px solid var(--background-modifier-border,#454545);border-radius:4px;max-height:200px;overflow-y:auto;min-width:200px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;display:none;';
        document.body.appendChild(suggestEl);
        suggestEl.addEventListener('mousedown', (e) => e.preventDefault());
        suggestEl.addEventListener('click', (e) => {
            const itemEl = e.target.closest('[data-idx]');
            if (itemEl) {
                acceptSuggestion(parseInt(itemEl.getAttribute('data-idx')));
            }
        });
        return suggestEl;
    }
    function showSuggest(coords, items) {
        const el = createSuggestEl();
        suggestItems = items;
        selectedIdx = 0;
        el.innerHTML = items.map((item, i) => `<div data-idx="${i}" style="padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${i === 0 ? 'background:var(--background-modifier-hover,#04395e);' : ''}">${escapeHtml(item.label)}</div>`).join('');
        el.style.left = coords.left + 'px';
        el.style.top = (coords.bottom + 2) + 'px';
        el.style.display = 'block';
    }
    function hideSuggest() {
        if (suggestEl)
            suggestEl.style.display = 'none';
        suggestItems = [];
        triggerFrom = -1;
    }
    function updateSelection(idx) {
        if (!suggestEl)
            return;
        selectedIdx = Math.max(0, Math.min(idx, suggestItems.length - 1));
        const items = suggestEl.querySelectorAll('[data-idx]');
        items.forEach((el, i) => {
            el.style.background = i === selectedIdx ? 'var(--background-modifier-hover,#04395e)' : '';
        });
        items[selectedIdx]?.scrollIntoView({ block: 'nearest' });
    }
    function acceptSuggestion(idx) {
        if (idx < 0 || idx >= suggestItems.length)
            return;
        const item = suggestItems[idx];
        const cursor = view.state.selection.main.head;
        const insertText = item.insertText + (config.suffix || '');
        view.dispatch({
            changes: { from: triggerFrom, to: cursor, insert: insertText },
            selection: { anchor: triggerFrom + insertText.length },
            userEvent: 'input.type',
        });
        hideSuggest();
        view.focus();
        if (config.onAccept)
            config.onAccept(item);
    }
    const listener = EditorView.updateListener.of((update) => {
        if (!active)
            return;
        if (!update.docChanged && !update.selectionSet)
            return;
        const state = update.state;
        const cursor = state.selection.main.head;
        const line = state.doc.lineAt(cursor);
        const textBefore = line.text.slice(0, cursor - line.from);
        const match = textBefore.match(config.trigger);
        if (!match) {
            hideSuggest();
            return;
        }
        const query = match[1] || '';
        triggerFrom = cursor - query.length;
        const result = config.getSuggestions(query);
        const handleItems = (items) => {
            if (items.length === 0) {
                hideSuggest();
                return;
            }
            let coords = update.view.coordsAtPos(cursor);
            if (!coords) {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const rect = sel.getRangeAt(0).getBoundingClientRect();
                    if (rect.height > 0)
                        coords = { left: rect.left, bottom: rect.bottom };
                }
                if (!coords) {
                    const cursorEl = update.view.dom.querySelector('.cm-cursor');
                    if (cursorEl) {
                        const r = cursorEl.getBoundingClientRect();
                        coords = { left: r.left, bottom: r.bottom };
                    }
                    else {
                        const r = update.view.dom.getBoundingClientRect();
                        coords = { left: r.left + 50, bottom: r.top + 30 };
                    }
                }
            }
            showSuggest(coords, items);
        };
        if (result instanceof Promise) {
            result.then(handleItems);
        }
        else {
            handleItems(result);
        }
    });
    const suggestKeymap = EditorView.domEventHandlers({
        keydown(e) {
            if (!suggestEl || suggestEl.style.display === 'none') return false;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                updateSelection(selectedIdx + 1);
                return true;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                updateSelection(selectedIdx - 1);
                return true;
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                acceptSuggestion(selectedIdx);
                return true;
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideSuggest();
                return true;
            }
            return false;
        },
    });
    view.dispatch({ effects: StateEffect.appendConfig.of([listener, suggestKeymap]) });
    return () => {
        active = false;
        if (suggestEl) {
            suggestEl.remove();
            suggestEl = null;
        }
    };
}
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── create.js ───
function createEditor(container, options = {}, backend = {}) {
    const opts = { ...defaultOptions, ...options };
    const be = { ...defaultBackend, ...backend };
    if (!window.__cm6 || !window.__cm6.EditorView) {
        throw new Error('md-live-preview: Obsidian runtime not loaded. ' +
            'Ensure vendor scripts are included before calling createEditor().');
    }
    const { EditorView, EditorState, keymap, syntaxTree, Transaction } = window.__cm6;
    const { editor: jB, owner: WB, livePreview: KB } = window.__stateFields;
    const { inputHandler: pT, stateField: lT, keymap: fT, markdownSurround: iB } = window.__closeBrackets;
    const { base: ZB, dynamic: iN } = window.__compartments;
    const editorEl = container;
    if (!editorEl.classList.contains('markdown-source-view')) {
        editorEl.classList.add('markdown-source-view', 'mod-cm6', 'is-live-preview');
    }
    if (opts.readableLineWidth) {
        editorEl.classList.add('is-readable-line-width');
    }
    if (opts.cssVariables) {
        for (const [key, value] of Object.entries(opts.cssVariables)) {
            const prop = key.startsWith('--') ? key : `--${key}`;
            editorEl.style.setProperty(prop, value);
        }
    }
    const mockApp = buildMockApp(be, opts);
    const view = new EditorView({ parent: editorEl });
    const mockOwner = {
        file: {
            path: opts.filePath || 'untitled.md',
            name: (opts.filePath || 'untitled.md').split('/').pop(),
            basename: (opts.filePath || 'untitled.md').split('/').pop().replace(/\.md$/, ''),
            extension: 'md',
        },
        saveImmediately() {
            if (opts.onSave)
                opts.onSave(view.state.doc.toString());
        },
    };
    const mockEditor = buildMockEditor(view, editorEl, mockApp, mockOwner, be, EditorView, EditorState);
    const localExtensions = buildLocalExtensions(view, mockOwner, mockEditor, editorEl, opts, be, {
        jB, WB, EditorView, EditorState, keymap,
        hangingIndent: window.__hangingIndent,
        language: window.__language,
        listRegex: window.__listRegex,
        indentMore: window.__commands.indentMore,
        indentLess: window.__commands.indentLess,
        newlineAndIndent: window.__commands.newlineAndIndent,
    });
    const dynamicExtensions = buildDynamicExtensions(mockApp, mockEditor, view, editorEl, opts, {
        EditorView, EditorState, KB,
        indentUnit: window.__indentUnit,
        lineNumbers: window.__lineNumbers,
        activeLineGutter: window.__activeLineGutter,
        highlightActiveLineGutter: window.__highlightActiveLineGutter,
        indentGuide: window.__indentGuide,
        foldGutter: window.__foldGutter,
        foldExtensions: window.__foldExtensions,
        foldHeading: window.__foldHeading,
        foldIndent: window.__foldIndent,
        foldEffect: window.__foldEffect,
        pT, lT, fT, iB,
        frontmatterHandler: window.__frontmatterHandler,
        keymap,
    });
    const nN = ZB.of(window.__baseExtensions);
    const fullState = EditorState.create({
        doc: opts.doc || '',
        extensions: [localExtensions, iN.of(dynamicExtensions), nN],
    });
    view.setState(fullState);
    function forceRebuild() {
        view.dispatch({ annotations: Transaction.addToHistory.of(false) });
        const tree = syntaxTree(view.state);
        if (tree.length < view.state.doc.length) {
            setTimeout(forceRebuild, 50);
        }
    }
    setTimeout(forceRebuild, 50);
    setupLinkClickHandler(view, editorEl, opts, be);
    setupExpandText(view);
    return {
        view,
        getDoc() { return view.state.doc.toString(); },
        setDoc(content) {
            view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: content },
            });
        },
        getSelection() {
            const { from, to } = view.state.selection.main;
            return view.state.doc.sliceString(from, to);
        },
        destroy() {
            view.destroy();
            editorEl.innerHTML = '';
        },
        focus() { view.focus(); },
        registerSuggest(config) {
            return setupSuggest(view, config);
        },
    };
}


// ─── PostMessage 桥接 ───

var requestId = 0;
var pendingRequests = new Map();

function rpcCall(method, params) {
  return new Promise(function(resolve, reject) {
    var id = ++requestId;
    pendingRequests.set(id, { resolve: resolve, reject: reject });
    vscodeApi.postMessage({ type: 'rpc', id: id, method: method, params: params });
    setTimeout(function() {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('RPC timeout: ' + method));
      }
    }, 10000);
  });
}

// ─── EditorBackend（通过 RPC 代理到 extension）───

var linkIndex = new Map();
var resourceBaseUri = '';

var backend = {
  async listLinkTargets() {
    return rpcCall('listLinkTargets', {});
  },
  resolveLinkPath(linktext, sourcePath) {
    return linkIndex.get(linktext) || linkIndex.get(linktext + '.md') || null;
  },
  getResourceUrl(path) {
    return resourceBaseUri + '/' + encodeURIComponent(path);
  },
  async readFile(path) {
    return rpcCall('readFile', { path: path });
  },
  openFile(path) {
    vscodeApi.postMessage({ type: 'rpc', id: 0, method: 'openFile', params: { path: path } });
  },
  async saveAttachment(name, data) {
    var bytes = new Uint8Array(data);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    var base64 = btoa(binary);
    return rpcCall('saveAttachment', { name: name, base64: base64 });
  },
};

// ─── 状态 ───

var editor = null;
var currentFilePath = '';
var humanAnnotations = [];
var aiAnnotations = [];
var unregisterSuggest = null;

// ─── 消息处理 ───

window.addEventListener('message', function(event) {
  var msg = event.data;
  switch (msg.type) {
    case 'rpcResult': {
      var pending = pendingRequests.get(msg.id);
      if (pending) {
        pendingRequests.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error));
        else pending.resolve(msg.result);
      }
      break;
    }
    case 'init': {
      currentFilePath = msg.filePath || '';
      resourceBaseUri = msg.resourceBaseUri || '';
      linkIndex = new Map((msg.linkTargets || []).map(function(t) { return [t.name, t.path]; }));
      (msg.linkTargets || []).forEach(function(t) {
        linkIndex.set(t.path, t.path);
        if (t.aliases) t.aliases.forEach(function(a) { linkIndex.set(a, t.path); });
      });
      initEditor(msg.doc || '', msg.filePath || 'untitled.md');
      break;
    }
    case 'updateAnnotations': {
      humanAnnotations = msg.humanAnnotations || [];
      aiAnnotations = msg.aiAnnotations || [];
      renderAnnotationGutter();
      break;
    }
    case 'setDoc': {
      if (editor) editor.setDoc(msg.content);
      break;
    }
    case 'updateLinkIndex': {
      linkIndex = new Map((msg.linkTargets || []).map(function(t) { return [t.name, t.path]; }));
      (msg.linkTargets || []).forEach(function(t) {
        linkIndex.set(t.path, t.path);
        if (t.aliases) t.aliases.forEach(function(a) { linkIndex.set(a, t.path); });
      });
      break;
    }
  }
});

// ─── 编辑器初始化 ───

function initEditor(doc, filePath) {
  var container = document.getElementById('editor-container');
  if (!container) return;

  try {
    editor = createEditor(container, {
      doc: doc,
      filePath: filePath,
      theme: document.body.classList.contains('vscode-light') ? 'light' : 'dark',
      onChange: function(newDoc) {
        vscodeApi.postMessage({ type: 'docChanged', doc: newDoc });
      },
      onSave: function(newDoc) {
        vscodeApi.postMessage({ type: 'save', doc: newDoc });
      },
      onLinkClick: function(linktext) {
        vscodeApi.postMessage({ type: 'rpc', id: 0, method: 'openFile', params: { path: linktext } });
      },
      onExternalLinkClick: function(url) {
        vscodeApi.postMessage({ type: 'rpc', id: 0, method: 'openExternal', params: { url: url } });
      },
    }, backend);

    // 注册 [[ 链接补全
    unregisterSuggest = editor.registerSuggest({
      trigger: /\[\[([^\]]*)$/,
      getSuggestions: function(query) {
        var q = query.toLowerCase();
        var filtered = [];
        linkIndex.forEach(function(path, name) {
          if (name.toLowerCase().includes(q) || path.toLowerCase().includes(q)) {
            if (!filtered.some(function(f) { return f.insertText === path; })) {
              filtered.push({ label: path, insertText: path });
            }
          }
        });
        return filtered.slice(0, 20);
      },
      suffix: ']]',
    });

    // 设置批注交互
    setupAnnotationInteraction(container);
  } catch(e) {
    console.error('[md-annotate] initEditor failed:', e);
    document.getElementById('editor-container').textContent = 'Editor init error: ' + e.message;
  }
}

// ─── 批注交互 ───

function setupAnnotationInteraction(container) {
  container.addEventListener('contextmenu', function(e) {
    if (!editor) return;
    var sel = editor.getSelection();
    if (!sel || sel.trim().length === 0) return;
    e.preventDefault();
    showAnnotationPopover(e, sel);
  });
}

function showAnnotationPopover(event, selectedText) {
  var existing = document.getElementById('annotation-popover');
  if (existing) existing.remove();

  var popover = document.createElement('div');
  popover.id = 'annotation-popover';
  popover.className = 'annotation-popover visible';
  popover.innerHTML =
    '<div class="popover-header">批注选中的文本：<span class="selected-preview">' +
    escapeHtmlLocal(selectedText.length > 50 ? selectedText.slice(0, 50) + '…' : selectedText) +
    '</span></div>' +
    '<textarea id="annotation-input" placeholder="写下你的批注..."></textarea>' +
    '<div class="popover-actions">' +
    '<button class="btn-cancel" id="btn-cancel-annotation">取消</button>' +
    '<button class="btn-primary" id="btn-submit-annotation">添加</button>' +
    '</div>' +
    '<div class="hint">Ctrl+Enter 提交 · Esc 取消</div>';

  var contentArea = document.getElementById('main-area');
  var rect = contentArea.getBoundingClientRect();
  popover.style.left = Math.min(event.clientX - rect.left, rect.width - 340) + 'px';
  popover.style.top = (event.clientY - rect.top + 8) + 'px';
  contentArea.appendChild(popover);

  var textarea = document.getElementById('annotation-input');
  setTimeout(function() { textarea.focus(); }, 30);

  document.getElementById('btn-submit-annotation').addEventListener('click', function() {
    submitAnnotation(selectedText, textarea.value.trim());
  });
  document.getElementById('btn-cancel-annotation').addEventListener('click', function() {
    popover.remove();
  });
  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitAnnotation(selectedText, textarea.value.trim());
    if (e.key === 'Escape') popover.remove();
  });
  setTimeout(function() {
    document.addEventListener('mousedown', function handler(e) {
      if (!popover.contains(e.target)) { popover.remove(); document.removeEventListener('mousedown', handler); }
    });
  }, 100);
}

function submitAnnotation(selectedText, content) {
  if (!content) return;
  var anchor = {
    type: 'text-range',
    start_text: selectedText.slice(0, 30),
    end_text: selectedText.length > 30 ? selectedText.slice(-30) : selectedText,
  };
  vscodeApi.postMessage({ type: 'addAnnotation', anchor: anchor, content: content, tags: [] });
  var popover = document.getElementById('annotation-popover');
  if (popover) popover.remove();
}

// ─── 批注侧栏 ───

function renderAnnotationGutter() {
  var gutter = document.getElementById('annotation-gutter');
  if (!gutter) return;

  var allAnns = []
    .concat(humanAnnotations.map(function(a) { return Object.assign({}, a, { _authorType: 'human' }); }))
    .concat(aiAnnotations.map(function(a) { return Object.assign({}, a, { _authorType: 'ai' }); }));

  if (allAnns.length === 0) {
    gutter.innerHTML = '<div class="gutter-empty"><div class="gutter-empty-icon">💬</div><div>选中文本后右键<br>即可添加批注</div></div>';
    return;
  }

  gutter.innerHTML = allAnns
    .sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); })
    .map(function(ann) {
      var threadHtml = '';
      if (ann.thread && ann.thread.length > 0) {
        threadHtml = '<div class="card-thread">' +
          ann.thread.map(function(reply) {
            return '<div class="thread-reply ' + reply.author_type + '">' +
              '<span class="reply-author">' + (reply.author_type === 'human' ? '👤' : '🤖') + '</span>' +
              '<span class="reply-content">' + escapeHtmlLocal(reply.content) + '</span>' +
              '</div>';
          }).join('') +
          '</div>';
      }
      var replyCount = (ann.thread && ann.thread.length) || 0;
      return '<div class="annotation-card ' + ann._authorType + ' ' + (ann.resolved ? 'resolved' : '') + '" data-ann-id="' + ann.id + '" data-author-type="' + ann._authorType + '" data-anchor=\'' + JSON.stringify(ann.anchor).replace(/'/g, '&#39;') + '\'>' +
        '<div class="card-header">' +
        '<span>' + (ann._authorType === 'human' ? '👤' : '🤖') + '</span>' +
        '<span class="card-date">' + formatDate(ann.created_at) + '</span>' +
        '<div class="card-actions">' +
        '<button data-action="reply" data-id="' + ann.id + '" data-author="' + ann._authorType + '" title="回复">💬</button>' +
        (ann._authorType === 'human' ? '<button data-action="resolve" data-id="' + ann.id + '" title="标记已解决">✓</button><button data-action="delete" data-id="' + ann.id + '" title="删除">✕</button>' : '<button data-action="resolve-ai" data-id="' + ann.id + '" title="标记已解决">✓</button>') +
        '</div>' +
        '</div>' +
        '<div class="card-content">' + escapeHtmlLocal(ann.content) + '</div>' +
        threadHtml +
        (replyCount > 0 ? '<div class="card-thread-count">' + replyCount + ' 条回复</div>' : '') +
        '<div class="card-anchor">' + formatAnchor(ann.anchor) + '</div>' +
        '</div>';
    }).join('');
}

// ─── Gutter 事件代理 ───

(function() {
  var gutter = document.getElementById('annotation-gutter');
  if (!gutter) return;
  gutter.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (btn) {
      e.stopPropagation();
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if (action === 'resolve') vscodeApi.postMessage({ type: 'resolveAnnotation', id: id });
      else if (action === 'resolve-ai') vscodeApi.postMessage({ type: 'resolveAnnotation', id: id });
      else if (action === 'delete') vscodeApi.postMessage({ type: 'removeAnnotation', id: id });
      else if (action === 'reply') {
        var authorType = btn.getAttribute('data-author') || 'human';
        showReplyInput(id, authorType, btn.closest('.annotation-card'));
      }
      return;
    }
    var card = e.target.closest('.annotation-card[data-anchor]');
    if (card && editor && !e.target.closest('.reply-input-area')) {
      try {
        var anchor = JSON.parse(card.getAttribute('data-anchor'));
        jumpToAnchor(anchor);
      } catch(err) {}
    }
  });
})();

function showReplyInput(annotationId, authorType, cardEl) {
  // Remove any existing reply input
  var existing = document.querySelector('.reply-input-area');
  if (existing) existing.remove();

  var replyArea = document.createElement('div');
  replyArea.className = 'reply-input-area';
  replyArea.innerHTML =
    '<textarea class="reply-textarea" placeholder="写下回复..."></textarea>' +
    '<div class="reply-input-actions">' +
    '<button class="btn-cancel reply-cancel">取消</button>' +
    '<button class="btn-primary reply-submit">回复</button>' +
    '</div>' +
    '<div class="hint">Ctrl+Enter 提交</div>';
  cardEl.appendChild(replyArea);

  var textarea = replyArea.querySelector('.reply-textarea');
  setTimeout(function() { textarea.focus(); }, 30);

  replyArea.querySelector('.reply-submit').addEventListener('click', function() {
    var content = textarea.value.trim();
    if (!content) return;
    vscodeApi.postMessage({
      type: 'addReply',
      annotationId: annotationId,
      authorType: authorType,
      replyAuthorType: 'human',
      content: content
    });
    replyArea.remove();
  });
  replyArea.querySelector('.reply-cancel').addEventListener('click', function() {
    replyArea.remove();
  });
  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      var content = textarea.value.trim();
      if (!content) return;
      vscodeApi.postMessage({
        type: 'addReply',
        annotationId: annotationId,
        authorType: authorType,
        replyAuthorType: 'human',
        content: content
      });
      replyArea.remove();
    }
    if (e.key === 'Escape') replyArea.remove();
  });
}

function jumpToAnchor(anchor) {
  if (!editor || !editor.view) return;
  var view = editor.view;
  var doc = view.state.doc.toString();
  var pos = -1;
  if (anchor.type === 'text-range' && anchor.start_text) pos = doc.indexOf(anchor.start_text);
  else if (anchor.type === 'heading' && anchor.heading_text) pos = doc.indexOf(anchor.heading_text);
  else if (anchor.type === 'line-range' && anchor.start_line) {
    var line = Math.min(anchor.start_line, view.state.doc.lines);
    pos = view.state.doc.line(line).from;
  }
  if (pos >= 0) {
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }
}

// ─── 工具函数 ───

function formatDate(iso) {
  var d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatAnchor(anchor) {
  if (anchor.type === 'text-range') return '"' + escapeHtmlLocal(anchor.start_text) + '…"';
  if (anchor.type === 'heading') return '§ ' + escapeHtmlLocal(anchor.heading_text);
  if (anchor.type === 'line-range') return 'L' + anchor.start_line + '–' + anchor.end_line;
  return '';
}
function escapeHtmlLocal(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── 切回源码模式 ───
window.addEventListener('switchToSource', function() {
  vscodeApi.postMessage({ type: 'switchToSource' });
});
window.addEventListener('createAiFile', function() {
  vscodeApi.postMessage({ type: 'createAiFile' });
});
window.addEventListener('createAgentGuide', function() {
  vscodeApi.postMessage({ type: 'createAgentGuide' });
});

// ─── 通知 extension 准备就绪 ───
vscodeApi.postMessage({ type: 'ready' });



})();
