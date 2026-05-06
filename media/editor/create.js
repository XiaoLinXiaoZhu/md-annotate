import { defaultBackend, defaultOptions } from './defaults.js';
import { buildMockApp, buildMockEditor } from './mock-app.js';
import { buildLocalExtensions, buildDynamicExtensions } from './extensions.js';
import { setupLinkClickHandler } from './link-handler.js';
import { setupExpandText } from './expand-text.js';
import { setupSuggest } from './suggest.js';
export function createEditor(container, options = {}, backend = {}) {
    const opts = { ...defaultOptions, ...options };
    const be = { ...defaultBackend, ...backend };
    if (!window.__cm6 || !window.__cm6.EditorView) {
        throw new Error('md-live-preview: Obsidian runtime not loaded. ' +
            'Ensure vendor scripts are included before calling createEditor().');
    }
    const { EditorView, EditorState, keymap, syntaxTree } = window.__cm6;
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
        view.dispatch({});
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
