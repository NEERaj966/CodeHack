# AGENTS.md

## Project: Campus Resource Intelligence

This repository is being built around the SRS v1.1 document located at the project root: `SRS v1.1 Campus Resource Intelligence.md`.

The project implements a college resource-sharing platform for equipment, facilities, and spaces. The system must keep governance, approval, condition tracking, and auditability in the backend, while the frontend remains a thin presentation layer.

## Mission

Build a collaborative prototype for verified members from participating colleges that supports:
- member discovery and booking of college-owned resources
- member lending of institution-owned resources they are authorized to share
- approval by the resource lister, with global administration by an administrator
- FairShare allocation and waitlists
- Manual-ID-based handover and condition reporting
- maintenance, incidents, penalties, and appeals
- audit logs

## Core constraints from the SRS

1. Members may list only institution-owned resources they are authorized to share and must attest to that authority.
2. Members cannot list, rent out, or sell personal belongings.
3. Backend enforcement is mandatory for all access control, validation, and business logic.
4. Restricted resources must follow manual approval rules.
5. No overlapping confirmed bookings for the same tracked resource.
6. Audit records are append-only and cannot be modified by ordinary users.
7. Evidence, condition photos, and personal data must stay protected.
8. Member registration is limited to explicitly approved participating-college email domains; domain allowlisting alone is not tenant isolation.

## Role model

- Member: can list authorized institutional resources, borrow from other members, approve requests on their own listings, record permitted handovers/returns, report incidents, and view relevant history.
- Administrator: manages accounts, all resources, incident statuses, and audit history.

## Functional priority guide

Use the SRS priorities to decide scope:
- P0: must be included in the MVP prototype
- P1: important and should be included if feasible within sprint scope
- P2: optional or stretch feature

The minimum build should cover the full core booking lifecycle:
- account registration and verification
- resource creation and eligibility rules
- discovery and search
- booking request + approval workflow
- FairShare allocation and waitlist
- manual asset-ID pickup/return
- condition report and incident handling
- notifications and audit trail

Utilization analytics, QR/token handover, teams, appeals, and advanced fairness are later priorities in the SRS, not P0 acceptance requirements.

## Architecture expectations

### Frontend
- React + Vite + Tailwind CSS
- member and administrator views
- role-based UI gating
- mobile-friendly responsive design

### Backend
- Node.js + Express
- centralized business logic and permission checks
- validation and state-machine enforcement
- secure file handling for photos and evidence
- job scheduler for reminders and expiries

### Data layer
- Supabase Postgres as the primary persistence layer
- append-only audit collection
- resource and booking records with history retention
- conditional validation for overlaps, no-shows, and conflict handling

## Implementation rules

- Do not perform business logic in the frontend.
- Validate all inputs server-side.
- Log all important decisions with actor, timestamp, reason, and affected record.
- Keep approval decisions human-reviewable even when an automated rule passes.
- Never bypass restricted-resource safety or approval rules.
- Prevent duplicate handover/return actions for the same booking.
- Show clear plain-language reasons for rejection, waitlist, no-show, and exception decisions.
- Handle no-show, maintenance conflict, and waitlist expiry workflows explicitly.

## Deliverable expectations

When building the product:
- Preserve the SRS terminology and IDs where possible.
- Map features to relevant FR/NFR requirements.
- Prioritize prototype reliability over broad feature breadth.
- Keep the UI simple, explainable, and clear for members and administrators.
- Keep documentation updated as features are implemented.

## Repository conventions

- Root files store project planning and requirements documentation.
- `backend/` contains the application implementation.
- Keep implementation aligned with the SRS, especially for role permissions, booking logic, and audit integrity.

## P0 implementation status

The P0-oriented app workflows are implemented. The remaining P0 release gate is external Supabase setup and end-to-end verification, described in `progress.md` and `README.md`.

## Suggested execution order

1. Apply the Supabase migration and configure participating-college domains.
2. Verify signup, email confirmation, and first-admin bootstrap.
3. Exercise member resource listing, discovery, eligibility, and lister approval.
4. Exercise pickup, condition report, return, incident, notification, and audit timeline.
5. Fix integration findings, then move to P1 requirements.

Project-local plan/execute/verify guidance is in `.agents/`.

## Important note

This project is a prototype for a 48-hour build. Cross-college registration and member-to-member institutional resource sharing are in scope. Tenant-scoped data isolation and AI-heavy features remain out of scope. College-domain verification does not itself prove a member's authority to share a particular institutional asset; the product records the member's attestation and gives administrators global moderation access.
