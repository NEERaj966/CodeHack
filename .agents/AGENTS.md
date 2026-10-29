# Workspace agent rules

These are project-specific rules for agents working on Campus Resource Intelligence.

## Product and safety boundaries

- Treat the root SRS and its project-approved member-lending amendment as the product source of truth; maintain requirement IDs in implementation notes.
- Only institution-owned resources may be listed. Members attest to their authority to share them; administrators can manage all listings.
- Enforce eligibility, permissions, availability, and booking state on the server/database, never only in React.
- Restricted resources always require manual approval and lister- or administrator-attended handover.
- Do not allow overlapping confirmed bookings; retain completed/cancelled history.
- Incident reports are evidence for human review, never automatic findings of fault or penalties.
- Do not expose service-role credentials, personal information, or evidence through public storage.

## Engineering rules

- Prefer vertical slices that deliver one usable workflow through UI, API, and database.
- Validate inputs at API boundaries and use database constraints/RPCs for race-sensitive invariants.
- Keep audit events append-only and record the actor, action, affected record, timestamp, and reason when relevant.
- Do not add a dependency unless the existing Node/React stack cannot meet the need.
- Preserve unrelated worktree changes. Never clean, reset, or overwrite user changes to make tests pass.
- Report external setup requirements explicitly; a passing local build is not proof of a Supabase integration.
- Update `progress.md` and `README.md` when scope, setup, or verified status changes.

## Delivery workflow

Use the project-local `gsd-execution` skill for substantial work. Its phase guides are in `./workflows/`:

1. Plan a bounded outcome and trace it to SRS requirements.
2. Execute in coherent end-to-end slices, surfacing blockers rather than hiding them.
3. Verify with focused unit/build/smoke tests and record what requires external credentials.
4. Update progress and user-facing setup documentation before declaring completion.
