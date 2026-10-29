# Campus Resource Intelligence

A single-college resource-sharing platform that helps institutions safely share underused equipment, spaces, and facilities with eligible students while keeping staff in control of approvals, safety checks, and operational accountability.

This project is based on the SRS v1.1 document: `SRS v1.1 Campus Resource Intelligence.md`.

## Project purpose

The platform addresses the problem of unused college-owned resources by creating a centralized workflow for:
- resource discovery
- eligibility verification
- booking requests
- approval and waitlist handling
- pickup and return
- issue and maintenance tracking
- utilization reporting
- audit history

## Key goals

- Centralize management of college resources
- Improve underused equipment and campus space utilization
- Provide a transparent request and approval process
- Prevent conflicts and monopolization through FairShare rules
- Ensure accountability through records, condition reports, and audit logs
- Create a clear system for incidents, penalties, and appeals

## Target users

- Students
- Student teams
- Resource managers
- Department owners
- Administrators

## Roles

- Student: search and request resources, manage personal bookings, report incidents, appeal decisions
- Resource Manager: manage assigned resources and reviews
- Department Owner: manage department-level policy and escalations
- Administrator: configure college-wide policy and account roles

## Core features

- Resource inventory management with ownership and department assignment
- Eligibility checks and training verification
- Search, filters, and availability views
- FairShare allocation and waitlists
- QR/token-based handover for pickups and returns
- Condition reports and resource passport tracking
- Incident and maintenance workflows
- Notifications and overdue reminders
- Utilization and demand analytics
- Append-only audit trails

## Technology stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB
- Auth: sessions or JWT in HTTP-only cookies
- Storage: authenticated image storage for evidence and photos
- Scheduler: reminder and expiry jobs

## Repository structure

- `SRS v1.1 Campus Resource Intelligence.md` — product requirements specification
- `AGENTS.md` — AI/project agent guidance
- `requirements.txt` — project requirements summary
- `progress.md` — project status and milestone tracking
- `backend/` — backend application codebase

## MVP scope

The mandatory MVP includes the core lifecycle from resource discovery to checkout and return, including approval logic, fairness controls, no-show handling, and auditability. Optional scope includes AI-assisted matching, digital payments, and broader institutional features.

## Status

This repository currently contains the SRS and project planning documentation. Implementation work for the application itself can begin from the documented requirements and architecture.

## Next steps

1. Scaffold the frontend and backend structure
2. Implement authentication and user roles
3. Build resource and eligibility modules
4. Implement booking and FairShare logic
5. Add QR/token handover and condition reports
6. Add reminders, incidents, and analytics
7. Validate against SRS requirements and P0 priorities

## Notes

The SRS explicitly restricts the project to a single college prototype. The project intentionally excludes personal resale, multi-college support, and online payment in the mandatory scope.
