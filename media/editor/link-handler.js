export function setupLinkClickHandler(view, editorEl, opts, be) {
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
