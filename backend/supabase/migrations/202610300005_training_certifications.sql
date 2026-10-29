create table public.training_catalog (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$'),
  title text not null check (length(trim(title)) between 2 and 120),
  description text not null default '',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.training_catalog (code, title, description)
values
  ('LAB-SAFETY-101', 'Laboratory safety', 'Sample catalog entry; confirm it matches your institution training.'),
  ('CHEM-LAB-101', 'Chemical laboratory safety', 'Sample catalog entry; confirm it matches your institution training.'),
  ('ELECTRICAL-SAFETY-101', 'Electrical safety', 'Sample catalog entry; confirm it matches your institution training.'),
  ('3D-PRINTER-101', '3D printer operation', 'Sample catalog entry; confirm it matches your institution training.')
on conflict (code) do nothing;

create table public.training_certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  training_code text not null references public.training_catalog(code) on update cascade on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  document_path text not null unique,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, training_code),
  check (
    (status = 'pending' and reviewer_id is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewer_id is not null and reviewed_at is not null)
  )
);

alter table public.profiles drop column training_codes;

alter table public.training_catalog enable row level security;
alter table public.training_certifications enable row level security;
revoke all on public.training_catalog, public.training_certifications from public, anon, authenticated;
grant select, insert, update on public.training_catalog to service_role;
grant select, insert, update, delete on public.training_certifications to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-certifications',
  'member-certifications',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
