create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create type public.user_role as enum (
  'member',
  'administrator'
);

create type public.account_status as enum ('unverified', 'verified', 'suspended');
create type public.resource_status as enum (
  'available',
  'reserved',
  'in_use',
  'under_maintenance',
  'unavailable',
  'retired'
);
create type public.approval_mode as enum ('auto', 'manual');
create type public.handover_mode as enum ('staff_attended', 'self_service');
create type public.booking_status as enum (
  'pending_approval',
  'confirmed',
  'waitlisted',
  'checked_out',
  'returned',
  'rejected',
  'cancelled'
);
create type public.incident_status as enum (
  'reported',
  'under_review',
  'awaiting_repair',
  'resolved',
  'closed'
);

create table public.allowed_email_domains (
  domain text primary key check (domain <> '' and domain = lower(domain) and position('@' in domain) = 0),
  created_at timestamptz not null default now()
);

revoke all on public.allowed_email_domains from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.user_role not null default 'member',
  account_status public.account_status not null default 'unverified',
  department text,
  student_year integer check (student_year between 1 and 10),
  training_codes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.create_student_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.allowed_email_domains
    where domain = lower(split_part(new.email, '@', 2))
  ) then
    raise exception 'Email domain is not on the college allowlist' using errcode = '42501';
  end if;

  insert into public.profiles (id, email, full_name, role, account_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'member',
    case when new.email_confirmed_at is null then 'unverified'::public.account_status
         else 'verified'::public.account_status end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      account_status = case
    when public.profiles.account_status = 'suspended' then 'suspended'::public.account_status
    when new.email_confirmed_at is not null then 'verified'::public.account_status
    else public.profiles.account_status
      end,
      updated_at = now();
  update public.profiles
  set department = coalesce(new.raw_user_meta_data ->> 'department', department),
      student_year = case
        when coalesce(new.raw_user_meta_data ->> 'student_year', '') ~ '^[1-9][0-9]?$'
          then (new.raw_user_meta_data ->> 'student_year')::integer
        else student_year
      end
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email_confirmed_at on auth.users
for each row execute function public.create_student_profile();

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name text not null,
  description text not null default '',
  category text not null check (category in ('laboratory', 'IT', 'sports', 'facilities', 'event_equipment')),
  resource_type text not null default 'equipment' check (resource_type in ('equipment', 'space', 'facility')),
  location text not null,
  department text not null,
  institution text not null,
  condition text not null default 'good',
  status public.resource_status not null default 'available',
  active boolean not null default true,
  approval_mode public.approval_mode not null default 'manual',
  handover_mode public.handover_mode not null default 'staff_attended',
  restricted boolean not null default false,
  high_value boolean not null default false,
  eligibility_rules jsonb not null default '{}'::jsonb,
  usage_terms text not null default '',
  available_from timestamptz,
  available_until timestamptz,
  photo_path text,
  created_by uuid not null references public.profiles(id),
  ownership_attested_by uuid not null references public.profiles(id),
  ownership_attested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restricted_resources_require_manual_approval
    check (not restricted or approval_mode = 'manual'),
  constraint restricted_resources_require_staff_handover
    check (not restricted or handover_mode = 'staff_attended'),
  constraint high_value_resources_require_staff_handover
    check (not high_value or handover_mode = 'staff_attended'),
  constraint valid_availability_window
    check (available_from is null or available_until is null or available_from < available_until)
);

create index resources_discovery_idx on public.resources (active, status, category, location);

create table public.booking_policies (
  singleton boolean primary key default true check (singleton),
  max_active_bookings integer not null default 2 check (max_active_bookings > 0),
  max_active_per_category integer not null default 1 check (max_active_per_category > 0),
  max_hours_per_resource_week numeric not null default 8 check (max_hours_per_resource_week > 0),
  cooldown_hours integer not null default 24 check (cooldown_hours >= 0),
  cooldown_trigger_hours numeric not null default 4 check (cooldown_trigger_hours > 0),
  updated_at timestamptz not null default now()
);

insert into public.booking_policies (singleton) values (true) on conflict do nothing;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id),
  student_id uuid not null references public.profiles(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  purpose text not null,
  status public.booking_status not null,
  decision_reason text not null,
  allocation_details jsonb not null default '{}'::jsonb,
  overdue boolean not null default false,
  disputed boolean not null default false,
  picked_up_at timestamptz,
  returned_at timestamptz,
  pickup_actor uuid references public.profiles(id),
  return_actor uuid references public.profiles(id),
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_booking_window check (start_at < end_at)
);

alter table public.bookings
  add constraint no_overlapping_confirmed_bookings
  exclude using gist (
    resource_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status in ('confirmed', 'checked_out'));

create index bookings_student_history_idx on public.bookings (student_id, created_at desc);
create index bookings_resource_calendar_idx on public.bookings (resource_id, start_at, end_at);
create index bookings_status_idx on public.bookings (status, start_at);

create function public.enforce_booking_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'pending_approval' and new.status in ('confirmed', 'waitlisted', 'rejected', 'cancelled'))
    or (old.status = 'waitlisted' and new.status in ('pending_approval', 'confirmed', 'rejected', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('checked_out', 'cancelled'))
    or (old.status = 'checked_out' and new.status = 'returned')
  ) then
    raise exception 'Invalid booking status transition: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bookings_state_transition_guard
before update of status on public.bookings
for each row execute function public.enforce_booking_state_transition();

create table public.condition_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  resource_id uuid not null references public.resources(id),
  stage text not null check (stage in ('pickup', 'return')),
  notes text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  author_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (booking_id, stage)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id),
  resource_id uuid not null references public.resources(id),
  reporter_id uuid references public.profiles(id),
  reported_by_system boolean not null default false,
  kind text not null check (kind in ('damage', 'loss', 'overdue', 'other')),
  description text not null,
  status public.incident_status not null default 'reported',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_system_overdue_incident_per_booking_idx
  on public.incidents (booking_id)
  where kind = 'overdue' and reported_by_system = true;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  kind text not null,
  title text not null,
  message text not null,
  booking_id uuid references public.bookings(id),
  event_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  record_type text not null,
  record_id text,
  event_key text unique,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_record_idx on public.audit_events (record_type, record_id, created_at);

create function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events is append-only';
end;
$$;

create trigger audit_events_are_immutable
before update or delete on public.audit_events
for each row execute function public.prevent_audit_mutation();

create function public.request_booking(
  p_student_id uuid,
  p_resource_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_purpose text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource public.resources;
  v_policy public.booking_policies;
  v_profile public.profiles;
  v_status public.booking_status;
  v_reason text;
  v_booking public.bookings;
  v_active_count integer;
  v_category_count integer;
  v_week_hours numeric;
  v_week_start timestamptz;
  v_week_end timestamptz;
begin
  if p_start_at >= p_end_at or p_start_at <= now() or length(trim(p_purpose)) < 3 then
    raise exception 'Invalid booking period or purpose' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_student_id for update;
  if not found or v_profile.role not in ('member', 'administrator') or v_profile.account_status <> 'verified' then
    raise exception 'A verified member account is required' using errcode = '42501';
  end if;

  select * into v_resource from public.resources
  where id = p_resource_id and active = true for update;
  if not found or v_resource.status not in ('available', 'reserved') then
    raise exception 'Resource is not currently bookable' using errcode = 'P0001';
  end if;
  if v_resource.created_by = p_student_id then
    raise exception 'You cannot book a resource that you listed' using errcode = '42501';
  end if;
  if (v_resource.available_from is not null and p_start_at < v_resource.available_from)
     or (v_resource.available_until is not null and p_end_at > v_resource.available_until) then
    raise exception 'Requested time is outside the resource availability window' using errcode = 'P0001';
  end if;

  select * into v_policy from public.booking_policies where singleton = true;
  select count(*) into v_active_count
  from public.bookings
  where student_id = p_student_id
    and status in ('pending_approval', 'confirmed', 'checked_out')
    and end_at > now();
  if v_active_count >= v_policy.max_active_bookings then
    raise exception 'FairShare limit reached: maximum active bookings' using errcode = 'P0001';
  end if;

  select count(*) into v_category_count
  from public.bookings b
  join public.resources r on r.id = b.resource_id
  where b.student_id = p_student_id
    and r.category = v_resource.category
    and b.status in ('pending_approval', 'confirmed', 'checked_out')
    and b.end_at > now();
  if v_category_count >= v_policy.max_active_per_category then
    raise exception 'FairShare limit reached: one active booking per resource category' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.bookings b
    where b.student_id = p_student_id
      and b.resource_id = p_resource_id
      and b.status in ('confirmed', 'checked_out', 'returned')
      and b.end_at <= p_start_at
      and b.end_at + make_interval(hours => v_policy.cooldown_hours) > p_start_at
      and extract(epoch from (b.end_at - b.start_at)) / 3600 > v_policy.cooldown_trigger_hours
  ) then
    raise exception 'FairShare cooldown applies after a booking longer than four hours' using errcode = 'P0001';
  end if;

  v_week_start := date_trunc('week', p_start_at);
  while v_week_start < p_end_at loop
    v_week_end := v_week_start + interval '1 week';
    select coalesce(sum(
      extract(epoch from (least(b.end_at, v_week_end) - greatest(b.start_at, v_week_start))) / 3600
    ), 0)
    into v_week_hours
    from public.bookings b
    where b.student_id = p_student_id
      and b.resource_id = p_resource_id
      and b.status in ('pending_approval', 'confirmed', 'checked_out', 'returned')
      and b.start_at < v_week_end and b.end_at > v_week_start;

    if v_week_hours + extract(epoch from (
      least(p_end_at, v_week_end) - greatest(p_start_at, v_week_start)
    )) / 3600 > v_policy.max_hours_per_resource_week then
      raise exception 'FairShare limit reached: weekly hours per resource' using errcode = 'P0001';
    end if;
    v_week_start := v_week_end;
  end loop;

  if exists (
    select 1 from public.bookings b
    where b.resource_id = p_resource_id
      and b.status in ('confirmed', 'checked_out')
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    v_status := 'waitlisted';
    v_reason := 'Waitlisted because this resource is already reserved for the requested period.';
  elsif v_resource.approval_mode = 'auto' and not v_resource.restricted then
    v_status := 'confirmed';
    v_reason := 'Automatically confirmed: eligibility and availability checks passed.';
  else
    v_status := 'pending_approval';
    v_reason := 'Request submitted for the resource lister''s approval.';
  end if;

  insert into public.bookings (
    resource_id, student_id, start_at, end_at, purpose, status, decision_reason, allocation_details
  )
  values (
    p_resource_id, p_student_id, p_start_at, p_end_at, trim(p_purpose), v_status, v_reason,
    jsonb_build_object('rule', v_reason, 'activeBookingsAtRequest', v_active_count)
  )
  returning * into v_booking;

  insert into public.audit_events (actor_id, action, record_type, record_id, reason, details)
  values (p_student_id, 'booking.requested', 'booking', v_booking.id::text, v_reason,
          jsonb_build_object('resourceId', p_resource_id, 'status', v_status));
  insert into public.notifications (user_id, kind, title, message, booking_id)
  values (p_student_id, 'booking.' || v_status, 'Booking ' || replace(v_status::text, '_', ' '), v_reason, v_booking.id);
  if v_status = 'pending_approval' then
    insert into public.notifications (user_id, kind, title, message, booking_id)
    select p.id, 'booking.requested', 'Booking needs review',
           'A request for ' || v_resource.name || ' is awaiting your approval.', v_booking.id
    from public.profiles p
    where account_status = 'verified'
      and (
        p.id = v_resource.created_by
        or (p.role = 'administrator' and p.id <> p_student_id)
      );
  end if;
  return v_booking;
end;
$$;

create function public.decide_booking(
  p_booking_id uuid,
  p_actor_id uuid,
  p_approve boolean,
  p_reason text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_resource public.resources;
  v_role public.user_role;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A decision reason is required' using errcode = '22023';
  end if;
  select role into v_role from public.profiles
  where id = p_actor_id and account_status = 'verified';
  if v_role is null or v_role not in ('member', 'administrator') then
    raise exception 'Verified member or administrator account required' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.status <> 'pending_approval' then
    raise exception 'Booking is not awaiting a decision' using errcode = 'P0001';
  end if;
  select * into v_resource from public.resources where id = v_booking.resource_id for update;
  if v_resource.created_by <> p_actor_id and v_role <> 'administrator' then
    raise exception 'Only the resource lister or an administrator can decide this request' using errcode = '42501';
  end if;
  if p_approve and exists (
    select 1 from public.bookings b
    where b.resource_id = v_booking.resource_id and b.id <> v_booking.id
      and b.status in ('confirmed', 'checked_out')
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(v_booking.start_at, v_booking.end_at, '[)')
  ) then
    update public.bookings
    set status = 'waitlisted',
        decision_reason = 'Waitlisted after staff review because the slot is no longer available.',
        allocation_details = allocation_details || jsonb_build_object('decisionReason', p_reason),
        updated_at = now()
    where id = p_booking_id returning * into v_booking;
  else
    update public.bookings
    set status = case when p_approve then 'confirmed'::public.booking_status else 'rejected'::public.booking_status end,
        decision_reason = trim(p_reason),
        allocation_details = allocation_details || jsonb_build_object('decisionReason', trim(p_reason)),
        updated_at = now()
    where id = p_booking_id returning * into v_booking;
  end if;
  insert into public.audit_events (actor_id, action, record_type, record_id, reason, details)
  values (p_actor_id, case when v_booking.status = 'confirmed' then 'booking.approved' else 'booking.' || v_booking.status::text end,
          'booking', v_booking.id::text, trim(p_reason), jsonb_build_object('status', v_booking.status));
  insert into public.notifications (user_id, kind, title, message, booking_id)
  values (v_booking.student_id, 'booking.decision', 'Booking ' || replace(v_booking.status::text, '_', ' '),
          v_booking.decision_reason, v_booking.id);
  return v_booking;
end;
$$;

create function public.record_pickup(
  p_booking_id uuid,
  p_actor_id uuid,
  p_asset_code text,
  p_notes text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_resource public.resources;
  v_actor public.profiles;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.status <> 'confirmed' then
    raise exception 'Booking is not confirmed or has already been picked up' using errcode = 'P0001';
  end if;
  select * into v_resource from public.resources where id = v_booking.resource_id for update;
  select * into v_actor from public.profiles where id = p_actor_id and account_status = 'verified';
  if not found then
    raise exception 'Verified account required' using errcode = '42501';
  end if;
  if trim(coalesce(p_asset_code, '')) <> v_resource.asset_code then
    raise exception 'Resource ID does not match this booking' using errcode = '22023';
  end if;
  if v_resource.handover_mode = 'staff_attended'
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'The resource lister or an administrator must complete this attended pickup' using errcode = '42501';
  end if;
  if v_actor.id <> v_booking.student_id
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'Only the borrower, resource lister, or an administrator may complete pickup' using errcode = '42501';
  end if;

  insert into public.condition_reports (booking_id, resource_id, stage, notes, author_id)
  values (p_booking_id, v_resource.id, 'pickup', trim(coalesce(p_notes, '')), p_actor_id);
  update public.bookings
  set status = 'checked_out', picked_up_at = now(), pickup_actor = p_actor_id,
      terms_accepted_at = now(), updated_at = now()
  where id = p_booking_id returning * into v_booking;
  update public.resources set status = 'in_use', updated_at = now() where id = v_resource.id;
  insert into public.audit_events (actor_id, action, record_type, record_id, details)
  values (p_actor_id, 'booking.picked_up', 'booking', p_booking_id::text,
          jsonb_build_object('resourceId', v_resource.id, 'assetCode', v_resource.asset_code));
  insert into public.notifications (user_id, kind, title, message, booking_id)
  values (v_booking.student_id, 'booking.pickup', 'Resource checked out',
          'Pickup was recorded for ' || v_resource.name || '.', p_booking_id);
  return v_booking;
end;
$$;

create function public.record_return(
  p_booking_id uuid,
  p_actor_id uuid,
  p_asset_code text,
  p_notes text
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_resource public.resources;
  v_actor public.profiles;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_booking.status <> 'checked_out' then
    raise exception 'Booking is not checked out or has already been returned' using errcode = 'P0001';
  end if;
  select * into v_resource from public.resources where id = v_booking.resource_id for update;
  select * into v_actor from public.profiles where id = p_actor_id and account_status = 'verified';
  if not found then
    raise exception 'Verified account required' using errcode = '42501';
  end if;
  if trim(coalesce(p_asset_code, '')) <> v_resource.asset_code then
    raise exception 'Resource ID does not match this booking' using errcode = '22023';
  end if;
  if v_resource.handover_mode = 'staff_attended'
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'The resource lister or an administrator must complete this attended return' using errcode = '42501';
  end if;
  if v_actor.id <> v_booking.student_id
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'Only the borrower, resource lister, or an administrator may complete return' using errcode = '42501';
  end if;

  insert into public.condition_reports (booking_id, resource_id, stage, notes, author_id)
  values (p_booking_id, v_resource.id, 'return', trim(coalesce(p_notes, '')), p_actor_id);
  update public.bookings
  set status = 'returned', returned_at = now(), return_actor = p_actor_id, updated_at = now()
  where id = p_booking_id returning * into v_booking;
  update public.resources
  set status = case when status = 'in_use' then 'available'::public.resource_status else status end,
      updated_at = now()
  where id = v_resource.id;
  insert into public.audit_events (actor_id, action, record_type, record_id, details)
  values (p_actor_id, 'booking.returned', 'booking', p_booking_id::text,
          jsonb_build_object('resourceId', v_resource.id, 'assetCode', v_resource.asset_code));
  insert into public.notifications (user_id, kind, title, message, booking_id)
  values (v_booking.student_id, 'booking.return', 'Resource returned',
          'Return was recorded for ' || v_resource.name || '.', p_booking_id);
  return v_booking;
end;
$$;

create function public.admin_update_profile(
  p_actor_id uuid,
  p_target_id uuid,
  p_role public.user_role,
  p_account_status public.account_status
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
  v_email_confirmed_at timestamptz;
begin
  perform pg_advisory_xact_lock(9374, 1);
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'administrator' and account_status = 'verified'
  ) then
    raise exception 'Verified administrator permission required' using errcode = '42501';
  end if;
  if p_role not in ('member', 'administrator')
     or p_account_status not in ('unverified', 'verified', 'suspended') then
    raise exception 'Unsupported account role or status' using errcode = '22023';
  end if;
  select * into v_target from public.profiles where id = p_target_id for update;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  select email_confirmed_at into v_email_confirmed_at from auth.users where id = p_target_id;
  if p_account_status = 'verified' and v_email_confirmed_at is null then
    raise exception 'The college email must be verified before an account can be activated' using errcode = '42501';
  end if;
  if v_target.role = 'administrator'
     and v_target.account_status = 'verified'
     and (p_role <> 'administrator' or p_account_status <> 'verified')
     and not exists (
       select 1 from public.profiles
       where role = 'administrator'
         and account_status = 'verified'
         and id <> p_target_id
     ) then
    raise exception 'The last active administrator cannot be demoted or suspended' using errcode = 'P0001';
  end if;

  update public.profiles
  set role = p_role, account_status = p_account_status, updated_at = now()
  where id = p_target_id
  returning * into v_target;
  insert into public.audit_events (actor_id, action, record_type, record_id, details)
  values (p_actor_id, 'account.updated', 'profile', p_target_id::text,
          jsonb_build_object('role', p_role::text, 'accountStatus', p_account_status::text));
  return v_target;
end;
$$;

revoke all on function public.request_booking(uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.decide_booking(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.record_pickup(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_return(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_profile(uuid, uuid, public.user_role, public.account_status) from public, anon, authenticated;
grant execute on function public.request_booking(uuid, uuid, timestamptz, timestamptz, text) to service_role;
grant execute on function public.decide_booking(uuid, uuid, boolean, text) to service_role;
grant execute on function public.record_pickup(uuid, uuid, text, text) to service_role;
grant execute on function public.record_return(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_update_profile(uuid, uuid, public.user_role, public.account_status) to service_role;

alter table public.profiles enable row level security;
alter table public.resources enable row level security;
alter table public.booking_policies enable row level security;
alter table public.bookings enable row level security;
alter table public.condition_reports enable row level security;
alter table public.incidents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.profiles, public.resources, public.booking_policies, public.bookings,
  public.condition_reports, public.incidents, public.notifications, public.audit_events
from anon, authenticated;
revoke update, delete, truncate on public.audit_events from service_role;
grant select, insert on public.audit_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resource-photos', 'resource-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
