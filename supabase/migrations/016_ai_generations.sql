-- 016_ai_generations.sql
-- Records every AI generation for cost tracking, acceptance workflow,
-- and audit compliance. Never mutates production data.

create table if not exists ai_generations (
  id               uuid primary key default gen_random_uuid(),
  resource_type    text not null,
  resource_id      uuid,
  prompt_type      text not null,
  prompt_tokens    integer not null default 0,
  completion_tokens integer not null default 0,
  model            text not null default 'gpt-4o',
  output           text not null,
  accepted         boolean,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists ai_generations_resource_idx    on ai_generations(resource_type, resource_id);
create index if not exists ai_generations_created_by_idx  on ai_generations(created_by);
create index if not exists ai_generations_created_at_idx  on ai_generations(created_at desc);

alter table ai_generations enable row level security;

-- admin can read all generations
create policy "ai_generations_select_admin" on ai_generations
  for select using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- creator can read their own generations
create policy "ai_generations_select_own" on ai_generations
  for select using (created_by = auth.uid());

-- admin, engineer, analyst can trigger AI and store results
create policy "ai_generations_insert" on ai_generations
  for insert with check (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','engineer','analyst'))
  );

-- allow acceptance flag to be updated by creator or admin
create policy "ai_generations_update_accepted" on ai_generations
  for update using (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
