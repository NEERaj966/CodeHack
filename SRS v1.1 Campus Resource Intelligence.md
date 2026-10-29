# SRS v1.1: Campus Resource Intelligence

Oct 28, 2026 · @neeraj kumar

## 1. Introduction

Campus Resource Intelligence is a web platform that lets verified members of participating colleges safely share institution-owned equipment, labs and spaces. A member can lend resources they are authorized to share and borrow from other members; an in-app administrator manages accounts, listings and reports. This specification preserves the v1.1 requirements while incorporating the project-approved multi-college member-lending amendment.

### 1.1 Purpose

This Software Requirements Specification defines what the system must do, who uses it, how the main features behave, and how the finished product is evaluated. It guides frontend, backend, database, testing and deployment work.

### 1.2 Project overview

Colleges own laboratory equipment, computers, cameras, projectors, sports gear, classrooms and seminar rooms that often sit idle, while college members lack access for projects and research. Verified members may list institution-owned resources they are authorized to share, define access conditions and approve requests from eligible members.

The platform supports the whole sharing lifecycle: discovery, eligibility verification, booking, approval, handover, condition documentation, return, incident handling and audit history. It adds fair allocation, QR-based handover, maintenance monitoring and utilization analytics.

### 1.3 Objectives

1. Centralize management of college-owned resources.
2. Improve utilization of underused equipment and spaces.
3. Give members from participating colleges one place to discover, lend and request resources.
4. Keep resource owners in control of access and approvals.
5. Prevent double bookings and monopolization by individuals or groups.
6. Record resource condition at pickup and return, acknowledged by both parties.
7. Keep a traceable history of every important action, visible to relevant members and administrators.
8. Detect maintenance issues and manage incidents, disputes and appeals.
9. Show management where demand is unmet and where sharing is possible.
10. Measure utilization with a documented formula.

### 1.4 Scope

The system supports:

- College-owned equipment and institutional facilities.
- Verified member and administrator accounts.
- Resource inventory, availability, booking rules and blackout dates.
- Search, filtering and eligibility checks, including training and certificates.
- Booking requests, approval workflows, no-show handling and cancellations.
- FairShare allocation: usage limits, group limits and waiting lists.
- QR-based resource identification and token-based handover.
- Pickup and return condition reports with dual sign-off.
- Incident, damage, dispute, penalty and appeal handling.
- Maintenance records and conflict handling when a resource goes offline.
- Notifications, reminders and overdue escalation.
- Utilization analytics, demand insights and audit logs.

**Explicit scope restriction:** members cannot list, rent out or sell personal belongings. A member may list only an institution-owned resource they are authorized to share; the lister attests to that authority and is responsible for coordinating access. Administrators may review or correct any listing. College email verification establishes membership, not authority to share a particular asset.

Online payment and AI-assisted features are optional extensions. Registration across multiple participating colleges is in scope for this project amendment; tenant-scoped data isolation and separate per-college administration are not yet provided.

### 1.5 Definitions

| Term | Definition |
| --- | --- |
| Resource | College-owned equipment, facility or bookable space. |
| Member | Verified account from an allowlisted college domain. Members can list authorized institution-owned resources, borrow from other members and coordinate handover/return. |
| Administrator | In-app role that manages accounts, listings and incident status across the participating-college deployment. |
| Team | A named group of students booking under a shared project. |
| Booking | A request or confirmed reservation for a resource over a time period. |
| Eligibility | Conditions a user must meet to request or use a resource. |
| Check-out / Check-in | Handing a resource to a student / recording its return. |
| Condition Report | A record of a resource's state at pickup or return. |
| FairShare | The mechanism applying transparent allocation and usage-limit rules. |
| Resource Passport | The full historical record of one resource. |
| Audit Log | An append-only record of important system actions. |
| Utilization | Actual checked-out hours divided by bookable hours (see section 8). |
| No-show | An approved booking where pickup does not occur within the grace period. |
| Incident | A reported damage, loss, overdue return or other resource problem. |
| Handover Token | A short-lived, signed, booking-specific code used to authorize pickup or return. |

## 2. Problem justification and focused use case

The deployment may accept verified members from multiple participating colleges. College-specific data isolation and separate per-college administration are outside this prototype, so the email-domain allowlist must contain only participating institutions.

### 2.1 Why the problem matters

The problem statement scores understanding of the problem at 15 points and expects evidence. The team must gather its own evidence and must not invent statistics.

- **Mini-survey:** 10-15 students (what they could not access, why, how long they waited) and 2-3 lab or department staff (what sits idle, what they fear: damage, misuse, no records).
- **Usage snapshot:** if a department shares its existing booking sheet or logbook, count idle days for two or three items. Use anonymized or fictional data only.
- **Reporting:** the project document states the sample size, the questions and the raw findings, and labels any figure as a small sample.

### 2.2 Demo resource categories

| Category | Example | Eligibility path | Handover mode |
| --- | --- | --- | --- |
| Restricted lab device | Oscilloscope or 3D printer | Verified training certificate, lister or administrator approval, deposit hold | Lister-attended |
| Self-service item | Camera or projector | College email verification, usage limits, auto or manual approval | Self-service with handover token |
| Bookable space | Seminar room | Department-defined purpose and capacity rules, manual approval by the lister or administrator | Self-service check-in with administrator review |

### 2.3 Target users

- **Members** who need equipment for projects, research and events and members authorized to lend institution-owned resources.
- **Administrators** who manage accounts, listings, incident review and audit accountability.

### 2.4 Success measures

- A judge completes one full journey (list, discover, request, approve, pickup, return, history) with no manual database step.
- Every approval, rejection and waitlist outcome shows a plain-language reason.
- Overlapping confirmed bookings are impossible, including under concurrent requests.

## 3. Overall description

The system is a centralized web application where the backend enforces every permission and business rule, and the frontend only presents them.

### 3.1 Product perspective

1. A frontend for members and administrators.
2. A backend API holding business logic, permissions and workflows.
3. A database for resources, users, bookings and related records.
4. An image storage service with authenticated access for photos and evidence.
5. A notification mechanism (in-app, optional email).
6. **A background job scheduler** for reminders, overdue escalation, reservation expiry and waitlist offers.
7. An analytics module for utilization, demand and resource insights.

### 3.2 User classes and roles

| Role | Can do | Cannot do |
| --- | --- | --- |
| Member | Register with a verified allowlisted college email; list institution-owned resources they are authorized to share; search, check eligibility, request bookings, decide requests for resources they listed, record permitted handovers/returns, report incidents and view their own borrowing/lending history | List personal belongings, approve own booking requests, manage another member's listing, alter audit logs or bypass restrictions |
| Administrator | Manage member accounts and roles, review/correct any listing, review incidents and audit history, and manage deployment-wide settings | Bypass restricted-resource eligibility or erase audit history |

Self-registration creates member accounts only, limited by a participating-college email-domain allowlist. Only an administrator may grant administrator access. The member who lists a resource is its request approver; restricted-resource safety and manual approval rules still apply.

### 3.3 Operating environment

The system runs in current desktop and mobile browsers. The proposed stack below is an implementation choice, not a product requirement.

| Component | Technology |
| --- | --- |
| Frontend | React with Vite, Tailwind CSS |
| Backend | Node.js with Express |
| Database | Supabase Postgres |
| Authentication | Supabase Auth with server-issued HTTP-only cookies |
| Image storage | Supabase Storage with signed or authenticated URLs |
| Notifications | In-app, optional email |
| Scheduler | node-cron, Agenda or BullMQ on an always-on host |
| QR | QR generation and browser-based scanning, manual ID fallback |
| Deployment | Web hosting, backend hosting, managed database |

### 3.4 Design constraints

- A member must attest that each listed resource is institution-owned and that they are authorized to share it; an administrator may review or correct listings.
- All access-control rules are enforced by the backend.
- Approval never creates conflicting confirmed reservations.
- Restricted equipment follows its eligibility and supervision rules.
- Access, safety and penalty decisions stay reviewable by an authorized human.
- Personal information and evidence are protected.
- The prototype uses fictional, anonymized or authorized demonstration data.

### 3.5 Assumptions and dependencies

1. The college provides or authorizes the resource information entered.
2. Each resource has a responsible department and manager.
3. Students use a supported browser; staff inspect physical equipment and make safety decisions.
4. College email verification or another approved identity process is available.
5. Email, image storage and hosting may need third-party providers.
6. Analytics depend on accurate availability and booking records.
7. QR scanning needs a compatible device or the manual fallback.
8. Payment collection is outside the mandatory scope.

## 5. Functional requirements A: accounts, resources, discovery, eligibility

Requirement IDs from v1.0 are kept for traceability. Requirements new in v1.1 carry IDs from FR-110 upward and are marked NEW. Priorities: **P0** mandatory for the minimum prototype, **P1** important, **P2** optional.

### 5.1 Authentication and user management

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-001 | Users register with required account information. Self-registration creates member accounts only, restricted to an allowlist of participating-college email domains. | P0 |
| FR-002 | The system verifies college email by link or OTP. | P0 |
| FR-003 | Account states: unverified, verified, suspended. | P0 |
| FR-004 | Roles: member and administrator. A verified member may both lend institution-owned resources they are authorized to share and borrow eligible resources. | P0 |
| FR-005 | The backend verifies permissions before any sensitive action. | P0 |
| FR-006 | Administrators manage accounts and assign roles. Only administrators can elevate a role. | P1 |
| FR-007 | Each listing is associated with its member lister, institution and responsible department. | P0 |
| FR-008 | Users view and update permitted profile information. | P1 |
| FR-110 NEW | Students can form a Team (name, project, members) for group bookings. | P1 |

### 5.2 Resource inventory management

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-009 | A verified member may list a college-owned resource they are authorized to share, and must attest to its institutional ownership and sharing authority. Administrators can manage all listings. Personal belongings are prohibited. | P0 |
| FR-010 | A resource has name, description, category, unique ID, location, condition and status. | P0 |
| FR-011 | Resource photos can be uploaded. | P0 |
| FR-012 | Quantities are supported for groups of equivalent items, with individual tracking where needed. | P1 |
| FR-013 | Categories include laboratory, IT, sports, facilities and event equipment. | P0 |
| FR-014 | The resource lister defines when their resource may be requested. | P0 |
| FR-015 | The resource lister configures eligibility, training, supervision and usage conditions; the backend enforces them. | P0 |
| FR-016 | Statuses: available, reserved, in use, under maintenance, unavailable, retired. | P0 |
| FR-017 | Listings can be updated or deactivated without erasing history. | P0 |
| FR-018 | Every active listing records its institution, responsible department, member lister, and ownership attestation. | P0 |
| FR-111 NEW | Each resource has an `approvalMode`: `auto` (low-risk, no restrictions) or `manual` (the lister or administrator approves). Restricted resources must be `manual`. | P0 |
| FR-112 NEW | Each resource has a `handoverMode`: `staff_attended` (the lister or administrator attends) or `self_service`. High-value and restricted resources must be `staff_attended`. | P0 |
| FR-113 NEW | Each resource has a deposit or credit-hold amount (may be zero) and a flag for mandatory condition photos. | P1 |

### 5.3 Search and discovery

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-019 | Students search by name or keywords. | P0 |
| FR-020 | Filters: category, location, date, availability, resource type. | P0 |
| FR-021 | Details show description, location, availability, eligibility and usage conditions. | P0 |
| FR-022 | Requirements are explained before a request is submitted. | P0 |
| FR-023 | Alternatives are suggested when a resource is unavailable, provided the member is eligible for them. | P2 |

### 5.4 Eligibility, training and safety

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-024 | Eligibility is checked before a request is accepted for processing. | P0 |
| FR-025 | Required training or authorization is recorded and checked. | P1 |
| FR-026 | Supervised resources are marked, and the configured approval is enforced. | P1 |
| FR-027 | Automated eligibility checks never bypass mandatory lister or administrator approval for restricted resources. | P0 |
| FR-028 | The system explains why a user cannot request a resource when it is safe to disclose. | P1 |
| FR-114 NEW | Students upload a training certificate or authorization document. Staff review it in a verification queue and approve or reject it with a reason. | P1 |
| FR-115 NEW | Training records have an expiry date. Expired records fail the eligibility check and trigger a reminder to renew. | P1 |
| FR-116 NEW | A resource may require a named supervisor sign-off, recorded on the booking. | P1 |

## 6. Functional requirements B: booking, FairShare, handover

### 6.1 Booking and reservation

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-029 | Eligible members submit a request with resource, time period and purpose. | P0 |
| FR-030 | Availability is validated before a request is accepted, using the booking rules in section 4. | P0 |
| FR-031 | The backend prevents overlapping confirmed reservations for the same individually tracked resource. | P0 |
| FR-032 | Booking states and allowed transitions follow the state machine in section 4. Overdue and disputed are flags, not states. | P0 |
| FR-033 | The member who listed a resource or an administrator approves or rejects its requests. `auto` resources are approved by the system when all checks pass. | P0 |
| FR-034 | A reason is recorded when a request is rejected, waitlisted, expired, or subject to an exceptional decision. | P0 |
| FR-035 | Cancellation follows configured policy. Cancelling inside the late-cancellation window is recorded and counts toward usage history. | P1 |
| FR-036 | Members request extensions where permitted. | P1 |
| FR-037 | Extensions are validated against later reservations, eligibility and maximum duration. | P1 |
| FR-038 | Members view their own borrowing and lending booking histories; administrators view deployment-wide histories. | P0 |
| FR-039 | A calendar shows available and reserved slots. | P1 |
| FR-117 NEW | A booking not picked up within the no-show grace period becomes `no_show`. The slot is released, and the no-show is recorded in the member's usage history. | P1 |
| FR-118 NEW | When a resource enters maintenance or becomes unavailable, every approved future booking is flagged, the borrowing member is notified, and alternatives or rescheduling are offered. The lister or administrator decides the outcome. | P1 |
| FR-119 NEW | A member-visible timeline shows each of their transactions end to end: request, decision and reason, pickup, return, incident, appeal. | P0 |

### 6.2 FairShare allocation engine

FairShare gives transparent, explainable allocation. It never makes a final access decision for a restricted resource; the resource lister makes that decision, with administrator oversight.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-040 | Configurable limits on active bookings, hours per week and booking frequency, applied per member. | P0 |
| FR-041 | Students join a waiting list when a resource or slot is unavailable. | P0 |
| FR-042 | Documented allocation rules apply when competing requests cannot all be fulfilled. | P1 |
| FR-043 | Priority may consider eligibility, college-defined academic priority and previous access where policy permits. | P1 |
| FR-044 | Every approval, rejection or waitlist outcome stores a plain-language explanation in `allocationDetails`. | P0 |
| FR-045 | The lister or administrator may override an outcome when permitted. The action and reason are recorded. | P1 |
| FR-046 | Unconfirmed reservations expire and release their slots. | P1 |
| FR-047 | Eligible waitlisted members are notified when a slot opens. | P1 |
| FR-120 NEW | Group limits: a Team counts as one booker, and all members' bookings count toward the team's limits. | P1 |
| FR-121 NEW | Monopolization detection: the system flags repeated back-to-back bookings, or repeated bookings by the same member or team, above a configurable threshold. The lister or administrator reviews the flag. | P1 |
| FR-122 NEW | Waitlist offers have a claim window (default 2 hours). If unclaimed, the offer passes to the next entry. | P1 |

**Default FairShare rules (configurable by administrators):**

- Maximum 2 active bookings per member and 1 per resource category at a time.
- Maximum 8 booked hours per member per resource per week.
- Cooldown of 24 hours after any booking longer than 4 hours on the same resource.
- Waitlist order is by priority score, highest first:

```latex
\text{score} = w_a \cdot \text{academic priority} + w_t \cdot \text{waiting time} + w_u \cdot \text{time since last use}
```

- Weights default to 0.4, 0.3 and 0.3 and are set by policy. Ties are broken by earliest request time, then by lowest member ID, so the result is deterministic.
- The explanation shown to the member names the rule that decided the outcome, for example "waitlisted: position 3, 2 active bookings already hold this slot."

### 6.3 QR-based handover

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-048 | The resource lister or administrator generates a unique QR code for an individually tracked resource. | P1 |
| FR-049 | Scanning the asset QR identifies the resource only. It grants no access and shows no private data. | P1 |
| FR-050 | Before recording a handover, the backend verifies the booking, the user's permissions and the resource status. | P1 |
| FR-051 | A pickup record stores resource, booking, timestamp, actor and confirmation details. | P0 |
| FR-052 | A return record stores timestamp, actor and confirmation details. | P0 |
| FR-053 | Invalid duplicate pickups or returns are rejected. | P1 |
| FR-054 | QR codes never independently grant access or expose private user data. | P1 |
| FR-123 NEW | For a booking, the borrowing member's app shows a short-lived, signed, booking-specific Handover Token (default 10 minutes), scanned or entered by the lister or administrator. The server validates it independently. | P1 |
| FR-124 NEW | `staff_attended` resources require the lister or an administrator to complete pickup and return. `self_service` resources allow the borrowing member to complete them through the valid handover process. | P0 |
| FR-125 NEW | Manual entry of the resource ID is a fallback when scanning is unavailable. It requires the same validation. | P0 |
| FR-126 NEW | The borrowing member must accept the usage terms at pickup. The acceptance is recorded. | P1 |

## 7. Functional requirements C: condition, incidents, penalties, notifications, deposits

### 7.1 Condition reports and Resource Passport

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-055 | An initial condition report is recorded at pickup. | P0 |
| FR-056 | A final condition report is recorded at return. | P0 |
| FR-057 | Photos, checklists and notes are supported as evidence. | P1 |
| FR-058 | Each report records author, timestamp, booking and stage. | P0 |
| FR-059 | The Resource Passport holds identity, location, status, bookings, condition reports, incidents and maintenance. | P1 |
| FR-060 | Completing, cancelling or deactivating never erases historical records. | P0 |
| FR-061 | Staff compare initial and final condition reports for a booking. | P1 |
| FR-127 NEW | The borrowing member and resource lister acknowledge each condition report. A disagreement is recorded as a note and can open an incident. | P1 |
| FR-128 NEW | Photos are mandatory at pickup and return for resources flagged high-value (see FR-113). | P1 |
| FR-129 NEW | A post-return inspection window (default 48 hours) lets staff report hidden damage found after return. After the window, new damage claims need a department owner's approval. | P1 |

### 7.2 Incidents, maintenance, penalties and appeals

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-062 | Students and staff report damage, loss, overdue returns or other incidents. | P0 |
| FR-063 | Photos and notes attach to an incident. | P1 |
| FR-064 | Incident states: reported, under review, awaiting repair, resolved, closed. | P1 |
| FR-065 | Staff mark a resource unavailable pending inspection or repair. | P0 |
| FR-066 | Maintenance records hold description, dates, responsible staff and status. | P1 |
| FR-067 | Only the resource lister or an administrator clears a restricted resource for service. | P1 |
| FR-068 | The system never assigns fault or applies a penalty automatically from an incident report. | P0 |
| FR-069 | Staff record findings and resolutions for disputes. | P1 |
| FR-130 NEW | Penalties are decided by an authorized person from a defined set: warning, temporary booking restriction (with end date), deposit forfeiture, referral to college authority. Each requires a recorded reason and evidence. | P1 |
| FR-131 NEW | A member can appeal a penalty or incident finding with a written statement. An administrator or a different authorized reviewer decides and records the outcome. | P1 |
| FR-132 NEW | Overdue escalation ladder: reminder before due time, notice at due time, staff alert after a grace period, `overdue` flag and incident after a second threshold. Staff decide any consequence. | P0 |

### 7.3 Notifications and reminders

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-070 | Users are notified of booking requests and decisions. | P0 |
| FR-071 | Reminders are sent before scheduled return. | P0 |
| FR-072 | The borrowing member and responsible lister or administrator are notified when a resource is overdue. | P0 |
| FR-073 | Users are notified of cancellations, extensions, waitlist updates, maintenance conflicts and incident status. | P1 |
| FR-074 | Each user has an in-app notification list. | P1 |
| FR-075 | Email notifications for important events. | P2 |

### 7.4 Deposits and optional fees

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-106 | College-authorized fees or deposits are displayed. | P2 |
| FR-107 | Payment states are recorded: pending, received, refunded, forfeited. | P2 |
| FR-108 | If online payment is integrated, status is verified server-side with the provider. | P2 |
| FR-109 | Only authorized institutional personnel define fees and financial policy. | P2 |
| FR-133 NEW | Deposit hold (no real payment): a booking on a deposit-bearing resource records a `held` state. Staff mark it `released` on clean return or `forfeited` with a reason and owner approval. | P1 |

## 8. Functional requirements D: analytics, dashboards, audit

### 8.1 Underused Resource Radar

Utilization is measured as actual use against time the resource could have been used:

```latex
\text{utilization} = \frac{\text{actual checked-out hours}}{\text{bookable hours}}
```

Bookable hours exclude maintenance, blackout dates and closed hours. The Radar also reports reserved hours separately, so no-shows do not inflate the figure.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-076 | Utilization is calculated with the formula above over a selectable period. | P1 |
| FR-077 | Resources below a configurable utilization threshold (default 20%) are flagged as underused. | P1 |
| FR-078 | Resources with repeated waitlists, unfulfilled requests or high utilization (default above 80%) are flagged as high-demand. | P1 |
| FR-079 | Demand and availability are compared across authorized departments. | P2 |
| FR-080 | Sharing suggestions are based on availability, demand and access limits. | P2 |
| FR-081 | The dashboard shows utilization findings and suggested actions to administrators. | P1 |
| FR-134 NEW | The Radar shows reserved hours, used hours and no-show hours separately per resource. | P1 |

### 8.2 Smart Resource Matcher (optional)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-082 | A member's stated purpose is matched with suitable resources. | P2 |
| FR-083 | Recommendations consider the requested period and availability. | P2 |
| FR-084 | A resource is never shown as immediately bookable if the member does not meet its access conditions. | P2 |
| FR-085 | The reason for a recommendation is explained. | P2 |

If AI is used, it is advisory only. AI output is labelled, logged in the audit trail, and never makes an access, safety or penalty decision.

### 8.3 Unmet demand and reuse impact

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-086 | Requests that fail for lack of availability are recorded. | P1 |
| FR-087 | Frequently requested unavailable categories are identified. | P2 |
| FR-088 | The system suggests reviewing existing inventory before new purchases. | P2 |
| FR-089 | Recommendations rest on recorded usage and request data. | P2 |
| FR-090 | The system never authorizes purchases or disposal of property. | P0 |
| FR-091 | Reports show completed bookings, booked hours and distinct resources used. | P1 |
| FR-092 | Reports show requests fulfilled and unfulfilled. | P1 |
| FR-093 | Utilization trends over selectable periods. | P2 |
| FR-094 | Estimated savings use explicit, configurable assumptions and are labelled as estimates. | P2 |
| FR-095 | Impact reports on reuse and utilization. | P2 |

### 8.4 Dashboards and reporting

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-096 | The dashboard shows resources, bookings, overdue returns, pending requests and incidents. | P1 |
| FR-097 | Staff access only the functions their responsibilities permit. | P1 |
| FR-098 | Authorized personnel review important historical actions. | P0 |
| FR-099 | Permitted reports export as CSV. | P2 |
| FR-100 | Administrators configure booking limits, categories and allocation rules. | P1 |

### 8.5 Audit and accountability

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-101 | Important actions are logged: approvals, rejections, cancellations, extensions, handovers, returns, incident decisions, penalties, appeals, overrides. | P0 |
| FR-102 | Each audit event holds actor, action, affected record, timestamp and, where applicable, a reason. | P0 |
| FR-103 | Ordinary users cannot modify or delete audit events. The log is append-only. | P0 |
| FR-104 | Authorized staff trace a transaction from request through return. | P0 |
| FR-105 | Selected security-sensitive access and admin actions are logged. | P1 |
| FR-135 NEW | Optional tamper evidence: each audit event stores a hash of the previous event, so edits are detectable. | P2 |

## 9. Non-functional requirements

Non-functional requirements set the performance, security, reliability and privacy bar. Duplicates from v1.0 were merged (NFR-001 now covers NFR-002 and NFR-003; FR-005 and NFR-008 are one rule).

### 9.1 Performance

| ID | Requirement |
| --- | --- |
| NFR-001 | At least 95% of ordinary API requests, including search and booking validation, complete within 2 seconds under the agreed prototype load, excluding external services and large file transfers. |
| NFR-004 | Large resource and audit-history lists use pagination. |

### 9.2 Security

| ID | Requirement |
| --- | --- |
| NFR-005 | All production traffic uses HTTPS. |
| NFR-006 | Passwords managed by the application are hashed with a suitable algorithm (bcrypt or argon2). |
| NFR-007 | Credentials are not exposed in client-side storage or logs. |
| NFR-008 | The backend enforces authorization on every sensitive operation. |
| NFR-009 | Input is validated, with protection against injection, XSS and CSRF where applicable. |
| NFR-010 | Uploads are checked for file type, size and access rights. |
| NFR-011 | Condition photos, personal data and incident evidence are protected from unauthorized access. |
| NFR-032 NEW | Login endpoints are rate limited, accounts lock temporarily after repeated failures, and session or token lifetimes expire. |
| NFR-033 NEW | Evidence photos are served only through authenticated or signed, expiring URLs, never public links. |
| NFR-034 NEW | The audit log is append-only: the application database user has insert and read rights on it, and no update or delete rights. |

### 9.3 Reliability and data integrity

| ID | Requirement |
| --- | --- |
| NFR-012 | No two conflicting confirmed reservations exist for the same individually tracked resource and period, including under concurrent requests. |
| NFR-013 | Booking state transitions are validated on the backend against the state machine. |
| NFR-014 | Booking and audit records remain available after completion or cancellation. |
| NFR-015 | A backup and recovery procedure exists for the deployment. |
| NFR-016 | Errors do not expose internal details or sensitive information. |
| NFR-035 NEW | Scheduled jobs are idempotent and recover missed runs after a restart, so reminders and expiries are not lost or duplicated. |

### 9.4 Usability and accessibility

| ID | Requirement |
| --- | --- |
| NFR-017 | The interface is responsive on desktop, tablet and mobile. |
| NFR-018 | Labels, status indicators and validation messages are clear and actionable. |
| NFR-019 | Students complete the main booking workflow without technical knowledge. |
| NFR-020 | The booking flow targets WCAG 2.1 AA: keyboard access, visible focus, sufficient contrast, labelled form fields. |

### 9.5 Maintainability

| ID | Requirement |
| --- | --- |
| NFR-021 | Frontend, backend and database responsibilities are separated into modules. |
| NFR-022 | API responses and error handling follow one convention. |
| NFR-023 | Booking limits, eligibility conditions and thresholds are configurable. |
| NFR-024 | Environment-specific configuration and secrets use environment variables. |

### 9.6 Privacy

| ID | Requirement |
| --- | --- |
| NFR-025 | Only personal information needed for defined purposes is collected. |
| NFR-026 | Users see only the personal information and records their role permits. |
| NFR-027 | Evidence and audit data are retained according to policy. Default: evidence is kept 12 months after case closure, then deleted or anonymized; audit events are kept for the life of the platform. |
| NFR-028 | Demonstration data is fictional, anonymized or used with permission. |

### 9.7 Compatibility and availability

| ID | Requirement |
| --- | --- |
| NFR-029 | Current major desktop and mobile browsers are supported. |
| NFR-030 | Production targets at least 99% monthly availability, excluding agreed maintenance and subject to hosting limits. |
| NFR-031 | QR scanning has a manual ID fallback. |
