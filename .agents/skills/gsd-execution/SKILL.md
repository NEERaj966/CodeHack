---
name: gsd-execution
description: 'Use when planning or implementing substantial Campus Resource Intelligence work: break a goal into a bounded milestone, execute vertical slices, verify the result, and update progress.'
---

# Project execution workflow

This repository workflow is inspired by the plan/execute/verify cadence of Get Shit Done (GSD). It is a project-specific guide, not a vendored copy of another framework. Detailed phases: [plan](../../workflows/plan.md), [execute](../../workflows/execute.md), and [verify](../../workflows/verify.md).

## Use when

- A task spans multiple files or layers (React, Express, Supabase).
- A milestone needs to be recorded in `progress.md`.
- A request asks for implementation of an SRS priority or end-to-end workflow.

## Procedure

1. Read the relevant section of `SRS v1.1 Campus Resource Intelligence.md`, current `progress.md`, and the files directly involved.
2. Define a small completion target and list the FR/NFR IDs it covers. Distinguish implementation from external setup.
3. Implement a coherent vertical slice. Keep backend authorization and database invariants authoritative.
4. Run the smallest relevant tests, then frontend build and backend sanity tests when the change crosses those layers.
5. If Supabase credentials or a configured project are unavailable, validate offline behavior and explicitly mark integration verification as pending.
6. Update `progress.md`, `README.md`, and related setup docs with completed, partial, blocked, and deferred requirements.
7. Report changed areas, validation results, external actions the user must perform, and remaining gaps.

## Completion criteria

- The requested behavior exists in the actual runtime path, not only in documentation.
- Security-sensitive actions are enforced server-side and durable invariants are enforced in Postgres where possible.
- Tests cover relevant behavior and pass, or a specific blocker is documented.
- Documentation never claims an unverified external integration or unfinished requirement as complete.
