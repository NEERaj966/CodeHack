# Execute a milestone

1. Start with the smallest end-to-end slice and preserve existing behavior outside the requested scope.
2. Implement validation, authorization, error handling, and persistence alongside the user-facing behavior.
3. Use migrations and database constraints for data integrity and concurrency-sensitive rules.
4. Keep secrets in local environment files; never move privileged keys into the frontend.
5. Do not mark an SRS requirement complete until its runtime behavior exists.
6. Pause and document a blocker if a needed external service, schema, or authorization decision is unavailable.
