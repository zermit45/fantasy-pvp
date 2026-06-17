-- ============================================================
-- FANTASY PvP — SETUP DO BANCO DE DADOS (Supabase)
-- ============================================================
-- COMO USAR:
-- 1. Crie conta gratis em https://supabase.com
-- 2. New Project (escolha regiao South America se quiser)
-- 3. Va em "SQL Editor" no menu lateral
-- 4. Cole TODO este arquivo e clique RUN
-- 5. Depois va em Settings > API e copie:
--      - Project URL        (ex: https://xxxxx.supabase.co)
--      - anon public key    (uma string longa)
--    Cole as duas no topo do arquivo config.js
-- ============================================================

-- Tabela de SALAS (uma por jogo)
create table if not exists rooms (
  id          text primary key,           -- ex: "aut-jor-2026"
  match_name  text not null,              -- ex: "Áustria × Jordânia"
  status      text not null default 'open', -- open | closed | finished
  created_at  timestamptz default now()
);

-- Tabela de USUARIOS (apelido + senha simples por sala)
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  username    text not null,
  -- senha guardada como hash simples (nao e Fort Knox, mas evita troca de nome)
  pass_hash   text not null,
  created_at  timestamptz default now(),
  unique(username)
);

-- Tabela de ENTRIES (o time de cada usuario em cada sala)
create table if not exists entries (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references rooms(id),
  username    text not null,
  slots       jsonb not null,             -- {GK:id, DEF:id, MID:id, ATT:id, FLEX:id, BENCH:id}
  captain     text not null,              -- "GK" | "DEF" | ... (slot do capitao)
  tactic      text not null,              -- "gegenpress" | ...
  updated_at  timestamptz default now(),
  -- cada usuario so tem UMA entry por sala (pode editar)
  unique(room_id, username)
);

-- ============================================================
-- SEGURANCA (Row Level Security)
-- Permite leitura publica e escrita controlada.
-- Para um jogo entre amigos isso e suficiente.
-- ============================================================
alter table rooms   enable row level security;
alter table users   enable row level security;
alter table entries enable row level security;

-- Todos podem LER salas, usuarios e entries (pra ver o ranking)
create policy "leitura publica rooms"   on rooms   for select using (true);
create policy "leitura publica users"   on users   for select using (true);
create policy "leitura publica entries" on entries for select using (true);

-- Qualquer um pode criar usuario e entry (o app valida a senha no cliente)
create policy "criar usuario"  on users   for insert with check (true);
create policy "criar entry"    on entries for insert with check (true);
create policy "editar entry"   on entries for update using (true);

-- Salas: so admin cria (via dashboard do Supabase ou SQL).
-- Deixamos insert liberado pra facilitar; se quiser travar, remova a policy abaixo.
create policy "criar sala"     on rooms   for insert with check (true);
create policy "editar sala"    on rooms   for update using (true);

-- ============================================================
-- SALAS DE EXEMPLO (ja deixa as duas que voce tem)
-- ============================================================
insert into rooms (id, match_name, status) values
  ('ned-jpn-2026', 'Holanda × Japão',     'finished'),
  ('aut-jor-2026', 'Áustria × Jordânia',  'open')
on conflict (id) do nothing;

-- ============================================================
-- PRONTO. Agora copie URL + anon key para config.js
-- ============================================================
