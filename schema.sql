-- Ejecutar en Supabase → SQL Editor

create table public.postits (
  id uuid primary key default gen_random_uuid(),
  content text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.postits
  add constraint content_max_len check (char_length(content) <= 5000);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_postits_updated_at
before update on public.postits
for each row execute function public.set_updated_at();

-- Sin login: el UUID del enlace actúa como token de acceso.
-- Cualquiera con la anon key podría en teoría listar todas las filas
-- (ver advertencia en el README); se acepta como riesgo de bajo impacto.
alter table public.postits enable row level security;

create policy "select_postits" on public.postits for select using (true);
create policy "insert_postits" on public.postits for insert with check (true);
create policy "update_postits" on public.postits for update using (true) with check (true);
create policy "delete_postits" on public.postits for delete using (true);

alter publication supabase_realtime add table public.postits;

-- ============================================================
-- Migración: post-its múltiples por tablero (máx. 10) + color
-- Ejecutar una sola vez en Supabase → SQL Editor sobre una base
-- que ya tenga la tabla `postits` creada con el bloque de arriba.
-- ============================================================

alter table public.postits add column if not exists board_id uuid;
update public.postits set board_id = id where board_id is null;
alter table public.postits alter column board_id set not null;
alter table public.postits alter column board_id set default gen_random_uuid();

alter table public.postits add column if not exists position smallint not null default 0;
alter table public.postits add column if not exists color text not null default 'yellow';
alter table public.postits drop constraint if exists color_allowed;
alter table public.postits add constraint color_allowed
  check (color in ('yellow', 'pink', 'blue', 'green', 'orange', 'purple'));

create index if not exists idx_postits_board_id on public.postits (board_id);

create or replace function public.enforce_postit_limit()
returns trigger as $$
begin
  if (select count(*) from public.postits where board_id = new.board_id) >= 10 then
    raise exception 'Máximo 10 post-its por tablero';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_postits_limit on public.postits;
create trigger trg_postits_limit
before insert on public.postits
for each row execute function public.enforce_postit_limit();
