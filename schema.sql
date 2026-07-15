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
