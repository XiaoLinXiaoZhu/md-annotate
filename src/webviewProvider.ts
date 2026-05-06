import * as vscode from "vscode";
import { AnnotationStore } from "./annotationStore";
import { Annotation } from "./types";

export class AnnotationWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mdAnnotate.annotationPanel";
  private view?: vscode.WebviewView;
  private currentUri?: vscode.Uri;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: AnnotationStore
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "resolve":
          if (this.currentUri) {
            await this.store.toggleResolved(this.currentUri, "human", message.id);
            this.refresh();
          }
          break;
        case "delete":
          if (this.currentUri) {
            await this.store.removeAnnotation(this.currentUri, "human", message.id);
            this.refresh();
          }
          break;
      }
    });

    this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.view) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "markdown") {
      this.view.webview.html = this.getEmptyHtml();
      return;
    }

    this.currentUri = editor.document.uri;
    const humanFile = await this.store.load(this.currentUri, "human");
    const aiFile = await this.store.load(this.currentUri, "ai");
    const allAnnotations = [
      ...humanFile.annotations.map((a) => ({ ...a, authorType: "human" as const })),
      ...aiFile.annotations.map((a) => ({ ...a, authorType: "ai" as const })),
    ];

    this.view.webview.html = this.getAnnotationsHtml(allAnnotations);
  }

  private getEmptyHtml(): string {
    return `<!DOCTYPE html>
<html><body><p style="color: var(--vscode-descriptionForeground); padding: 16px;">
Open a markdown file to see annotations.
</p></body></html>`;
  }

  private getAnnotationsHtml(annotations: (Annotation & { authorType: string })[]): string {
    const items = annotations
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(
        (ann) => `
        <div class="annotation ${ann.resolved ? "resolved" : ""} ${ann.authorType}">
          <div class="header">
            <span class="author">${ann.authorType === "human" ? "👤" : "🤖"}</span>
            <span class="date">${new Date(ann.created_at).toLocaleDateString()}</span>
            <span class="actions">
              <button onclick="resolve('${ann.id}')">✓</button>
              <button onclick="del('${ann.id}')">✕</button>
            </span>
          </div>
          <div class="anchor-info">${this.formatAnchor(ann.anchor)}</div>
          <div class="content">${escapeHtml(ann.content)}</div>
          ${ann.tags?.length ? `<div class="tags">${ann.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>` : ""}
        </div>`
      )
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: var(--vscode-font-family); padding: 8px; }
  .annotation { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-bottom: 8px; }
  .annotation.resolved { opacity: 0.5; }
  .annotation.human { border-left: 3px solid #4fc3f7; }
  .annotation.ai { border-left: 3px solid #ab47bc; }
  .header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .date { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
  .actions { margin-left: auto; }
  .actions button { background: none; border: none; cursor: pointer; color: var(--vscode-foreground); }
  .anchor-info { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-bottom: 4px; font-style: italic; }
  .content { white-space: pre-wrap; }
  .tags { margin-top: 4px; }
  .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-right: 4px; }
</style>
</head>
<body>
  ${annotations.length === 0 ? "<p>No annotations yet. Select text and right-click to add one.</p>" : items}
  <script>
    const vscode = acquireVsCodeApi();
    function resolve(id) { vscode.postMessage({ type: 'resolve', id }); }
    function del(id) { vscode.postMessage({ type: 'delete', id }); }
  </script>
</body>
</html>`;
  }

  private formatAnchor(anchor: any): string {
    switch (anchor.type) {
      case "text-range":
        return `"${anchor.start_text}…${anchor.end_text}"`;
      case "line-range":
        return `Lines ${anchor.start_line}–${anchor.end_line}`;
      case "heading":
        return `§ ${anchor.heading_text}`;
      default:
        return "";
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
