/**
 * md-annotate webview 入口
 * 
 * 职责：
 * 1. 通过 postMessage 桥接 EditorBackend 到 extension 端
 * 2. 初始化 md-live-preview 编辑器
 * 3. 处理批注交互（选中文本 → 弹出批注框）
 */

const vscodeApi = acquireVsCodeApi();

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
  const container = document.getElementById('editor-container');
  if (!container) return;

  // 动态导入 createEditor
  const { createEditor } = await import('./editor/create.js');

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

  // 初始化完成后请求批注数据
  vscodeApi.postMessage({ type: 'ready' });

  // 设置批注交互
  setupAnnotationInteraction(container);
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
      <div class="annotation-card ${ann._authorType} ${ann.resolved ? 'resolved' : ''}">
        <div class="card-header">
          <span>${ann._authorType === 'human' ? '👤' : '🤖'}</span>
          <span class="card-date">${formatDate(ann.created_at)}</span>
          ${ann._authorType === 'human' ? `
          <div class="card-actions">
            <button onclick="resolveAnnotation('${ann.id}')" title="已解决">✓</button>
            <button onclick="deleteAnnotation('${ann.id}')" title="删除">✕</button>
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

// 全局函数（onclick 调用）
window.resolveAnnotation = function (id) {
  vscodeApi.postMessage({ type: 'resolveAnnotation', id });
};
window.deleteAnnotation = function (id) {
  vscodeApi.postMessage({ type: 'removeAnnotation', id });
};

// 切回源码模式
window.addEventListener('switchToSource', () => {
  vscodeApi.postMessage({ type: 'switchToSource' });
});
