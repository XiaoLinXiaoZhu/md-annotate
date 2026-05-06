import * as vscode from "vscode";
import * as path from "path";
import { AnnotationStore } from "./annotationStore";

/**
 * CustomTextEditor：批注模式（集成 md-live-preview 编辑器）
 *
 * webview 加载 md-live-preview 运行时，通过 postMessage RPC 实现完整后端：
 * - listLinkTargets: 扫描 workspace 所有 .md 文件
 * - resolveLinkPath: 检查文件是否存在
 * - getResourceUrl: webview URI 转换
 * - readFile: 读取文件内容
 * - openFile: 在编辑器中打开文件
 * - saveAttachment: 保存图片到附件目录
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
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "media"),
        // 允许访问 workspace 内的资源（图片等）
        ...(vscode.workspace.workspaceFolders?.map(f => f.uri) || []),
      ],
    };

    // 资源 URI 基础路径
    const mediaUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media")
    );

    // workspace 资源基础路径（用于图片等）
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspaceRoot = workspaceFolder?.uri || vscode.Uri.joinPath(document.uri, "..");
    const resourceBaseUri = webview.asWebviewUri(workspaceRoot).toString();

    // 预加载链接目标
    const linkTargets = await this.getLinkTargets();

    webview.html = this.getHtml(webview, mediaUri.toString());

    // ─── 消息处理 ───
    const messageHandler = webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "ready": {
          // 发送初始化数据
          webview.postMessage({
            type: "init",
            doc: document.getText(),
            filePath: vscode.workspace.asRelativePath(document.uri),
            resourceBaseUri,
            linkTargets,
          });
          // 发送批注数据
          await this.sendAnnotations(webview, document.uri);
          break;
        }

        case "docChanged": {
          // 应用编辑到文档
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            msg.doc
          );
          await vscode.workspace.applyEdit(edit);
          break;
        }

        case "save": {
          await document.save();
          break;
        }

        // ─── 批注操作 ───
        case "addAnnotation": {
          await this.store.addAnnotation(
            document.uri, "human", msg.anchor, msg.content, msg.tags
          );
          await this.sendAnnotations(webview, document.uri);
          break;
        }
        case "removeAnnotation": {
          await this.store.removeAnnotation(document.uri, "human", msg.id);
          await this.sendAnnotations(webview, document.uri);
          break;
        }
        case "resolveAnnotation": {
          await this.store.toggleResolved(document.uri, "human", msg.id);
          await this.sendAnnotations(webview, document.uri);
          break;
        }

        // ─── RPC 后端调用 ───
        case "rpc": {
          await this.handleRpc(webview, document, msg);
          break;
        }

        case "switchToSource": {
          await vscode.commands.executeCommand("vscode.openWith", document.uri, "default");
          break;
        }
      }
    });

    // 文档被外部修改时同步到 webview
    const docChangeHandler = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
        // 只在非本 webview 触发的变更时同步（避免循环）
        // 通过检查是否是 undo/redo 或外部修改来判断
        if (e.reason === vscode.TextDocumentChangeReason.Undo ||
            e.reason === vscode.TextDocumentChangeReason.Redo) {
          webview.postMessage({ type: "setDoc", content: document.getText() });
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      messageHandler.dispose();
      docChangeHandler.dispose();
    });
  }

  // ─── RPC 处理 ───

  private async handleRpc(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    msg: { id: number; method: string; params: any }
  ): Promise<void> {
    const { id, method, params } = msg;

    try {
      let result: any;

      switch (method) {
        case "listLinkTargets": {
          result = await this.getLinkTargets();
          break;
        }

        case "resolveLinkPath": {
          result = await this.resolveLinkPath(params.linktext, params.sourcePath, document);
          break;
        }

        case "readFile": {
          result = await this.readFile(params.path, document);
          break;
        }

        case "openFile": {
          await this.openFile(params.path, document);
          result = null;
          break;
        }

        case "saveAttachment": {
          result = await this.saveAttachment(params.name, params.base64, document);
          break;
        }

        case "openExternal": {
          if (params.url) {
            vscode.env.openExternal(vscode.Uri.parse(params.url));
          }
          result = null;
          break;
        }

        default:
          throw new Error(`Unknown RPC method: ${method}`);
      }

      if (id !== 0) {
        webview.postMessage({ type: "rpcResult", id, result });
      }
    } catch (err: any) {
      if (id !== 0) {
        webview.postMessage({ type: "rpcResult", id, error: err.message });
      }
    }
  }

  // ─── 后端实现 ───

  private async getLinkTargets(): Promise<{ path: string; name: string; aliases: string[] }[]> {
    const files = await vscode.workspace.findFiles("**/*.md", "**/node_modules/**", 5000);
    return files.map((uri) => {
      const rel = vscode.workspace.asRelativePath(uri);
      const name = path.basename(rel, ".md");
      return { path: rel, name, aliases: [] };
    });
  }

  private async resolveLinkPath(
    linktext: string,
    _sourcePath: string,
    document: vscode.TextDocument
  ): Promise<string | null> {
    // 尝试多种解析方式
    const candidates = [
      linktext,
      linktext + ".md",
      linktext.replace(/\//g, path.sep),
      linktext.replace(/\//g, path.sep) + ".md",
    ];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) return null;

    for (const candidate of candidates) {
      const uri = vscode.Uri.joinPath(workspaceFolder.uri, candidate);
      try {
        await vscode.workspace.fs.stat(uri);
        return vscode.workspace.asRelativePath(uri);
      } catch {
        // 不存在，继续
      }
    }

    // 模糊搜索：basename 匹配
    const baseName = path.basename(linktext, ".md");
    const found = await vscode.workspace.findFiles(`**/${baseName}.md`, "**/node_modules/**", 1);
    if (found.length > 0) {
      return vscode.workspace.asRelativePath(found[0]);
    }

    return null;
  }

  private async readFile(filePath: string, document: vscode.TextDocument): Promise<string> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) return "";

    const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString("utf-8");
    } catch {
      return "";
    }
  }

  private async openFile(filePath: string, document: vscode.TextDocument): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) return;

    // 尝试直接路径
    let uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      // 尝试加 .md
      uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath + ".md");
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        // 模糊搜索
        const baseName = path.basename(filePath, ".md");
        const found = await vscode.workspace.findFiles(`**/${baseName}.md`, "**/node_modules/**", 1);
        if (found.length > 0) {
          uri = found[0];
        } else {
          vscode.window.showWarningMessage(`找不到文件: ${filePath}`);
          return;
        }
      }
    }

    await vscode.window.showTextDocument(uri, { preview: true });
  }

  private async saveAttachment(
    name: string,
    base64: string,
    document: vscode.TextDocument
  ): Promise<string> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) throw new Error("No workspace folder");

    // 存储到文档同目录的 assets/ 子目录
    const docDir = path.dirname(document.uri.fsPath);
    const attachDir = path.join(docDir, "assets");
    const attachUri = vscode.Uri.file(attachDir);

    try {
      await vscode.workspace.fs.stat(attachUri);
    } catch {
      await vscode.workspace.fs.createDirectory(attachUri);
    }

    // 避免重名
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let finalName = name;
    let counter = 1;
    while (true) {
      const targetUri = vscode.Uri.file(path.join(attachDir, finalName));
      try {
        await vscode.workspace.fs.stat(targetUri);
        finalName = `${base}-${counter}${ext}`;
        counter++;
      } catch {
        break;
      }
    }

    // 写入文件
    const buffer = Buffer.from(base64, "base64");
    const targetUri = vscode.Uri.file(path.join(attachDir, finalName));
    await vscode.workspace.fs.writeFile(targetUri, buffer);

    // 返回相对于文档的路径
    const docRelDir = vscode.workspace.asRelativePath(document.uri);
    const docFolder = path.dirname(docRelDir);
    return path.posix.join("assets", finalName);
  }

  // ─── 批注数据发送 ───

  private async sendAnnotations(webview: vscode.Webview, uri: vscode.Uri): Promise<void> {
    const humanFile = await this.store.load(uri, "human");
    const aiFile = await this.store.load(uri, "ai");
    webview.postMessage({
      type: "updateAnnotations",
      humanAnnotations: humanFile.annotations,
      aiAnnotations: aiFile.annotations,
    });
  }

  // ─── HTML 生成 ───

  private getHtml(webview: vscode.Webview, mediaBase: string): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; connect-src ${webview.cspSource};">
<link rel="stylesheet" href="${mediaBase}/app.css">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--vscode-font-family);
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* 工具栏 */
.toolbar {
  border-bottom: 1px solid var(--vscode-panel-border);
  padding: 4px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  font-size: 12px;
}
.toolbar button {
  background: none;
  border: 1px solid var(--vscode-button-secondaryBackground);
  color: var(--vscode-foreground);
  padding: 3px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}
.toolbar button:hover { background: var(--vscode-toolbar-hoverBackground); }
.toolbar .spacer { flex: 1; }
.toolbar .title { color: var(--vscode-descriptionForeground); }

/* 主区域 */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 编辑器容器 */
#main-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}
#editor-container {
  height: 100%;
  overflow-y: auto;
}

/* 批注侧栏 */
#annotation-gutter {
  width: 260px;
  min-width: 260px;
  border-left: 1px solid var(--vscode-panel-border);
  overflow-y: auto;
  padding: 12px;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
}

.gutter-empty {
  padding: 12px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

.annotation-card {
  border: 1px solid var(--vscode-panel-border);
  border-radius: 5px;
  padding: 8px 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.annotation-card:hover { box-shadow: 0 1px 6px rgba(0,0,0,0.12); }
.annotation-card.human { border-left: 3px solid #4fc3f7; }
.annotation-card.ai { border-left: 3px solid #ab47bc; }
.annotation-card.resolved { opacity: 0.5; }
.annotation-card .card-header {
  display: flex; align-items: center; gap: 5px; margin-bottom: 4px;
  font-size: 10px; color: var(--vscode-descriptionForeground);
}
.annotation-card .card-date { flex: 1; }
.annotation-card .card-actions { display: flex; gap: 3px; }
.annotation-card .card-actions button {
  background: none; border: none; cursor: pointer;
  color: var(--vscode-descriptionForeground); font-size: 12px;
  padding: 1px 3px; border-radius: 2px;
}
.annotation-card .card-actions button:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}
.annotation-card .card-content { line-height: 1.4; margin-bottom: 3px; }
.annotation-card .card-anchor {
  font-size: 10px; color: var(--vscode-descriptionForeground);
  font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 批注输入浮窗 */
.annotation-popover {
  position: absolute;
  z-index: 100;
  background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0,0,0,0.2);
  padding: 10px;
  width: 320px;
}
.annotation-popover .popover-header {
  font-size: 11px; color: var(--vscode-descriptionForeground);
  margin-bottom: 6px;
}
.annotation-popover .selected-preview {
  font-style: italic; display: block; margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.annotation-popover textarea {
  width: 100%; min-height: 60px;
  border: 1px solid var(--vscode-input-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 3px; padding: 6px; font-size: 12px;
  resize: vertical; font-family: inherit;
}
.annotation-popover textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
.annotation-popover .popover-actions {
  display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;
}
.annotation-popover .popover-actions button {
  padding: 4px 12px; border-radius: 3px; border: none; cursor: pointer; font-size: 11px;
}
.annotation-popover .btn-primary {
  background: var(--vscode-button-background); color: var(--vscode-button-foreground);
}
.annotation-popover .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
.annotation-popover .btn-cancel {
  background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
}
.annotation-popover .hint {
  font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px;
}
</style>
</head>
<body class="theme-dark">
  <div class="toolbar">
    <span class="title">📝 批注模式</span>
    <span class="spacer"></span>
    <button id="btn-back-to-source">← 源码模式</button>
  </div>
  <div class="main">
    <div id="main-area">
      <div id="editor-container" class="markdown-source-view mod-cm6 is-live-preview is-readable-line-width"></div>
    </div>
    <div id="annotation-gutter">
      <div class="gutter-empty">加载中...</div>
    </div>
  </div>

  <!-- Obsidian 运行时 (with diagnostics) -->
  <script nonce="${nonce}">console.log('[md-annotate] loading scripts...');</script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/lib/i18next.min.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ i18next', typeof i18next);</script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/lib/codemirror.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ codemirror', typeof CodeMirror);</script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/lib/meta.min.js"></script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/lib/modes.min.js"></script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/lib/markdown.js"></script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/lib/turndown.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ turndown', typeof TurndownService);</script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/enhance.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ enhance done');</script>
  <script nonce="${nonce}" src="${mediaBase}/mock.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ mock done, window.process:', typeof window.process);</script>
  <script nonce="${nonce}" src="${mediaBase}/vendor/obsidian-app.patched.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ obsidian-app done, window.__cm6:', typeof window.__cm6, window.__cm6 ? Object.keys(window.__cm6) : 'null');</script>

  <!-- webview 入口 -->
  <script nonce="${nonce}" src="${mediaBase}/webview.js"></script>
  <script nonce="${nonce}">console.log('[md-annotate] ✓ webview.js loaded');</script>

  <!-- 切回源码模式 -->
  <script nonce="${nonce}">
    document.getElementById('btn-back-to-source').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('switchToSource'));
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
