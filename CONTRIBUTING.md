# Contributing to Xelma Backend

Thanks for contributing! This guide covers the essentials. For deeper architecture
details, see [docs/architecture.md](docs/architecture.md) and the [README](README.md).

## Dual-entrypoint architecture

The repo ships **two Express applications**, and this is the single most common
source of contributor mistakes — several issues were closed while the
functionality existed in only one of them:

| Command | File | Use when |
| --- | --- | --- |
| `npm run dev` | `src/index.ts` | **Default.** Full backend — real DB, WebSocket, Soroban. Almost all work belongs here. |
| `npm run dev:hackathon` | `src/server.ts` (`src/app.ts`) | Mock/demo app, no database. |

**Always verify your change on the default `npm run dev` path before opening a PR.**
If your change touches functionality shared by both apps, verify it on the
hackathon entrypoint too.

## Development workflow

```bash
npm ci                 # install dependencies
npm run db:prepare     # generate the Prisma client and apply all migrations
npm run dev            # start the default (production) dev server

npm run lint           # type-check (tsc --noEmit)
npm test               # run the test suite
npm run build          # compile to dist/
```

## Database migrations

The database is owned by **two** migration tools: **Prisma** (core schema, under
`prisma/migrations/`) and **Drizzle** (the hackathon schema, under `drizzle/`).
Do not run them separately — `npm run db:migrate` applies both in order, and
`npm run db:prepare` runs `prisma generate` then `db:migrate`. This is the same
command CI and the deploy workflow use. Change the core schema with
`npm run prisma:migrate`; change the hackathon schema with
`npx drizzle-kit generate` and commit the new file under `drizzle/`. See the
README "Migration story" section for the full table.

## Keeping the repo root clean

Accidental empty files at the repo root (e.g. `src*.ts` leftovers from misplacing
entries while creating new files) clutter search results and confuse contributors.
Before committing, run `git status --short` and delete any zero-byte or stray
`.ts` files that do not belong at the root. If your new file lives under `src/`,
make sure it is created there — not at the repository root.

## Opening a pull request

1. Branch off `main`.
2. Make your change and add tests.
3. Run `npm run lint` and `npm test` locally.
4. Fill out every section of the pull request template, including the
   **Affected endpoints** list and the entrypoint-verification checklist.
5. Reference the issue you are closing (`Closes #123`).

The pull request template is applied automatically to new PRs from
[.github/pull_request_template.md](.github/pull_request_template.md).

## Runtime modes

Before opening a PR, verify your change works under the appropriate runtime
mode flags. The authoritative matrix of `DATA_MODE`, `BET_STUB_MODE`,
`ROUNDS_MOCK_MODE`, and their interactions lives in
**[docs/runtime-modes.md](docs/runtime-modes.md)**.
