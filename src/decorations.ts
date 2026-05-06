import * as vscode from "vscode";
import { AnnotationStore } from "./annotationStore";
import { Annotation, TextRangeAnchor, LineRangeAnchor } from "./types";

const humanDecorationType = vscode.window.createTextEditorDecorationType({
  overviewRulerColor: "#4fc3f7",
  overviewRulerLane: vscode.OverviewRulerLane.Left,
  gutterIconPath: undefined,
  after: {
    contentText: " 💬",
    color: "#4fc3f780",
  },
});

const aiDecorationType = vscode.window.createTextEditorDecorationType({
  overviewRulerColor: "#ab47bc",
  overviewRulerLane: vscode.OverviewRulerLane.Left,
  after: {
    contentText: " 🤖",
    color: "#ab47bc80",
  },
});

export async function updateDecorations(
  editor: vscode.TextEditor,
  store: AnnotationStore
): Promise<void> {
  if (editor.document.languageId !== "markdown") return;

  const uri = editor.document.uri;
  const humanFile = await store.load(uri, "human");
  const aiFile = await store.load(uri, "ai");
  const docText = editor.document.getText();

  const humanRanges = resolveAnnotationRanges(humanFile.annotations, editor.document, docText);
  const aiRanges = resolveAnnotationRanges(aiFile.annotations, editor.document, docText);

  editor.setDecorations(humanDecorationType, humanRanges);
  editor.setDecorations(aiDecorationType, aiRanges);
}

function resolveAnnotationRanges(
  annotations: Annotation[],
  document: vscode.TextDocument,
  docText: string
): vscode.DecorationOptions[] {
  const results: vscode.DecorationOptions[] = [];

  for (const ann of annotations) {
    if (ann.resolved) continue;
    const range = resolveAnchorToRange(ann.anchor, document, docText);
    if (range) {
      results.push({
        range,
        hoverMessage: new vscode.MarkdownString(`**Annotation:** ${ann.content}`),
      });
    }
  }

  return results;
}

function resolveAnchorToRange(
  anchor: Annotation["anchor"],
  document: vscode.TextDocument,
  docText: string
): vscode.Range | null {
  switch (anchor.type) {
    case "text-range": {
      const ta = anchor as TextRangeAnchor;
      const startIdx = docText.indexOf(ta.start_text);
      if (startIdx === -1) {
        // Fallback to paragraph_index
        if (ta.paragraph_index !== undefined) {
          const line = Math.min(ta.paragraph_index, document.lineCount - 1);
          return new vscode.Range(line, 0, line, document.lineAt(line).text.length);
        }
        return null;
      }
      const endIdx = docText.indexOf(ta.end_text, startIdx);
      const actualEnd = endIdx !== -1 ? endIdx + ta.end_text.length : startIdx + ta.start_text.length;
      return new vscode.Range(document.positionAt(startIdx), document.positionAt(actualEnd));
    }
    case "line-range": {
      const la = anchor as LineRangeAnchor;
      const startLine = Math.max(0, la.start_line - 1);
      const endLine = Math.min(document.lineCount - 1, la.end_line - 1);
      return new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
    }
    case "heading": {
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (line.includes(anchor.heading_text) && line.match(/^#{1,6}\s/)) {
          return new vscode.Range(i, 0, i, line.length);
        }
      }
      return null;
    }
  }
}
