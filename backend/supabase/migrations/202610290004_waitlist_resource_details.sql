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
  v_was_waitlisted boolean;
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
  if not found or v_booking.status not in ('pending_approval', 'waitlisted') then
    raise exception 'Booking is not awaiting a decision' using errcode = 'P0001';
  end if;
  v_was_waitlisted := v_booking.status = 'waitlisted';
  select * into v_resource from public.resources where id = v_booking.resource_id for update;
  if v_resource.created_by <> p_actor_id and v_role <> 'administrator' then
    raise exception 'Only the resource lister or an administrator can decide this request' using errcode = '42501';
  end if;
  if p_approve and v_booking.end_at <= now() then
    raise exception 'This request has already ended and cannot be approved' using errcode = 'P0001';
  end if;
  if p_approve and v_booking.status = 'waitlisted' and exists (
    select 1
    from public.bookings earlier
    where earlier.resource_id = v_booking.resource_id
      and earlier.status = 'waitlisted'
      and (earlier.created_at, earlier.id) < (v_booking.created_at, v_booking.id)
      and tstzrange(earlier.start_at, earlier.end_at, '[)')
          && tstzrange(v_booking.start_at, v_booking.end_at, '[)')
  ) then
    raise exception 'An earlier overlapping waitlist request must be decided first' using errcode = 'P0001';
  end if;

  if p_approve and exists (
    select 1 from public.bookings b
    where b.resource_id = v_booking.resource_id and b.id <> v_booking.id
      and b.status in ('confirmed', 'checked_out')
      and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(v_booking.start_at, v_booking.end_at, '[)')
  ) then
    update public.bookings
    set status = 'waitlisted',
        decision_reason = 'Waitlisted after review because the slot is still reserved for an overlapping booking.',
        allocation_details = allocation_details || jsonb_build_object('decisionReason', trim(p_reason)),
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
  values (
    p_actor_id,
    case when v_booking.status = 'confirmed' then 'booking.approved' else 'booking.' || v_booking.status::text end,
    'booking',
    v_booking.id::text,
    trim(p_reason),
    jsonb_build_object('status', v_booking.status, 'fromWaitlist', v_was_waitlisted)
  );
  insert into public.notifications (user_id, kind, title, message, booking_id)
  values (
    v_booking.student_id,
    'booking.decision',
    'Booking ' || replace(v_booking.status::text, '_', ' '),
    v_booking.decision_reason,
    v_booking.id
  );
  return v_booking;
end;
$$;
