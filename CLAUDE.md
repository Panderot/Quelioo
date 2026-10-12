# Quelio

AI quiz / solve / cards / song / audio-lesson / live-game / written-exam web app. Vite + React + TS + Tailwind v4 + react-i18next, Supabase, Vercel functions. `design.md` is the single source of design truth.

## Secrets
- Never print or paste keys, tokens, passwords or `.env*` contents anywhere (chat, logs, commands, commits). The owner writes `.env.local` himself.
- Never commit `.claude/`.

## Supabase
- Never run `supabase config push`, `supabase login` or `vercel login`.
- The linked project is TEST (`quelio-test`).
- Production migrations only with `--db-url` and the password from `.env.local`: dry run → apply → read-only SELECT check. Never print the password.

## Order and push
- Always: TEST migration → tests → production migration → push.
- Push only when the full suite has zero failures. If the work cannot finish, do not push.

## Test data
- Destructive tests only on `quelio-test`.
- Production test users only as `baretgungormezer+qtest-…`; never create other users on production.
- Student data: nickname only, deleted after 30 days.

## Tests (16 GB machine)
- Commands: `npm run test:each [files]` (`PW_WORKERS`, `PW_EXTRA`), `npm run test:game`, `npm run test:supabase`, `playwright.prod.config.ts` for prod.
- New or changed specs run with `--repeat-each=3`. Never use fixed sleeps.
- At most 2 workers; `test:game` always 1. Free memory under 6 GB: 1 worker. Under 4 GB: stop and ask.
- Playwright headless, not Claude in Chrome. Only kill processes you started.

## Deploy
- A push to master auto-deploys; verify `https://quelio.vercel.app/version.json`.
- The public address is always `https://quelio.vercel.app` (`getPublicSiteUrl`).
- Vercel Hobby limit is 12 functions and 11 are used: add new endpoints to existing functions.

## AI cost
- Track real dollars; stop and ask when over the task's budget. Students never see cost/token info (`no-cost-ui.spec.ts`).

## i18n
- TR, EN and HYW with identical key sets; no hard-coded strings. HYW needs native-speaker review before wide release.

## Work style
- Prompts live in `../QUELIO-PROMPTS`; test artifacts go to `../QUELIO-TEST-*`. No progress notes or reports in the repo.
- Search first, open only what the task needs. Final reports in Turkish.

## Map
- `src/{pages,components,hooks,lib,api,i18n}` UI; `lib/remote` account data, `lib/legacy` old local stores, `lib/exam|live|import` feature logic.
- `api/*.ts` thin Vercel functions; logic in `api/_lib/*`; every LLM call goes through `api/_lib/llm.ts`; AI endpoints wrapped in `withAuth`.
- `supabase/` migrations and email templates; `tests/{e2e,game,supabase,accuracy,fixtures}`; `scripts/` build/test helpers.
