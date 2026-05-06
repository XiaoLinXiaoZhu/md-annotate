/**
 * CodeMirror 扩展的组装逻辑。
 * 将 Obsidian 暴露的各原子扩展按用户配置拼装为完整 extension 数组。
 */
export function buildLocalExtensions(view, mockOwner, mockEditor, editorEl, opts, be, deps) {
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
export function buildDynamicExtensions(mockApp, mockEditor, view, editorEl, opts, deps) {
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
