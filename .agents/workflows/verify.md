# Verify a milestone

1. Run targeted unit tests for changed logic.
2. Run backend sanity checks and frontend build/lint when those layers changed.
3. Exercise API behavior against a configured Supabase project when credentials are available; otherwise state that the integration remains unverified.
4. Review error paths, role boundaries, concurrent booking protection, and migration assumptions.
5. Update `progress.md` with completed, partial, blocked, and deferred work.
6. Update startup instructions and environment examples when setup changes.
