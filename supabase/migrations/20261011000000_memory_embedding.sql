-- ADR-022: encrypted embedding vectors for memory search. Ciphertext only, like memory_content.
-- An embedding is derived from plaintext and can be partly inverted, so it is sealed with the owner's key (AES-256-GCM)
-- before it is stored. Only the bridge (service role) touches this table: RLS is on with no policies, and grants are revoked.

create table if not exists public.memory_embedding (
  content_hash text not null references public.memory_content (content_hash) on delete cascade,
  model        text not null,
  dims         integer not null check (dims > 0),
  owner        text not null,
  ciphertext   bytea not null,
  iv           bytea not null check (octet_length(iv) = 12),
  key_id       text not null,
  created_at   timestamptz not null default now(),
  primary key (content_hash, model)
);

create index if not exists memory_embedding_owner_idx on public.memory_embedding (owner);

alter table public.memory_embedding enable row level security;

revoke all on table public.memory_embedding from anon, authenticated, public;
grant all on table public.memory_embedding to service_role;
