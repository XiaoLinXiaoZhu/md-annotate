/**
 * 中文括号自动转换：【【→[[, 】】→]]
 */
const rules = [
    { regex: /(！)?【【$/, replace: (m) => m[1] ? '![[' : '[[' },
    { regex: /】】$/, replace: () => ']]' },
];
export function setupExpandText(view) {
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
                    });
                }, 0);
                break;
            }
        }
    });
    view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
}
