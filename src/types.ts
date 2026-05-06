export type AuthorType = "human" | "ai";

export type AnchorType = "text-range" | "line-range" | "heading";

export interface TextRangeAnchor {
  type: "text-range";
  start_text: string;
  end_text: string;
  paragraph_index?: number;
}

export interface LineRangeAnchor {
  type: "line-range";
  start_line: number;
  end_line: number;
}

export interface HeadingAnchor {
  type: "heading";
  heading_text: string;
  heading_level?: number;
}

export type Anchor = TextRangeAnchor | LineRangeAnchor | HeadingAnchor;

export interface Reply {
  id: string;
  author_type: AuthorType;
  content: string;
  created_at: string;
}

export interface Annotation {
  id: string;
  anchor: Anchor;
  content: string;
  created_at: string;
  updated_at?: string;
  resolved?: boolean;
  tags?: string[];
  thread?: Reply[];
}

export interface AnnotationFile {
  version: "1.0";
  source: string;
  author_type: AuthorType;
  annotations: Annotation[];
}
