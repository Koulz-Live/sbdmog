-- 014_handover_items.sql
-- Structured items for service handover/transition documentation

create table if not exists handover_items (
  id           uuid primary key default gen_random_uuid(),
  category     text not null
    check (category in ('knowledge','access','documentation','process','system')),
  title        text not null,
  description  text,
  status       text not null default 'pending'
    check (status in ('pending','in_progress','completed')),
  owner_id     uuid references profiles(id) on delete set null,
  target_date  date,
  completed_at timestamptz,
  evidence_url text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists handover_items_category_idx  on handover_items(category);
create index if not exists handover_items_status_idx    on handover_items(status);
create index if not exists handover_items_owner_idx     on handover_items(owner_id);

alter table handover_items enable row level security;

create policy "handover_items_select_auth" on handover_items
  for select using (auth.role() = 'authenticated');

create policy "handover_items_insert" on handover_items
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create policy "handover_items_update" on handover_items
  for update using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer'))
  );

create trigger handover_items_updated_at
  before update on handover_items
  for each row execute function update_updated_at_column();
