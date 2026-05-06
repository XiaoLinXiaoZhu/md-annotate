import * as vscode from "vscode";
import { AnnotationStore } from "./annotationStore";
import { AnnotationEditorProvider } from "./annotationEditorProvider";
import { AnnotationWebviewProvider } from "./webviewProvider";
import { registerCommands } from "./commands";
import { updateDecorations } from "./decorations";

export function activate(context: vscode.ExtensionContext): void {
  const store = new AnnotationStore();

  // ─── 侧边栏面板 ───
  const sidebarProvider = new AnnotationWebviewProvider(context.extensionUri, store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AnnotationWebviewProvider.viewType,
      sidebarProvider
    )
  );

  const refresh = () => {
    sidebarProvider.refresh();
    const editor = vscode.window.activeTextEditor;
    if (editor) updateDecorations(editor, store);
  };

  // ─── CustomTextEditor：批注模式 ───
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      AnnotationEditorProvider.viewType,
      new AnnotationEditorProvider(context, store),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    )
  );

  // ─── 命令：从源码编辑切换到批注模式 ───
  context.subscriptions.push(
    vscode.commands.registerCommand("mdAnnotate.openAnnotationView", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "markdown") {
        vscode.window.showWarningMessage("请先打开一个 Markdown 文件");
        return;
      }
      vscode.commands.executeCommand(
        "vscode.openWith",
        editor.document.uri,
        AnnotationEditorProvider.viewType
      );
    })
  );

  // ─── 命令面板操作 ───
  registerCommands(context, store, refresh);

  // ─── 源码模式装饰 ───
  const triggerDecorationUpdate = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) updateDecorations(editor, store);
  };

  // 切换编辑器时刷新装饰
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      triggerDecorationUpdate();
      sidebarProvider.refresh();
    })
  );

  // 文档变更时刷新装饰
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && e.document === editor.document) {
        triggerDecorationUpdate();
      }
    })
  );

  // 文件保存时清除缓存并刷新
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === "markdown") {
        store.invalidateCache(doc.uri);
        triggerDecorationUpdate();
        sidebarProvider.refresh();
      }
    })
  );

  // 初始装饰
  triggerDecorationUpdate();
}

export function deactivate(): void {}
