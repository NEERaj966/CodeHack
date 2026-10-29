import { supabaseAdmin } from '../config/supabase.js';

const reminderLeadMs = 60 * 60 * 1000;
const staffGraceMs = 30 * 60 * 1000;
const incidentGraceMs = 2 * 60 * 60 * 1000;
const batchSize = 500;
let running = false;

async function insertNotification(notification) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .upsert(notification, { onConflict: 'event_key', ignoreDuplicates: true });
  if (error) throw error;
}

export async function runScheduledJobs(now = new Date()) {
  if (!supabaseAdmin) throw new Error('Scheduled jobs require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  if (running) return;
  running = true;
  try {
    const nowIso = now.toISOString();
    const reminderWindow = new Date(now.getTime() + reminderLeadMs).toISOString();
    const [{ data: upcoming, error: upcomingError }, { data: overdueBookings, error: overdueError }] =
      await Promise.all([
        supabaseAdmin.from('bookings')
          .select('id,student_id,resource_id,end_at,resources(name,created_by)')
          .in('status', ['confirmed', 'checked_out'])
          .gt('end_at', nowIso)
          .lte('end_at', reminderWindow)
          .limit(batchSize),
        supabaseAdmin.from('bookings')
          .select('id,student_id,resource_id,end_at,overdue,resources(name,created_by)')
          .eq('status', 'checked_out')
          .lt('end_at', nowIso)
          .order('end_at')
          .limit(batchSize),
      ]);
    if (upcomingError) throw upcomingError;
    if (overdueError) throw overdueError;

    for (const booking of upcoming ?? []) {
      await insertNotification({
        event_key: `return-reminder:${booking.id}`,
        user_id: booking.student_id,
        kind: 'return.reminder',
        title: 'Return reminder',
        message: `Your return time for ${booking.resources?.name ?? 'the resource'} is within one hour.`,
        booking_id: booking.id,
      });
    }

    if (!(overdueBookings ?? []).length) return;
    const { data: administrators, error: administratorsError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'administrator')
      .eq('account_status', 'verified');
    if (administratorsError) throw administratorsError;

    for (const booking of overdueBookings ?? []) {
      const endTime = Date.parse(booking.end_at);
      await insertNotification({
        event_key: `return-overdue:${booking.id}`,
        user_id: booking.student_id,
        kind: 'return.overdue',
        title: 'Resource return is overdue',
        message: `The return time has passed for ${booking.resources?.name ?? 'your resource booking'}.`,
        booking_id: booking.id,
      });

      if (now.getTime() >= endTime + staffGraceMs) {
        const recipients = new Set([
          booking.resources?.created_by,
          ...(administrators ?? []).map((person) => person.id),
        ].filter((id) => id && id !== booking.student_id));
        for (const recipientId of recipients) {
          await insertNotification({
            event_key: `return-overdue-staff:${booking.id}:${recipientId}`,
            user_id: recipientId,
            kind: 'return.overdue_staff',
            title: 'Overdue resource needs staff attention',
            message: `${booking.resources?.name ?? 'A resource'} has not been returned on time.`,
            booking_id: booking.id,
          });
        }
      }

      if (now.getTime() >= endTime + incidentGraceMs) {
        if (!booking.overdue) {
          const { error: updateError } = await supabaseAdmin
            .from('bookings')
            .update({ overdue: true, updated_at: nowIso })
            .eq('id', booking.id)
            .eq('overdue', false);
          if (updateError) throw updateError;
          const { error: auditError } = await supabaseAdmin.from('audit_events').insert({
            event_key: `booking-overdue:${booking.id}`,
            action: 'booking.overdue_flagged',
            record_type: 'booking',
            record_id: booking.id,
            details: { thresholdHours: 2 },
          });
          if (auditError && auditError.code !== '23505') throw auditError;
        }

        const { error: incidentError } = await supabaseAdmin.from('incidents').insert({
          booking_id: booking.id,
          resource_id: booking.resource_id,
          kind: 'overdue',
          description: 'Automatically opened after the overdue escalation threshold. Staff review is required; no fault or penalty was assigned.',
          reported_by_system: true,
        });
        if (incidentError && incidentError.code !== '23505') throw incidentError;
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduledJobs() {
  if (!supabaseAdmin) {
    console.warn('Scheduled jobs are disabled: configure the Supabase service-role key.');
    return null;
  }
  const run = () => {
    runScheduledJobs().catch((error) => {
      console.error('Scheduled job run failed:', error);
    });
  };
  run();
  return setInterval(run, 60_000);
}
