export function buildMockApp(be, opts) {
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
export function buildMockEditor(view, editorEl, mockApp, mockOwner, be, EditorView, EditorState) {
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
