-- Recall sync: one row per synced record (deck, card, review, test), per user.
-- Clients push rows they changed and pull rows whose server_ts moved past their cursor.

create table if not exists public.sync_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('deck', 'card', 'review', 'test')),
  id         text        not null,
  data       jsonb,
  updated_at bigint      not null,          -- client clock, ms since epoch (last-write-wins)
  deleted    boolean     not null default false,
  device     text,                           -- which device wrote it, so clients can skip their own echoes
  server_ts  timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id)
);

create index if not exists sync_records_pull on public.sync_records (user_id, server_ts);

alter table public.sync_records enable row level security;

drop policy if exists "own rows" on public.sync_records;
create policy "own rows" on public.sync_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Stamp server_ts on every write and keep the newer version when two devices edit the same record.
create or replace function public.sync_records_lww() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- incoming change is older than what we have: skip it
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists sync_records_lww on public.sync_records;
create trigger sync_records_lww
  before insert or update on public.sync_records
  for each row execute function public.sync_records_lww();
