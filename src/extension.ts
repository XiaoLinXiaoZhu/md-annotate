import * as vscode from "vscode";
import { AnnotationStore } from "./annotationStore";
import { AnnotationEditorProvider } from "./annotationEditorProvider";

export function activate(context: vscode.ExtensionContext): void {
  const store = new AnnotationStore();

  // 注册 CustomTextEditor —— 批注模式的核心
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

  // 右上角按钮：从源码编辑切换到批注模式
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
}

export function deactivate(): void {}
