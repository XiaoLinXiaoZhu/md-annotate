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
    // 返回实例
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
