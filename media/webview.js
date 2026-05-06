// md-annotate webview — self-contained (no ES module imports)
(function() {
'use strict';

var vscodeApi = acquireVsCodeApi();

console.log('[md-annotate] webview.js loaded');

// 错误上报到 extension
window.onerror = function(msg, src, line, col, err) {
  console.error('[md-annotate] Error:', msg, 'at', src, line, col);
  try { vscodeApi.postMessage({ type: 'webviewError', error: String(msg), stack: err?.stack }); } catch(e) {}
};


// ─── createEditor 运行时（from md-live-preview）───
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

function createEditor(container, options = {}, backend = {}) {
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
        expandText() {
      // 中文括号转换规则（与 Obsidian 一致）
      var cm = view;
      var state = cm.state;
      var cursor = state.selection.main.head;
      var line = state.doc.lineAt(cursor);
      var textBefore = line.text.slice(0, cursor - line.from);
      var rules = [
        { regex: /(！)?【【$/, replace: function(m) { return m[1] ? '![[' : '[['; } },
        { regex: /】】$/, replace: function() { return ']]'; } },
      ];
      for (var i = 0; i < rules.length; i++) {
        var match = textBefore.match(rules[i].regex);
        if (match) {
          var replaceText = rules[i].replace(match);
          var from = cursor - match[0].length;
          cm.dispatch({
            changes: { from: from, to: cursor, insert: replaceText },
            selection: { anchor: from + replaceText.length },
          });
          break;
        }
      }
    },
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


// ─── PostMessage 桥接 ───
/**
 * md-annotate webview 入口
 * 
 * 职责：
 * 1. 通过 postMessage 桥接 EditorBackend 到 extension 端
 * 2. 初始化 md-live-preview 编辑器
 * 3. 处理批注交互（选中文本 → 弹出批注框）
 */

// vscodeApi already acquired above

// ─── PostMessage 桥接 ───

let requestId = 0;
const pendingRequests = new Map();

function rpcCall(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });
    vscodeApi.postMessage({ type: 'rpc', id, method, params });
    // 超时 10s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 10000);
  });
}

// ─── EditorBackend 实现（通过 RPC 代理到 extension） ───

const backend = {
  async listLinkTargets() {
    return rpcCall('listLinkTargets', {});
  },
  resolveLinkPath(linktext, sourcePath) {
    // 同步方法——使用预加载的索引
    return linkIndex.get(linktext) || linkIndex.get(linktext + '.md') || null;
  },
  getResourceUrl(path) {
    // 使用 extension 预传入的 resourceBaseUri
    return resourceBaseUri + '/' + encodeURIComponent(path);
  },
  async readFile(path) {
    return rpcCall('readFile', { path });
  },
  openFile(path) {
    vscodeApi.postMessage({ type: 'rpc', id: 0, method: 'openFile', params: { path } });
  },
  async saveAttachment(name, data) {
    // ArrayBuffer → base64
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return rpcCall('saveAttachment', { name, base64 });
  },
};

// 链接索引（预加载，用于同步 resolveLinkPath）
let linkIndex = new Map();
let resourceBaseUri = '';

// ─── 消息处理 ───

let editor = null;
let currentFilePath = '';
let annotationMode = false;
let humanAnnotations = [];
let aiAnnotations = [];

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'rpcResult': {
      const pending = pendingRequests.get(msg.id);
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
      linkIndex = new Map((msg.linkTargets || []).map(t => [t.name, t.path]));
      // 也加入路径作为 key
      (msg.linkTargets || []).forEach(t => {
        linkIndex.set(t.path, t.path);
        if (t.aliases) t.aliases.forEach(a => linkIndex.set(a, t.path));
      });
      initEditor(msg.doc || '', msg.filePath || 'untitled.md');
      break;
    }
    case 'updateAnnotations': {
      humanAnnotations = msg.humanAnnotations || [];
      aiAnnotations = msg.aiAnnotations || [];
      renderAnnotationGutter();
      highlightAnnotatedText();
      break;
    }
    case 'setDoc': {
      if (editor) editor.setDoc(msg.content);
      break;
    }
    case 'updateLinkIndex': {
      linkIndex = new Map((msg.linkTargets || []).map(t => [t.name, t.path]));
      (msg.linkTargets || []).forEach(t => {
        linkIndex.set(t.path, t.path);
        if (t.aliases) t.aliases.forEach(a => linkIndex.set(a, t.path));
      });
      break;
    }
  }
});

// ─── 编辑器初始化 ───

async function initEditor(doc, filePath) {
  try {
  const container = document.getElementById('editor-container');
  if (!container) return;


  editor = createEditor(container, {
    doc,
    filePath,
    theme: document.body.classList.contains('vscode-light') ? 'light' : 'dark',
    onChange(newDoc) {
      vscodeApi.postMessage({ type: 'docChanged', doc: newDoc });
    },
    onSave(newDoc) {
      vscodeApi.postMessage({ type: 'save', doc: newDoc });
    },
  }, backend);

  // ready 消息已移动到文件末尾，避免 init 死锁

  // 设置批注交互
  setupAnnotationInteraction(container);
  
  // ─── [[ 链接补全 ───
  setupLinkCompletion(editor.view);
  // ─── 链接点击处理 ───
  setupLinkClick(editor.view);


  } catch(e) {
    console.error('[md-annotate] initEditor failed:', e);
    document.getElementById('editor-container').textContent = 'Editor init error: ' + e.message;
  }
}

// ─── 批注交互 ───

function setupAnnotationInteraction(container) {
  container.addEventListener('contextmenu', (e) => {
    if (!editor) return;
    const sel = editor.getSelection();
    if (!sel || sel.trim().length === 0) return;

    e.preventDefault();
    showAnnotationPopover(e, sel);
  });
}

function showAnnotationPopover(event, selectedText) {
  // 移除已有 popover
  const existing = document.getElementById('annotation-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.id = 'annotation-popover';
  popover.className = 'annotation-popover visible';
  popover.innerHTML = `
    <div class="popover-header">
      批注选中的文本：
      <span class="selected-preview">${escapeHtml(selectedText.length > 50 ? selectedText.slice(0, 50) + '…' : selectedText)}</span>
    </div>
    <textarea id="annotation-input" placeholder="写下你的批注..."></textarea>
    <div class="popover-actions">
      <button class="btn-cancel" id="btn-cancel-annotation">取消</button>
      <button class="btn-primary" id="btn-submit-annotation">添加</button>
    </div>
    <div class="hint">Ctrl+Enter 提交 · Esc 取消</div>
  `;

  // 定位
  const contentArea = document.getElementById('main-area');
  const rect = contentArea.getBoundingClientRect();
  popover.style.left = Math.min(event.clientX - rect.left, rect.width - 360) + 'px';
  popover.style.top = (event.clientY - rect.top + 8) + 'px';

  contentArea.appendChild(popover);

  const textarea = document.getElementById('annotation-input');
  setTimeout(() => textarea.focus(), 30);

  // 事件
  document.getElementById('btn-submit-annotation').addEventListener('click', () => {
    submitAnnotation(selectedText, textarea.value.trim());
  });
  document.getElementById('btn-cancel-annotation').addEventListener('click', () => {
    popover.remove();
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submitAnnotation(selectedText, textarea.value.trim());
    }
    if (e.key === 'Escape') popover.remove();
  });

  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('mousedown', function handler(e) {
      if (!popover.contains(e.target)) {
        popover.remove();
        document.removeEventListener('mousedown', handler);
      }
    });
  }, 100);
}

function submitAnnotation(selectedText, content) {
  if (!content) return;
  const anchor = {
    type: 'text-range',
    start_text: selectedText.slice(0, 30),
    end_text: selectedText.length > 30 ? selectedText.slice(-30) : selectedText,
  };
  vscodeApi.postMessage({ type: 'addAnnotation', anchor, content, tags: [] });
  const popover = document.getElementById('annotation-popover');
  if (popover) popover.remove();
}

// ─── 批注渲染 ───

function renderAnnotationGutter() {
  const gutter = document.getElementById('annotation-gutter');
  if (!gutter) return;

  const allAnns = [
    ...humanAnnotations.map(a => ({ ...a, _authorType: 'human' })),
    ...aiAnnotations.map(a => ({ ...a, _authorType: 'ai' })),
  ];

  if (allAnns.length === 0) {
    gutter.innerHTML = '<div class="gutter-empty">选中文本，右键添加批注</div>';
    return;
  }

  gutter.innerHTML = allAnns
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(ann => `
      <div class="annotation-card ${ann._authorType} ${ann.resolved ? 'resolved' : ''}" data-ann-id="${ann.id}" data-anchor='${JSON.stringify(ann.anchor)}'>
        <div class="card-header">
          <span>${ann._authorType === 'human' ? '👤' : '🤖'}</span>
          <span class="card-date">${formatDate(ann.created_at)}</span>
          ${ann._authorType === 'human' ? `
          <div class="card-actions">
            <button data-action="resolve" data-id="${ann.id}" title="已解决">✓</button>
            <button data-action="delete" data-id="${ann.id}" title="删除">✕</button>
          </div>` : ''}
        </div>
        <div class="card-content">${escapeHtml(ann.content)}</div>
        <div class="card-anchor">${formatAnchor(ann.anchor)}</div>
      </div>
    `).join('');
}

function highlightAnnotatedText() {
  // 在 CM6 中实现高亮需要 StateField——简化方案：通过 CSS class 标记
  // 这里通过 postMessage 通知 extension 当前有哪些 annotations 对应的文本范围
  // 实际高亮在 CM6 层比较复杂，先用 gutter 显示
}

// ─── 工具函数 ───

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatAnchor(anchor) {
  if (anchor.type === 'text-range') return '"' + escapeHtml(anchor.start_text) + '…"';
  if (anchor.type === 'heading') return '§ ' + escapeHtml(anchor.heading_text);
  if (anchor.type === 'line-range') return 'L' + anchor.start_line + '–' + anchor.end_line;
  return '';
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 事件代理：gutter 上的点击操作
(function setupGutterEvents() {
  var gutter = document.getElementById('annotation-gutter');
  if (!gutter) return;
  gutter.addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-action]');
    if (btn) {
      e.stopPropagation();
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if (action === 'resolve') {
        vscodeApi.postMessage({ type: 'resolveAnnotation', id: id });
      } else if (action === 'delete') {
        vscodeApi.postMessage({ type: 'removeAnnotation', id: id });
      }
      return;
    }
    // 点击卡片跳转到对应位置
    var card = e.target.closest('.annotation-card[data-anchor]');
    if (card && editor) {
      try {
        var anchor = JSON.parse(card.getAttribute('data-anchor'));
        jumpToAnchor(anchor);
      } catch(err) {
        console.warn('[md-annotate] jump failed:', err);
      }
    }
  });
})();

function jumpToAnchor(anchor) {
  if (!editor || !editor.view) return;
  var view = editor.view;
  var doc = view.state.doc.toString();
  var pos = -1;

  if (anchor.type === 'text-range' && anchor.start_text) {
    pos = doc.indexOf(anchor.start_text);
  } else if (anchor.type === 'heading' && anchor.heading_text) {
    pos = doc.indexOf(anchor.heading_text);
  } else if (anchor.type === 'line-range' && anchor.start_line) {
    var line = Math.min(anchor.start_line, view.state.doc.lines);
    pos = view.state.doc.line(line).from;
  }

  if (pos >= 0) {
    view.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true,
    });
    view.focus();
  }
}


// ─── 链接点击处理 ───
function setupLinkClick(view) {
  view.dom.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || !target.closest) return;

    // 内部链接：[[link]] — 渲染后有 .cm-hmd-internal-link 和 .internal-link class
    var internalLink = target.closest('.internal-link, .cm-hmd-internal-link');
    if (internalLink) {
      e.preventDefault();
      e.stopPropagation();
      var linkText = internalLink.getAttribute('data-href') 
        || internalLink.getAttribute('href')
        || internalLink.textContent.trim();
      if (linkText) {
        backend.openFile(linkText);
      }
      return;
    }

    // 外部链接：[text](url) — 渲染后有 .external-link 或 a[href]
    var externalLink = target.closest('.external-link, a.cm-underline[href], .cm-url');
    if (externalLink) {
      var href = externalLink.getAttribute('href') || externalLink.getAttribute('data-href');
      if (!href) {
        // 尝试从 .cm-url 中提取
        href = externalLink.textContent.trim();
      }
      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
        e.preventDefault();
        e.stopPropagation();
        vscodeApi.postMessage({ type: 'rpc', id: 0, method: 'openExternal', params: { url: href } });
        return;
      }
    }

    // Fallback: 检查点击的是否是带下划线的链接文本
    var underline = target.closest('.cm-underline');
    if (underline) {
      var linkParent = underline.closest('.cm-hmd-internal-link');
      if (linkParent) {
        e.preventDefault();
        e.stopPropagation();
        // 从 CM6 syntax tree 获取链接文本
        var pos = view.posAtDOM(underline);
        var linkContent = extractLinkAtPos(view, pos);
        if (linkContent) {
          backend.openFile(linkContent);
        }
        return;
      }
      // 外部链接的下划线
      var extParent = underline.closest('.cm-link');
      if (extParent) {
        var urlEl = extParent.parentElement && extParent.parentElement.querySelector('.cm-url, .cm-string');
        if (urlEl) {
          var url = urlEl.textContent.replace(/^\(|\)$/g, '');
          if (url.startsWith('http://') || url.startsWith('https://')) {
            e.preventDefault();
            e.stopPropagation();
            vscodeApi.postMessage({ type: 'rpc', id: 0, method: 'openExternal', params: { url: url } });
            return;
          }
        }
      }
    }
  });
}

function extractLinkAtPos(view, pos) {
  // 在文档中找到 pos 附近的 [[ ... ]] 或 [text](url) 
  var doc = view.state.doc.toString();
  // 找 [[ 开始
  var before = doc.lastIndexOf('[[', pos);
  if (before !== -1 && before >= pos - 200) {
    var after = doc.indexOf(']]', before + 2);
    if (after !== -1 && after < pos + 200) {
      var content = doc.slice(before + 2, after);
      // 处理 [[path|alias]] 格式
      var pipeIdx = content.indexOf('|');
      return pipeIdx !== -1 ? content.slice(0, pipeIdx) : content;
    }
  }
  return null;
}

// ─── [[ 链接自动补全 ───
function setupLinkCompletion(view) {
  var ViewPlugin = window.__cm6.ViewPlugin;
  var EditorView = window.__cm6.EditorView;

  var suggestEl = null;
  var suggestItems = [];
  var selectedIdx = 0;
  var triggerPos = -1;

  function createSuggestEl() {
    if (suggestEl) return suggestEl;
    suggestEl = document.createElement('div');
    suggestEl.className = 'link-suggest';
    suggestEl.style.cssText = 'position:fixed;z-index:1000;background:var(--vscode-editorSuggestWidget-background,#252526);border:1px solid var(--vscode-editorSuggestWidget-border,#454545);border-radius:4px;max-height:200px;overflow-y:auto;min-width:200px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:13px;display:none;';
    document.body.appendChild(suggestEl);
    return suggestEl;
  }

  function showSuggest(coords, items) {
    var el = createSuggestEl();
    suggestItems = items;
    selectedIdx = 0;
    el.innerHTML = items.map(function(item, i) {
      return '<div class="link-suggest-item' + (i === 0 ? ' selected' : '') + '" data-idx="' + i + '" style="padding:4px 8px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.path) + '</div>';
    }).join('');
    el.style.left = coords.left + 'px';
    el.style.top = (coords.bottom + 2) + 'px';
    el.style.display = 'block';

    // 点击选择
    el.onclick = function(e) {
      var itemEl = e.target.closest('.link-suggest-item');
      if (itemEl) {
        var idx = parseInt(itemEl.getAttribute('data-idx'));
        acceptSuggestion(view, idx);
      }
    };
  }

  function hideSuggest() {
    if (suggestEl) suggestEl.style.display = 'none';
    suggestItems = [];
    triggerPos = -1;
  }

  function updateSelection(idx) {
    if (!suggestEl) return;
    selectedIdx = Math.max(0, Math.min(idx, suggestItems.length - 1));
    var items = suggestEl.querySelectorAll('.link-suggest-item');
    items.forEach(function(el, i) {
      el.style.background = i === selectedIdx ? 'var(--vscode-list-activeSelectionBackground, #04395e)' : '';
      el.style.color = i === selectedIdx ? 'var(--vscode-list-activeSelectionForeground, #fff)' : '';
    });
    if (items[selectedIdx]) items[selectedIdx].scrollIntoView({ block: 'nearest' });
  }

  function acceptSuggestion(view, idx) {
    if (idx < 0 || idx >= suggestItems.length) return;
    var item = suggestItems[idx];
    // 替换从 [[ 之后到光标位置的文本，插入 path]]
    var cursor = view.state.selection.main.head;
    var insertText = item.path + ']]';
    view.dispatch({
      changes: { from: triggerPos + 2, to: cursor, insert: insertText },
      selection: { anchor: triggerPos + 2 + insertText.length },
    });
    hideSuggest();
    view.focus();
  }

  // 使用 EditorView.updateListener 监听文档/选区变更
  var EditorView = window.__cm6.EditorView;
  var StateEffect = window.__cm6.StateEffect;

  var listener = EditorView.updateListener.of(function(update) {
    if (!update.docChanged && !update.selectionSet) return;
    var state = update.state;
    var cursor = state.selection.main.head;
    var line = state.doc.lineAt(cursor);
    var textBefore = line.text.slice(0, cursor - line.from);

    // 使用 Obsidian 的触发逻辑：[[ 存在，且最后一个 ] 在 [[ 之前
    var bracketIdx = textBefore.lastIndexOf('[[');
    var lastClose = textBefore.lastIndexOf(']');
    if (bracketIdx === -1 || lastClose > bracketIdx) {
      hideSuggest();
      return;
    }
    var query = textBefore.slice(bracketIdx + 2).toLowerCase();
    triggerPos = line.from + bracketIdx;

    // 过滤匹配项
    var filtered = [];
    linkIndex.forEach(function(path, name) {
      if (name.toLowerCase().includes(query) || path.toLowerCase().includes(query)) {
        if (!filtered.some(function(f) { return f.path === path; })) {
          filtered.push({ name: name, path: path });
        }
      }
    });
    filtered = filtered.slice(0, 20);

    if (filtered.length === 0) {
      hideSuggest();
      return;
    }

    // 获取光标坐标
    var coords = update.view.coordsAtPos(cursor);
    if (!coords) {
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        var range = sel.getRangeAt(0);
        var rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          coords = { left: rect.left, bottom: rect.bottom };
        }
      }
      if (!coords) {
        var cursorEl = update.view.dom.querySelector('.cm-cursor');
        if (cursorEl) {
          var cursorRect = cursorEl.getBoundingClientRect();
          coords = { left: cursorRect.left, bottom: cursorRect.bottom };
        } else {
          var domRect = update.view.dom.getBoundingClientRect();
          coords = { left: domRect.left + 50, bottom: domRect.top + 30 };
        }
      }
    }
    showSuggest(coords, filtered);
  });

  view.dispatch({
    effects: StateEffect.appendConfig.of(listener),
  });

  // ─── 【【→[[ 中文括号自动转换 ───
  var cnBracketListener = EditorView.updateListener.of(function(update) {
    if (!update.docChanged) return;
    // 只在用户输入时触发（非程序性修改）
    var isUserInput = update.transactions.some(function(tr) {
      return tr.isUserEvent('input');
    });
    if (!isUserInput) return;

    var state = update.state;
    var cursor = state.selection.main.head;
    var line = state.doc.lineAt(cursor);
    var textBefore = line.text.slice(0, cursor - line.from);

    var rules = [
      { regex: /(！)?【【$/, replace: function(m) { return m[1] ? '![[' : '[['; } },
      { regex: /】】$/, replace: function() { return ']]'; } },
    ];

    for (var i = 0; i < rules.length; i++) {
      var match = textBefore.match(rules[i].regex);
      if (match) {
        var replaceText = rules[i].replace(match);
        var from = cursor - match[0].length;
        // 使用 setTimeout 避免在 update 回调中直接 dispatch
        setTimeout(function() {
          view.dispatch({
            changes: { from: from, to: cursor, insert: replaceText },
            selection: { anchor: from + replaceText.length },
          });
        }, 0);
        break;
      }
    }
  });

  view.dispatch({
    effects: StateEffect.appendConfig.of(cnBracketListener),
  });

  // 键盘事件处理（capture phase 确保在 CM6 keymap 之前拦截）
  view.dom.addEventListener('keydown', function(e) {
    if (!suggestEl || suggestEl.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      updateSelection(selectedIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      updateSelection(selectedIdx - 1);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      acceptSuggestion(view, selectedIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideSuggest();
    }
  }, true);
}

// 切回源码模式
window.addEventListener('switchToSource', () => {
  vscodeApi.postMessage({ type: 'switchToSource' });
});

// 脚本加载完毕，通知 extension 可以发送 init 数据了
vscodeApi.postMessage({ type: 'ready' });
console.log('[md-annotate] ready message sent to extension');


})();
