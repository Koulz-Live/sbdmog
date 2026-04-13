// packages/types/src/document.ts

export type DocType = 'runbook' | 'procedure' | 'policy' | 'architecture' | 'handover';

export interface Document {
  id: string;
  title: string;
  slug: string;
  doc_type: DocType;
  content: string | null;
  storage_path: string | null;
  category: string | null;
  tags: string[];
  version: string;
  author_id: string | null;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}
