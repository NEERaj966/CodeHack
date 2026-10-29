# AGENTS.md

## Project: Campus Resource Intelligence

This repository is being built around the SRS v1.1 document located at the project root: `SRS v1.1 Campus Resource Intelligence.md`.

The project implements a college resource-sharing platform for equipment, facilities, and spaces. The system must keep governance, approval, condition tracking, and auditability in the backend, while the frontend remains a thin presentation layer.

## Mission

Build a single-college prototype that supports:
- student discovery and booking of college-owned resources
- resource ownership and approval by authorized staff
- FairShare allocation and waitlists
- QR/token-based handover and condition reporting
- maintenance, incidents, penalties, and appeals
- utilization analytics and audit logs

## Core constraints from the SRS

1. Only authorized college personnel may register institutional resources.
2. Students cannot list, rent out, or sell personal belongings.
3. Backend enforcement is mandatory for all access control, validation, and business logic.
4. Restricted resources must follow manual approval rules.
5. No overlapping confirmed bookings for the same tracked resource.
6. Audit records are append-only and cannot be modified by ordinary users.
7. Evidence, condition photos, and personal data must stay protected.
8. The prototype is for a single college; multi-college support is out of scope.

## Role model

- Student: can search, request, cancel, waitlist, confirm handover, appeal, and view own history.
- Resource Manager: manages assigned resources and requests.
- Department Owner: manages department policy and approvals.
- Administrator: configures college-wide policy and account roles.

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
- QR/token pickup/return
- condition report and incident handling
- notifications and audit trail
- basic utilization reporting

## Architecture expectations

### Frontend
- React + Vite + Tailwind CSS
- student and staff views
- role-based UI gating
- mobile-friendly responsive design

### Backend
- Node.js + Express
- centralized business logic and permission checks
- validation and state-machine enforcement
- secure file handling for photos and evidence
- job scheduler for reminders and expiries

### Data layer
- MongoDB as the primary persistence layer
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
- Keep the UI simple, explainable, and clear for students and staff.
- Keep documentation updated as features are implemented.

## Repository conventions

- Root files store project planning and requirements documentation.
- `backend/` contains the application implementation.
- Keep implementation aligned with the SRS, especially for role permissions, booking logic, and audit integrity.

## Suggested execution order

1. Setup project structure and environment.
2. Implement authentication and role-based access.
3. Add resource registration and eligibility configuration.
4. Build search, booking, and FairShare logic.
5. Implement handover, condition reports, and incidents.
6. Add notifications and scheduled jobs.
7. Complete analytics and audit reporting.
8. Validate against the MVP requirement set from the SRS.

## Important note

This project is a prototype for a 48-hour build, so broad multi-college or AI-heavy features are intentionally out of scope unless specifically approved later.
