import { defaultBackend, defaultOptions } from './defaults.js';
export function createEditor(container, options = {}, backend = {}) {
    // 合并默认值
    const opts = { ...defaultOptions, ...options };
    const be = { ...defaultBackend, ...backend };
    // 验证运行时已加载
    if (!window.__cm6 || !window.__cm6.EditorView) {
        throw new Error('md-live-preview: Obsidian runtime not loaded. ' +
            'Ensure vendor scripts are included before calling createEditor().');
    }
    const { EditorView, EditorState, Prec, keymap, Compartment, syntaxTree, } = window.__cm6;
    const { searchHighlight: If } = window.__fields;
    const { editor: jB, owner: WB, livePreview: KB } = window.__stateFields;
    const { updateField: UB } = window.__stateEffects;
    const { inputHandler: pT, stateField: lT, keymap: fT, markdownSurround: iB } = window.__closeBrackets;
    const { base: ZB, dynamic: iN } = window.__compartments;
    const indentUnit = window.__indentUnit;
    const language = window.__language;
    const baseExtensions = window.__baseExtensions;
    const hangingIndent = window.__hangingIndent;
    const lineNumbers = window.__lineNumbers;
    const activeLineGutter = window.__activeLineGutter;
    const highlightActiveLineGutter = window.__highlightActiveLineGutter;
    const indentGuide = window.__indentGuide;
    const foldGutter = window.__foldGutter;
    const foldExtensions = window.__foldExtensions;
    const foldHeading = window.__foldHeading;
    const foldIndent = window.__foldIndent;
    const foldEffect = window.__foldEffect;
    const frontmatterHandler = window.__frontmatterHandler;
    const { indentMore, indentLess, newlineAndIndent } = window.__commands;
    const listRegex = window.__listRegex;
    // 准备 DOM
    const editorEl = container;
    if (!editorEl.classList.contains('markdown-source-view')) {
        editorEl.classList.add('markdown-source-view', 'mod-cm6', 'is-live-preview');
    }
    if (opts.readableLineWidth) {
        editorEl.classList.add('is-readable-line-width');
    }
    // 注入自定义 CSS 变量
    if (opts.cssVariables) {
        for (const [key, value] of Object.entries(opts.cssVariables)) {
            const prop = key.startsWith('--') ? key : `--${key}`;
            editorEl.style.setProperty(prop, value);
        }
    }
    // 构造 mockApp——将后端接口注入
    const mockApp = buildMockApp(be, opts);
    // 创建 EditorView
    const view = new EditorView({ parent: editorEl });
    // 构造 mockOwner / mockEditor
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
    // 构建 extensions
    const localExtensions = buildLocalExtensions(view, mockOwner, mockEditor, editorEl, opts, be, { jB, WB, KB, EditorView, EditorState, keymap, hangingIndent, language, listRegex, indentMore, indentLess, newlineAndIndent });
    const dynamicExtensions = buildDynamicExtensions(mockApp, mockEditor, view, editorEl, opts, { EditorView, EditorState, KB, indentUnit, lineNumbers, activeLineGutter, highlightActiveLineGutter,
        indentGuide, foldGutter, foldExtensions, foldHeading: foldHeading, foldIndent: foldIndent,
        foldEffect, pT, lT, fT, iB, frontmatterHandler, keymap });
    // 组装 state
    const nN = ZB.of(baseExtensions);
    const fullState = EditorState.create({
        doc: opts.doc || '',
        extensions: [
            localExtensions,
            iN.of(dynamicExtensions),
            nN,
        ],
    });
    view.setState(fullState);
    // 语法树增量解析完成后强制刷新
    function forceRebuild() {
        view.dispatch({});
        const tree = syntaxTree(view.state);
        if (tree.length < view.state.doc.length) {
            setTimeout(forceRebuild, 50);
        }
    }
    setTimeout(forceRebuild, 50);
    // ─── 内建：链接点击处理 ───
    setupLinkClickHandler(view, editorEl, opts, be);
    // ─── 内建：中文括号自动转换（【【→[[, 】】→]]）───
    setupExpandText(view);
    // ─── 返回实例 ───
    const instance = {
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
    return instance;
}
// ─── 内部构建函数 ───
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
        clipboardManager: {
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
                // 图片粘贴
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
                // HTML 粘贴转 Markdown
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
        },
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
                    if (!listMarker)
                        return false;
                    if (line.text.slice(prefix.length).trim() === '') {
                        v.dispatch({ changes: { from: line.from, to: line.to, insert: '' } });
                        return true;
                    }
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
            // Ctrl+S / Cmd+S 保存
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
    // Live preview extensions
    const livePreviewExts = window.__kH(mockEditor, view);
    exts.push(livePreviewExts);
    // Auto-pair
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
// ─── 链接点击处理 ───
function setupLinkClickHandler(view, editorEl, opts, be) {
    editorEl.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || !target.closest)
            return;
        // 内部链接：[[link]] 渲染后有 .internal-link 或 .cm-hmd-internal-link
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
        // 外部链接：[text](url) 渲染后有 .external-link
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
        // Fallback：.cm-underline 内的链接
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
// ─── 中文括号自动转换 ───
function setupExpandText(view) {
    const { EditorView, StateEffect } = window.__cm6;
    const rules = [
        { regex: /(！)?【【$/, replace: (m) => m[1] ? '![[' : '[[' },
        { regex: /】】$/, replace: () => ']]' },
    ];
    const listener = EditorView.updateListener.of((update) => {
        if (!update.docChanged)
            return;
        // 只在用户输入时触发
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
                    });
                }, 0);
                break;
            }
        }
    });
    view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
}
// ─── 补全注册 ───
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
        });
        hideSuggest();
        view.focus();
        if (config.onAccept)
            config.onAccept(item);
    }
    // 监听文档/选区变更
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
    view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
    // 键盘拦截（capture phase）
    const keyHandler = (e) => {
        if (!suggestEl || suggestEl.style.display === 'none')
            return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            updateSelection(selectedIdx + 1);
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            updateSelection(selectedIdx - 1);
        }
        else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            acceptSuggestion(selectedIdx);
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            hideSuggest();
        }
    };
    view.dom.addEventListener('keydown', keyHandler, true);
    // 返回取消注册函数
    return () => {
        active = false;
        view.dom.removeEventListener('keydown', keyHandler, true);
        if (suggestEl) {
            suggestEl.remove();
            suggestEl = null;
        }
    };
}
function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
