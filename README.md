# Campus Resource Intelligence

Campus Resource Intelligence lets verified members from participating colleges lend authorized institution-owned equipment, labs, facilities, and spaces, and borrow from other members. The member who lists a resource handles its requests and attended handovers; in-app administrators manage accounts, listings, incident status, and audit history.

The product requirements are in [SRS v1.1 Campus Resource Intelligence.md](./SRS%20v1.1%20Campus%20Resource%20Intelligence.md), updated with the project-approved member-lending model. The current implementation delivers the P0 member/administrator resource-sharing workflow using Supabase.

## What is implemented

- Member registration with a participating-college domain allowlist and Supabase email verification
- HTTP-only session cookie and backend role/account-state checks
- Member-created institutional listings with an ownership authorization attestation
- Lister-managed eligibility rules, availability, booking decisions, attended handover, and signed photo uploads
- Administrator account, global listing, incident-review, and audit tools
- Search by keyword, category, location, resource type, and requested time window
- Booking requests with explainable manual approval/auto-approval and a waitlist outcome
- FairShare defaults: up to two active requests, one active booking per category, eight hours per resource per week, and a 24-hour cooldown after bookings longer than four hours
- Database-enforced booking overlap protection and booking state transitions
- Lister-attended or self-service pickup/return with manual asset-code validation and condition reports
- Incident reporting without automatic fault or penalty decisions
- In-app decision notices, return reminders, overdue escalation, and an overdue incident for administrator/lister review
- Member borrowing/lending transaction timeline and administrator audit-history endpoint; audit rows are protected against update/delete

P1/P2 items such as cancellation and extension flows, team bookings, training-document review, waitlist offer claims, penalty/appeal processing, utilization radar, CSV export, and online payments are not included in this P0 implementation.

## Stack and layout

- Frontend: React + Vite (`frontend/`)
- Backend: Node.js + Express (`backend/`)
- Data/Auth: Supabase Postgres and Supabase Auth
- Private resource image bucket: Supabase Storage
- Database schema and follow-up migrations: `backend/supabase/migrations/`
- Project-specific agent guidance and workflows: `.agents/`

## Prerequisites

- Node.js 22 or newer and npm
- A Supabase project
- Participating-college email domains you are authorized to allow
- A browser and two terminal windows

## Supabase setup

1. Create a Supabase project.
2. In **Project Settings → API**, copy the project URL, publishable/anon key, and service-role/secret key. The service-role key is privileged and must stay in the backend environment only.
3. Apply database migrations in filename order:
   - For a new project, run `202610290001_initial_schema.sql`, then `202610290002_add_member_role.sql`, then `202610290003_member_lending_model.sql`.
   - If the initial migration was already applied, do **not** rerun it; run only `202610290002_add_member_role.sql` and `202610290003_member_lending_model.sql`.
   - In particular, `202610290003_member_lending_model.sql` adds the `ownership_attested_by` and `ownership_attested_at` columns required to create resource listings.
4. Add each participating college's authorized email domain to the database allowlist (without `@`). These ten are examples; confirm each institution's official email domain and only allow colleges participating in your deployment:

   ```sql
   insert into public.allowed_email_domains (domain)
   values
     ('nitgoa.ac.in'),
     ('iitb.ac.in'),
     ('iitd.ac.in'),
     ('iitm.ac.in'),
     ('iitk.ac.in'),
     ('iitkgp.ac.in'),
     ('iitg.ac.in'),
     ('iisc.ac.in'),
     ('bits-pilani.ac.in'),
     ('vit.ac.in')
   on conflict (domain) do nothing;
   ```

5. Add the same comma-separated domains to `COLLEGE_EMAIL_DOMAINS` in `backend/.env`. Example:

   ```env
   COLLEGE_EMAIL_DOMAINS=nitgoa.ac.in,iitb.ac.in,iitd.ac.in,iitm.ac.in,iitk.ac.in,iitkgp.ac.in,iitg.ac.in,iisc.ac.in,bits-pilani.ac.in,vit.ac.in
   ```
6. In **Authentication → URL Configuration**, set the local site URL to `http://localhost:5173` and allow that URL as a redirect. Keep email confirmation enabled.
7. Create the initial administrator using the registration page and confirm the email. Then promote the verified account in the SQL Editor:

   ```sql
   update public.profiles
   set role = 'administrator'
   where email = lower('admin@nitgoa.ac.in')
     and account_status = 'verified';
   ```

   The application has two roles: `member` and `administrator`. Members cannot self-assign administrator access. Use the in-app administrator controls to promote or suspend accounts; the last active administrator cannot be demoted or suspended.

### Troubleshooting resource listing: `PGRST204`

If the backend reports that Supabase cannot find `ownership_attested_at` on `resources`, the connected database has not applied the member-lending migration, or PostgREST has not refreshed its schema cache. Check whether both required columns exist:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'resources'
  and column_name in ('ownership_attested_by', 'ownership_attested_at')
order by column_name;
```

If either column is missing, apply `202610290002_add_member_role.sql` and then `202610290003_member_lending_model.sql` from `backend/supabase/migrations/` in the Supabase SQL Editor. Do not rerun the initial schema migration on an existing project. Then refresh the PostgREST schema cache:

```sql
notify pgrst, 'reload schema';
```

If both columns already exist, run the `notify` command and retry. Restart the backend after the database change so you can see any remaining errors in its logs.

## Local startup

### 1. Configure environment variables

From the project root in PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
```

If either `.env` already exists, edit it rather than overwriting it. Set these backend values in `backend/.env`:

```env
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
COLLEGE_EMAIL_DOMAINS=nitgoa.ac.in,iitb.ac.in,iitd.ac.in,iitm.ac.in,iitk.ac.in,iitkgp.ac.in,iitg.ac.in,iisc.ac.in,bits-pilani.ac.in,vit.ac.in
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret
```

Set the root `.env` value:

```env
VITE_API_URL=http://localhost:5000
```

Never put `SUPABASE_SERVICE_ROLE_KEY` in the root/frontend `.env`, a `VITE_` variable, source code, or a commit.

### 2. Install dependencies

Run once in each application directory:

```powershell
Set-Location backend
npm install

Set-Location ..\frontend
npm install
```

### 3. Start the backend

In the first terminal:

```powershell
Set-Location backend
npm run dev
```

The API listens at `http://localhost:5000`.

- Liveness: `http://localhost:5000/api/health`
- Supabase readiness: `http://localhost:5000/api/health/ready`

Readiness should return `{"status":"ready","database":"connected"}` after the migration and environment are configured.

### 4. Start the frontend

In a second terminal:

```powershell
Set-Location frontend
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

## Sanity checks

Run from the indicated directory:

```powershell
Set-Location backend
npm test
npm run test:sanity

Set-Location ..\frontend
npm run test:sanity
```

- Backend unit tests cover eligibility policy and the administrator/member role boundary.
- Backend sanity test starts Express and calls its health endpoint.
- Frontend sanity test runs the production Vite build.
- A configured Supabase project is required to verify auth, migrations, storage, and database workflows end to end; local sanity tests do not claim that external integration passed.

## First use

1. Register with an email in a configured participating-college domain.
2. Verify the email through Supabase Auth, then sign in.
3. Promote the initial trusted account to administrator using the bootstrap SQL above.
4. As a member, list an institution-owned resource you are authorized to share and review its incoming requests.
5. As another member, search and request that resource, then follow the booking through decision, pickup, condition report, and return.

## Security and scope notes

- Authorization and eligibility are checked by the backend; the frontend role display is not a security boundary.
- A member must attest that a listing is institution-owned and that they are authorized to share it. The attestation is recorded, but is not independent proof of institutional authorization; administrators have global listing moderation.
- Members can manage only their own listings and related booking requests. Administrators can manage all member accounts, listings, incident statuses, and audit history.
- Supabase tables use RLS and direct `anon`/`authenticated` table access is revoked. API operations use the backend service-role key.
- The image bucket is private; the API issues short-lived signed URLs.
- Audit events are append-only and protected by a database trigger.
- The scheduled worker checks return reminders and overdue escalation every minute while the backend is running.
- Demonstration records must be fictional, anonymized, or authorized.
- Member registration is restricted to configured participating-college email domains; do not allow unrestricted public domains.
- Cross-college registration and member-to-member institutional resource sharing are project-approved amendments to the SRS v1.1 baseline. The allowlist does not provide college-specific data isolation, separate college administrators, or tenant-scoped resource visibility. Those governance boundaries require additional multi-institution architecture before production use.
- Personal resale and online payment are outside the mandatory prototype scope.
