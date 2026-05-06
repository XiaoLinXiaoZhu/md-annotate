import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { AnnotationFile, Annotation, Anchor, AuthorType } from "./types";

export class AnnotationStore {
  private cache = new Map<string, AnnotationFile>();

  getMetadataPath(mdUri: vscode.Uri, authorType: AuthorType): string {
    const config = vscode.workspace.getConfiguration("mdAnnotate");
    const location = config.get<string>("metadataLocation", "same-directory");
    const parsed = path.parse(mdUri.fsPath);
    const suffix = authorType === "human" ? ".annotations.json" : ".ai-annotations.json";

    if (location === ".annotations") {
      const dir = path.join(parsed.dir, ".annotations");
      return path.join(dir, parsed.name + suffix);
    }
    return path.join(parsed.dir, parsed.name + suffix);
  }

  async load(mdUri: vscode.Uri, authorType: AuthorType): Promise<AnnotationFile> {
    const metaPath = this.getMetadataPath(mdUri, authorType);
    const cacheKey = metaPath;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    if (fs.existsSync(metaPath)) {
      const raw = fs.readFileSync(metaPath, "utf-8");
      const data: AnnotationFile = JSON.parse(raw);
      this.cache.set(cacheKey, data);
      return data;
    }

    const mdRelative = path.basename(mdUri.fsPath);
    const empty: AnnotationFile = {
      version: "1.0",
      source: mdRelative,
      author_type: authorType,
      annotations: [],
    };
    this.cache.set(cacheKey, empty);
    return empty;
  }

  async save(mdUri: vscode.Uri, authorType: AuthorType): Promise<void> {
    const metaPath = this.getMetadataPath(mdUri, authorType);
    const cacheKey = metaPath;
    const data = this.cache.get(cacheKey);
    if (!data) return;

    const dir = path.dirname(metaPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(metaPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async addAnnotation(
    mdUri: vscode.Uri,
    authorType: AuthorType,
    anchor: Anchor,
    content: string,
    tags?: string[]
  ): Promise<Annotation> {
    const file = await this.load(mdUri, authorType);
    const now = new Date().toISOString();
    const id = `ann_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    const annotation: Annotation = {
      id,
      anchor,
      content,
      created_at: now,
      updated_at: now,
      resolved: false,
      tags: tags || [],
    };

    file.annotations.push(annotation);
    await this.save(mdUri, authorType);
    return annotation;
  }

  async removeAnnotation(mdUri: vscode.Uri, authorType: AuthorType, annotationId: string): Promise<boolean> {
    const file = await this.load(mdUri, authorType);
    const idx = file.annotations.findIndex((a) => a.id === annotationId);
    if (idx === -1) return false;
    file.annotations.splice(idx, 1);
    await this.save(mdUri, authorType);
    return true;
  }

  async toggleResolved(mdUri: vscode.Uri, authorType: AuthorType, annotationId: string): Promise<boolean> {
    const file = await this.load(mdUri, authorType);
    const ann = file.annotations.find((a) => a.id === annotationId);
    if (!ann) return false;
    ann.resolved = !ann.resolved;
    ann.updated_at = new Date().toISOString();
    await this.save(mdUri, authorType);
    return true;
  }

  invalidateCache(mdUri: vscode.Uri): void {
    for (const key of this.cache.keys()) {
      if (key.includes(path.parse(mdUri.fsPath).name)) {
        this.cache.delete(key);
      }
    }
  }
}
