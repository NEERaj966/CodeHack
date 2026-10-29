# Project Progress

## Status: P0 workflows implemented; Supabase release verification pending

The P0 application workflows are implemented across the Supabase schema, Express API, and React interface. Local unit, sanity, lint, and production-build checks pass. The remaining P0 release gate is applying the migration and verifying the complete workflow against a configured Supabase project.

## Priority guide

Priority assignments follow the SRS v1.1 and project scope: P0 is required for the MVP; P1 is important but not a P0 release blocker; P2 is optional or out of scope for this prototype. In particular, QR/token handover and advanced utilization analytics are not P0 acceptance requirements.

## P0 checklist

### Implemented

- [x] Member registration, college email verification, sign-in, and account status handling.
- [x] Configurable allowlist supports registration from multiple participating college email domains.
- [x] Two-role model implemented: verified members and administrators; database migration covers existing staff roles.
- [x] Members can list attested institution-owned resources, manage their own listings, and approve requests for their listings.
- [x] Administrators can manage all resources, accounts, and incident statuses.
- [x] Resource discovery, filtering, details, and protected resource-photo handling.
- [x] Eligibility checks and mandatory manual approval/lister-attended handover for restricted resources.
- [x] Booking requests, approval decisions with reasons, and booking history.
- [x] FairShare limits, explainable waitlist outcomes, and database-enforced overlap prevention.
- [x] Manual asset-ID pickup/return and timestamped condition reports.
- [x] Incident reporting and administrator review/status handling without automatic fault or penalty decisions.
- [x] In-app notifications, scheduled reminders/overdue escalation, timeline, and append-only audit events.
- [x] Local backend tests/sanity checks, frontend lint, and production build.

### Supabase setup and end-to-end verification

- [x] Configure the Supabase URL, anon/publishable key, and service-role secret in local `backend/.env`; never put the service-role secret in frontend configuration.
- [x] Apply `backend/supabase/migrations/202610290001_initial_schema.sql` to a new Supabase project.
- [x] Add participating colleges' approved email domains to `public.allowed_email_domains` and `COLLEGE_EMAIL_DOMAINS`.
- [x] Configure Supabase Auth email confirmation and the local redirect URL.
- [x] Register and verify an account, then promote the first administrator using the bootstrap SQL in `README.md`.
- [x] Confirm `GET /api/health/ready` reports ready.
- [ ] Apply `202610290002_add_member_role.sql` and `202610290003_member_lending_model.sql` to the existing Supabase project before using the member-lending model.
- [ ] Exercise signup/sign-in, resource creation/discovery, eligibility, approval, overlap conflict, pickup/return, incident, notification, and audit flows against Supabase.
- [ ] Record integration results and resolve any migration, authorization, storage, or workflow findings.

## P1 checklist

- [ ] Cancellations and booking extensions.
- [ ] Training document review and expiry tracking.
- [ ] No-show handling and waitlist claim windows.
- [ ] QR scanning or booking-specific handover tokens; manual asset-ID handover is implemented for P0.
- [ ] Team bookings and manager assignment UI.
- [ ] Incident decision workflow, appeals, penalties, and dual-acknowledged condition photos.
- [ ] Utilization analytics/radar and CSV export.
- [ ] Email notifications.

## P2 / out-of-scope checklist

- [ ] AI-assisted matching.
- [ ] Online payment integration.

## Validation status

- Backend unit tests: passed (eligibility policy coverage).
- Backend HTTP sanity test: passed (liveness and unconfigured readiness behavior).
- Frontend lint: passed without warnings.
- Frontend production build sanity test: passed.
- Supabase-connected migration, authentication, RLS, storage, concurrency, and workflow verification: pending project configuration and credentials.

## Next milestone

Apply the role-model migrations to Supabase, verify the P0 member-to-member lending and borrowing journey end to end, and record the results here before beginning P1 work.

## Multi-college/member-lending scope note

The registration allowlist admits members from multiple participating colleges; members can lend only institution-owned resources and must attest that they are authorized to share them. Personal belongings remain prohibited. This amends the SRS v1.1 baseline. College-specific data isolation, tenant-scoped resource visibility, and separate college administration are not implemented; domain allowlisting alone is not tenant isolation or proof of authority over an asset.
