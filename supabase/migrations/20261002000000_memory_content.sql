-- HF-2: encrypted memory content. Ciphertext only, never plaintext (ADR-004).
-- Only the bridge (service role) touches this table. RLS is on with no policies,
-- so anon and authenticated get nothing; grants are revoked as a second layer.

create table if not exists public.memory_content (
  content_hash text primary key check (content_hash ~ '^0x[0-9a-f]{64}$'),
  owner        text not null,
  ciphertext   bytea not null,
  iv           bytea not null check (octet_length(iv) = 12),
  key_id       text not null,
  created_at   timestamptz not null default now()
);

create index if not exists memory_content_owner_idx on public.memory_content (owner);

alter table public.memory_content enable row level security;

revoke all on table public.memory_content from anon, authenticated, public;
grant all on table public.memory_content to service_role;
