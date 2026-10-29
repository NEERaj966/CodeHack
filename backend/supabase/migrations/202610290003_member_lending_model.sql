alter table public.resources
  add column if not exists ownership_attested_by uuid references public.profiles(id),
  add column if not exists ownership_attested_at timestamptz;

update public.resources
set ownership_attested_by = created_by,
    ownership_attested_at = created_at
where ownership_attested_by is null or ownership_attested_at is null;

alter table public.resources
  alter column ownership_attested_by set not null,
  alter column ownership_attested_at set default now(),
  alter column ownership_attested_at set not null;

update public.profiles
set role = 'member'
where role::text not in ('member', 'administrator');

alter table public.profiles
  alter column role set default 'member';

create or replace function public.create_student_profile()
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

create or replace function public.request_booking(
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
    where p.account_status = 'verified'
      and (
        p.id = v_resource.created_by
        or (p.role = 'administrator' and p.id <> p_student_id)
      );
  end if;
  return v_booking;
end;
$$;

create or replace function public.decide_booking(
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
        decision_reason = 'Waitlisted after resource-lister review because the slot is no longer available.',
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

create or replace function public.record_pickup(
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
  if v_actor.id <> v_booking.student_id
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'Only the borrower, resource lister, or an administrator may complete pickup' using errcode = '42501';
  end if;
  if v_resource.handover_mode = 'staff_attended'
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'The resource lister or an administrator must complete this attended pickup' using errcode = '42501';
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

create or replace function public.record_return(
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
  if v_actor.id <> v_booking.student_id
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'Only the borrower, resource lister, or an administrator may complete return' using errcode = '42501';
  end if;
  if v_resource.handover_mode = 'staff_attended'
     and v_actor.id <> v_resource.created_by
     and v_actor.role <> 'administrator' then
    raise exception 'The resource lister or an administrator must complete this attended return' using errcode = '42501';
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

create or replace function public.admin_update_profile(
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

revoke all on function public.admin_update_profile(uuid, uuid, public.user_role, public.account_status) from public, anon, authenticated;
grant execute on function public.admin_update_profile(uuid, uuid, public.user_role, public.account_status) to service_role;
