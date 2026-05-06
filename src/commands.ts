import * as vscode from "vscode";
import { AnnotationStore } from "./annotationStore";
import { TextRangeAnchor } from "./types";

export function registerCommands(
  context: vscode.ExtensionContext,
  store: AnnotationStore,
  refreshCallback: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("mdAnnotate.addAnnotation", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== "markdown") {
        vscode.window.showWarningMessage("Please open a markdown file first.");
        return;
      }

      const selection = editor.selection;
      if (selection.isEmpty) {
        vscode.window.showWarningMessage("Please select some text to annotate.");
        return;
      }

      const selectedText = editor.document.getText(selection);
      const content = await vscode.window.showInputBox({
        prompt: "Enter your annotation",
        placeHolder: "Your comment on the selected text...",
      });

      if (!content) return;

      const startText = selectedText.slice(0, 30);
      const endText = selectedText.length > 30 ? selectedText.slice(-30) : selectedText;

      const anchor: TextRangeAnchor = {
        type: "text-range",
        start_text: startText,
        end_text: endText,
        paragraph_index: selection.start.line,
      };

      await store.addAnnotation(editor.document.uri, "human", anchor, content);
      refreshCallback();
      vscode.window.showInformationMessage("Annotation added.");
    }),

    vscode.commands.registerCommand("mdAnnotate.removeAnnotation", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const file = await store.load(editor.document.uri, "human");
      if (file.annotations.length === 0) {
        vscode.window.showInformationMessage("No annotations to remove.");
        return;
      }

      const items = file.annotations.map((a) => ({
        label: a.content.slice(0, 60),
        description: `${a.anchor.type} | ${a.resolved ? "✓ resolved" : "open"}`,
        id: a.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select annotation to remove",
      });

      if (picked) {
        await store.removeAnnotation(editor.document.uri, "human", picked.id);
        refreshCallback();
      }
    }),

    vscode.commands.registerCommand("mdAnnotate.toggleResolved", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const file = await store.load(editor.document.uri, "human");
      if (file.annotations.length === 0) {
        vscode.window.showInformationMessage("No annotations.");
        return;
      }

      const items = file.annotations.map((a) => ({
        label: `${a.resolved ? "✓" : "○"} ${a.content.slice(0, 60)}`,
        id: a.id,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Toggle resolved state",
      });

      if (picked) {
        await store.toggleResolved(editor.document.uri, "human", picked.id);
        refreshCallback();
      }
    })
  );
}
