export const defaultBackend = {
    resolveLinkPath() { return null; },
    getResourceUrl(path) { return path; },
    async listLinkTargets() { return []; },
    async readFile() { return ''; },
    openFile() { },
    async saveAttachment() { return ''; },
};
export const defaultOptions = {
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
