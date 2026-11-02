# Architecture rules
- Preserve the Express application and PostgreSQL session/authentication architecture because this repository is the deployed PaidTasksHub source, not the Lovable preview template.
- Mount recommendation routes before catch-all member routes and enforce existing authentication and activation middleware because AI matching is a member-only task feature.
- Keep gateway credentials and model prompts server-only, and filter recommendations against freshly available database tasks because model output cannot authorize task access or invent inventory.
- Keep terminal AI credit/access blocks in PostgreSQL settings and resume only through an authenticated administrator action because process restarts must not replay blocked AI work.
