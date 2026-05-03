-- Lens — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query) once after creating the project.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────────
-- jobs: one row per uploaded legal pack
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zip_storage_path text not null,
  zip_filename text not null,
  zip_size_bytes bigint,
  property_label text,
  status text not null default 'queued',
  status_detail text,
  report jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_status_check check (
    status in ('queued','uploaded','extracting','classifying','analyzing','synthesizing','done','failed')
  )
);

create index if not exists jobs_user_id_created_at_idx
  on public.jobs (user_id, created_at desc);

-- auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- documents: one row per PDF inside a pack
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  size_bytes bigint,
  gemini_file_uri text,
  gemini_file_uploaded_at timestamptz,
  doc_type text,
  extraction jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documents_job_id_idx on public.documents (job_id);

-- ──────────────────────────────────────────────────────────────────────────
-- chat_messages: Q&A history grounded on a job
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_job_id_created_at_idx
  on public.chat_messages (job_id, created_at);

-- ──────────────────────────────────────────────────────────────────────────
-- Row Level Security — users only see their own data
-- ──────────────────────────────────────────────────────────────────────────
alter table public.jobs enable row level security;
alter table public.documents enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "own jobs" on public.jobs;
create policy "own jobs" on public.jobs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own documents" on public.documents;
create policy "own documents" on public.documents
  for all
  using (
    exists (
      select 1 from public.jobs j
      where j.id = documents.job_id and j.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = documents.job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "own chat" on public.chat_messages;
create policy "own chat" on public.chat_messages
  for all
  using (
    exists (
      select 1 from public.jobs j
      where j.id = chat_messages.job_id and j.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = chat_messages.job_id and j.user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Storage bucket: legal-packs (private)
-- Run separately in the Storage UI OR via this snippet.
-- ──────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('legal-packs', 'legal-packs', false)
on conflict (id) do nothing;

-- Storage RLS policies — users can only read/write under their own user_id prefix.
-- Convention: object paths are `{user_id}/{job_id}/zip.zip` and `{user_id}/{job_id}/docs/{n}.pdf`.

drop policy if exists "legal-packs read own" on storage.objects;
create policy "legal-packs read own"
  on storage.objects for select
  using (
    bucket_id = 'legal-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "legal-packs insert own" on storage.objects;
create policy "legal-packs insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'legal-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "legal-packs update own" on storage.objects;
create policy "legal-packs update own"
  on storage.objects for update
  using (
    bucket_id = 'legal-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "legal-packs delete own" on storage.objects;
create policy "legal-packs delete own"
  on storage.objects for delete
  using (
    bucket_id = 'legal-packs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
