-- Mera secret vaults, keyed by passkey credential ID. The vault JSON is ciphertext only (ADR-005).
-- Only the bridge (service role) touches this table. RLS is on with no policies,
-- so anon and authenticated get nothing; grants are revoked as a second layer.

create table if not exists public.passkey_vaults (
  credential_id text primary key check (credential_id ~ '^[A-Za-z0-9_-]{1,512}$'),
  owner         text not null,
  vault         jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists passkey_vaults_owner_idx on public.passkey_vaults (owner);

alter table public.passkey_vaults enable row level security;

revoke all on table public.passkey_vaults from anon, authenticated, public;
grant all on table public.passkey_vaults to service_role;
