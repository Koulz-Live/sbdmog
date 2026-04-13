-- 012_documents.sql
-- Operational document and runbook library

create table if not exists documents (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  slug            text unique not null,
  doc_type        text not null check (doc_type in ('runbook','procedure','policy','architecture','handover')),
  content         text,
  storage_path    text,
  category        text,
  tags            text[] default '{}',
  version         text not null default '1.0',
  author_id       uuid references profiles(id) on delete set null,
  last_updated_by uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists documents_doc_type_idx on documents(doc_type);
create index if not exists documents_tags_idx     on documents using gin(tags);

alter table documents enable row level security;

create policy "documents_select_auth" on documents
  for select using (auth.role() = 'authenticated');

create policy "documents_insert" on documents
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "documents_update" on documents
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "documents_delete" on documents
  for delete using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create trigger documents_updated_at
  before update on documents
  for each row execute function update_updated_at_column();
