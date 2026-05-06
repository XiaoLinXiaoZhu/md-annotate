import * as vscode from "vscode";
import { AnnotationStore } from "./annotationStore";

/**
 * CustomTextEditor：批注模式
 * 
 * 交互：选中文本 + 右键 → "在这里批注" → 原地弹出输入框
 * 渲染：markdown-it（通过 CDN 加载到 webview）
 */
export class AnnotationEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = "mdAnnotate.annotationEditor";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: AnnotationStore
  ) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    const update = async () => {
      const mdContent = document.getText();
      const humanFile = await this.store.load(document.uri, "human");
      const aiFile = await this.store.load(document.uri, "ai");
      webviewPanel.webview.postMessage({
        type: "update",
        markdown: mdContent,
        humanAnnotations: humanFile.annotations,
        aiAnnotations: aiFile.annotations,
      });
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    // 等 webview ready 后再发数据
    const readyDisposable = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        await update();
      }
    });

    const changeSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        update();
      }
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "addAnnotation": {
          await this.store.addAnnotation(
            document.uri,
            "human",
            msg.anchor,
            msg.content,
            msg.tags
          );
          await update();
          break;
        }
        case "removeAnnotation": {
          await this.store.removeAnnotation(document.uri, "human", msg.id);
          await update();
          break;
        }
        case "resolveAnnotation": {
          await this.store.toggleResolved(document.uri, "human", msg.id);
          await update();
          break;
        }
        case "switchToSource": {
          await vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
          break;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      readyDisposable.dispose();
    });
  }

  private getHtml(_webview: vscode.Webview): string {
    // markdown-it 通过 CDN 加载，避免 bundle 复杂度
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js"></script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 顶部工具栏 */
.toolbar {
  border-bottom: 1px solid var(--vscode-panel-border);
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.toolbar button {
  background: none;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-foreground);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.toolbar button:hover { background: var(--vscode-toolbar-hoverBackground); }
.toolbar .spacer { flex: 1; }
.toolbar .title { font-size: 13px; color: var(--vscode-descriptionForeground); }

/* 主区域 */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 内容区 */
.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 32px 48px;
  position: relative;
}

/* markdown-it 渲染样式 */
.markdown-body {
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
  font-size: 15px;
}
.markdown-body h1 { font-size: 1.8em; margin: 0.8em 0 0.4em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
.markdown-body h2 { font-size: 1.4em; margin: 1em 0 0.4em; }
.markdown-body h3 { font-size: 1.2em; margin: 0.8em 0 0.3em; }
.markdown-body h4 { font-size: 1.05em; margin: 0.6em 0 0.2em; }
.markdown-body p { margin: 0.6em 0; }
.markdown-body ul, .markdown-body ol { margin: 0.5em 0; padding-left: 1.5em; }
.markdown-body li { margin: 0.2em 0; }
.markdown-body li > ul, .markdown-body li > ol { margin: 0.1em 0; }
.markdown-body code { background: var(--vscode-textCodeBlock-background); padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
.markdown-body pre { background: var(--vscode-textCodeBlock-background); padding: 12px 16px; border-radius: 6px; overflow-x: auto; margin: 0.8em 0; }
.markdown-body pre code { background: none; padding: 0; }
.markdown-body blockquote { border-left: 3px solid var(--vscode-textBlockQuote-border); padding-left: 12px; margin: 0.6em 0; opacity: 0.85; }
.markdown-body a { color: var(--vscode-textLink-foreground); }
.markdown-body hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 1.5em 0; }
.markdown-body table { border-collapse: collapse; margin: 0.8em 0; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid var(--vscode-panel-border); padding: 6px 12px; text-align: left; }
.markdown-body th { background: var(--vscode-textCodeBlock-background); }
.markdown-body img { max-width: 100%; }

/* 被批注的文本 */
.annotated-text {
  background: rgba(79, 195, 247, 0.15);
  border-bottom: 2px solid #4fc3f7;
  cursor: pointer;
  border-radius: 2px;
}
.annotated-text:hover { background: rgba(79, 195, 247, 0.3); }
.annotated-text.ai-annotated {
  background: rgba(171, 71, 188, 0.12);
  border-bottom-color: #ab47bc;
}
.annotated-text.ai-annotated:hover { background: rgba(171, 71, 188, 0.25); }

/* 批注侧栏 */
.annotation-gutter {
  width: 280px;
  min-width: 280px;
  border-left: 1px solid var(--vscode-panel-border);
  overflow-y: auto;
  padding: 16px;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
}

.annotation-card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  font-size: 13px;
  transition: box-shadow 0.15s;
}
.annotation-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.annotation-card.human { border-left: 3px solid #4fc3f7; }
.annotation-card.ai { border-left: 3px solid #ab47bc; }
.annotation-card.resolved { opacity: 0.5; }
.annotation-card .card-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
  font-size: 11px; color: var(--vscode-descriptionForeground);
}
.annotation-card .card-actions { margin-left: auto; display: flex; gap: 4px; }
.annotation-card .card-actions button {
  background: none; border: none; cursor: pointer;
  color: var(--vscode-descriptionForeground); font-size: 13px;
  padding: 2px 4px; border-radius: 3px;
}
.annotation-card .card-actions button:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}
.annotation-card .card-content { line-height: 1.5; }
.annotation-card .card-anchor {
  font-size: 11px; color: var(--vscode-descriptionForeground);
  font-style: italic; margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* 评论输入浮窗 */
.comment-popover {
  position: absolute;
  z-index: 100;
  background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  padding: 12px;
  width: 340px;
  display: none;
}
.comment-popover.visible { display: block; }
.comment-popover textarea {
  width: 100%; min-height: 72px;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 4px; padding: 8px; font-size: 13px;
  resize: vertical; font-family: inherit;
}
.comment-popover textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
.comment-popover .popover-header {
  font-size: 12px; color: var(--vscode-descriptionForeground);
  margin-bottom: 8px; line-height: 1.4;
}
.comment-popover .popover-header .selected-preview {
  font-style: italic; display: block; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.comment-popover .popover-actions {
  display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;
}
.comment-popover .popover-actions button {
  padding: 5px 14px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px;
}
.comment-popover .btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}
.comment-popover .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.comment-popover .btn-cancel {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}
.comment-popover .hint {
  font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 6px;
}
</style>
</head>
<body>
  <div class="toolbar">
    <span class="title">批注模式</span>
    <span class="spacer"></span>
    <button id="btn-back-to-source">← 源码</button>
  </div>
  <div class="main">
    <div class="content-area" id="content-area">
      <div class="markdown-body" id="markdown-body"></div>
      <div class="comment-popover" id="comment-popover">
        <div class="popover-header">
          批注选中的文本：
          <span class="selected-preview" id="popover-anchor-text"></span>
        </div>
        <textarea id="comment-input" placeholder="写下你的批注..."></textarea>
        <div class="popover-actions">
          <button class="btn-cancel" id="btn-cancel-comment">取消</button>
          <button class="btn-primary" id="btn-submit-comment">添加</button>
        </div>
        <div class="hint">Ctrl+Enter 提交 · Esc 取消</div>
      </div>
    </div>
    <div class="annotation-gutter" id="annotation-gutter"></div>
  </div>

<script>
const vscodeApi = acquireVsCodeApi();

let md = null; // markdown-it instance
let currentMarkdown = "";
let humanAnnotations = [];
let aiAnnotations = [];
let pendingAnchor = null;
let pendingSelectionRect = null;
const contentArea = document.getElementById("content-area");

// 等 markdown-it 加载完成
function initMarkdownIt() {
  if (typeof markdownit !== "undefined") {
    md = markdownit({
      html: true,
      linkify: true,
      typographer: true,
      breaks: true
    });
    vscodeApi.postMessage({ type: "ready" });
  } else {
    setTimeout(initMarkdownIt, 100);
  }
}
initMarkdownIt();

// ─── 消息处理 ───
window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type === "update") {
    currentMarkdown = msg.markdown;
    humanAnnotations = msg.humanAnnotations || [];
    aiAnnotations = msg.aiAnnotations || [];
    render();
  }
});

// ─── 渲染 ───
function render() {
  if (!md) return;
  const body = document.getElementById("markdown-body");
  body.innerHTML = md.render(currentMarkdown);
  highlightAnnotations(body);
  renderGutter();
}

function highlightAnnotations(container) {
  const allAnns = [
    ...humanAnnotations.map(a => ({...a, _authorType: "human"})),
    ...aiAnnotations.map(a => ({...a, _authorType: "ai"}))
  ];
  for (const ann of allAnns) {
    if (ann.resolved) continue;
    if (ann.anchor.type === "text-range" && ann.anchor.start_text) {
      highlightText(container, ann.anchor.start_text, ann);
    }
  }
}

function highlightText(container, searchText, ann) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const idx = node.textContent.indexOf(searchText);
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, Math.min(idx + searchText.length, node.textContent.length));
    const span = document.createElement("span");
    span.className = "annotated-text" + (ann._authorType === "ai" ? " ai-annotated" : "");
    span.dataset.annId = ann.id;
    span.title = ann.content;
    range.surroundContents(span);
    break;
  }
}

function renderGutter() {
  const gutter = document.getElementById("annotation-gutter");
  const allAnns = [
    ...humanAnnotations.map(a => ({...a, _authorType: "human"})),
    ...aiAnnotations.map(a => ({...a, _authorType: "ai"}))
  ];
  if (allAnns.length === 0) {
    gutter.innerHTML = '<div style="padding:16px;color:var(--vscode-descriptionForeground);font-size:13px;">选中文本，右键添加批注</div>';
    return;
  }
  gutter.innerHTML = allAnns
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(ann => \`
      <div class="annotation-card \${ann._authorType} \${ann.resolved ? 'resolved' : ''}">
        <div class="card-header">
          <span>\${ann._authorType === 'human' ? '👤' : '🤖'}</span>
          <span>\${formatDate(ann.created_at)}</span>
          \${ann._authorType === 'human' ? \`
          <div class="card-actions">
            <button onclick="resolveAnn('\${ann.id}')" title="已解决">✓</button>
            <button onclick="deleteAnn('\${ann.id}')" title="删除">✕</button>
          </div>\` : ''}
        </div>
        <div class="card-content">\${escapeHtml(ann.content)}</div>
        <div class="card-anchor">\${formatAnchor(ann.anchor)}</div>
      </div>
    \`).join("");
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}
function formatAnchor(anchor) {
  if (anchor.type === "text-range") return '"' + anchor.start_text + '…"';
  if (anchor.type === "heading") return "§ " + anchor.heading_text;
  if (anchor.type === "line-range") return "L" + anchor.start_line + "–" + anchor.end_line;
  return "";
}
function escapeHtml(text) {
  return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─── 选中 + 右键 = 直接弹输入框 ───
contentArea.addEventListener("contextmenu", (e) => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
    return; // 没选中，不做任何事
  }
  
  e.preventDefault();
  
  const selectedText = sel.toString().trim();
  pendingAnchor = {
    type: "text-range",
    start_text: selectedText.slice(0, 30),
    end_text: selectedText.length > 30 ? selectedText.slice(-30) : selectedText,
  };
  
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const containerRect = contentArea.getBoundingClientRect();
  
  const popover = document.getElementById("comment-popover");
  const popoverLeft = Math.max(10, Math.min(
    rect.left - containerRect.left,
    contentArea.clientWidth - 360
  ));
  popover.style.left = popoverLeft + "px";
  popover.style.top = (rect.bottom - containerRect.top + contentArea.scrollTop + 8) + "px";
  
  document.getElementById("popover-anchor-text").textContent =
    selectedText.length > 50 ? selectedText.slice(0, 50) + "…" : selectedText;
  document.getElementById("comment-input").value = "";
  
  popover.classList.add("visible");
  setTimeout(() => document.getElementById("comment-input").focus(), 30);
});

// ─── 评论浮窗操作 ───
document.getElementById("btn-submit-comment").addEventListener("click", submitComment);
document.getElementById("btn-cancel-comment").addEventListener("click", cancelComment);

document.getElementById("comment-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { submitComment(); }
  if (e.key === "Escape") { cancelComment(); }
});

function submitComment() {
  const content = document.getElementById("comment-input").value.trim();
  if (!content || !pendingAnchor) return;
  vscodeApi.postMessage({ type: "addAnnotation", anchor: pendingAnchor, content, tags: [] });
  document.getElementById("comment-popover").classList.remove("visible");
  pendingAnchor = null;
  window.getSelection().removeAllRanges();
}

function cancelComment() {
  document.getElementById("comment-popover").classList.remove("visible");
  pendingAnchor = null;
}

// 点击内容区空白处关闭浮窗
contentArea.addEventListener("mousedown", (e) => {
  const popover = document.getElementById("comment-popover");
  if (!popover.contains(e.target)) {
    popover.classList.remove("visible");
  }
});

// ─── 批注操作 ───
function resolveAnn(id) { vscodeApi.postMessage({ type: "resolveAnnotation", id }); }
function deleteAnn(id) { vscodeApi.postMessage({ type: "removeAnnotation", id }); }

// ─── 切回源码 ───
document.getElementById("btn-back-to-source").addEventListener("click", () => {
  vscodeApi.postMessage({ type: "switchToSource" });
});
</script>
</body>
</html>`;
  }
}
