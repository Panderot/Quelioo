# Quelio

AI quiz / solve / flashcards web app with Archive and accounts. Vite + React + TS + Tailwind v4 + react-i18next, Supabase, Vercel functions. `design.md` is the design source.

## Rules
- Secrets: never print, paste or commit keys, tokens, passwords or `.env*`; the owner writes `.env.local`. Never commit `.claude/`.
- Never run `supabase config push`, `supabase login` or `vercel login`. The linked project is TEST (`quelio-test`).
- Order: TEST migration → tests → backup → production migration → push. Production migrations only with `--db-url` and the password from `.env.local`: dry run → apply → read-only SELECT. Push only at zero failures. Backups never go to GitHub (public repo).
- Ask the user before touching auth.
- Destructive tests only on `quelio-test`; production test users only `baretgungormezer+qtest-…`.
- No new features, only additions to existing ones. Vercel Hobby limit 12 functions, 7 used: add endpoints to existing ones.
- AI: tests never call real AI (`no-real-ai`). Track real dollars, stop and ask when over the budget. Users never see cost info (`no-cost-ui.spec.ts`).
- i18n: TR, EN, HYW with identical key sets, no hard-coded strings; HYW needs native review.
- Deploy: only by push to master; verify `https://quelio.vercel.app/version.json` (poll 20 s, max 5 min). Public URL is `getPublicSiteUrl`.

## Tests
- `npm run test:each [files]` (`PW_WORKERS`, `PW_EXTRA`), `npm run test:supabase`, `playwright.prod.config.ts`. New or changed specs `--repeat-each=3`; no fixed sleeps.
- Locally only the task's specs; tsc/lint/build once at the end. Full suite and `test:supabase` run in CI: push, then `gh run watch`; red → `gh run view --log-failed`, fix, push.
- Workers: free RAM >= 10 GB `PW_WORKERS=4`, else 2; under 4 GB stop and ask.
- Playwright headless, not Claude in Chrome. Kill only own processes; leave no background jobs.
- CI has no AI keys; `tests/accuracy` never runs there; a missing `SUPABASE_TEST_*` secret fails the job. Reports quote the `report` job TOTAL: passed / failed / skipped / flaky and duration.

## Work style
- Prompts in `../QUELIO-PROMPTS`, test artifacts in `../QUELIO-TEST-*`. No notes in the repo. Final reports in Turkish.
- Map: `src/{pages,components,hooks,lib,api,i18n}`; `api/*.ts` thin functions, logic in `api/_lib/*`, LLM calls only via `api/_lib/llm.ts`, AI endpoints in `withAuth`; `supabase/` migrations and email templates; `tests/{e2e,supabase,accuracy,fixtures,guards,prod}`.

## Context ve token kullanımı

- Önce görevi ve ilgili dosyaları belirle. Tüm projeyi baştan sona okuma.
- Dosya ararken hedefli aramalar yap; yalnızca gerekli dosyaları ve bölümleri aç.
- CLAUDE.md, DESIGN.md ve diğer uzun dokümanları her görevde yeniden okuma.
- Değişmemiş ve daha önce incelenmiş dosyaları tekrar okuma.
- Büyük logları, build çıktılarını ve test sonuçlarını bütünüyle paylaşma. İlgili hata satırlarını ve kısa bir özeti ver.
- Küçük görevlerde uzun planlar ve gereksiz açıklamalar üretmeden doğrudan uygula.
- İş bitince kısaca neyin değiştiğini, nasıl doğrulandığını ve varsa kalan sorunu belirt.
- Hata ayıklamak veya değişikliği güvenle yapmak için ek bilgi gerekiyorsa ilgili dosyayı ya da log bölümünü oku.

## Bilgilerin güncelliği

- Bu dosyada geçmiş görev özetleri, tamamlanmış işler, eski kararlar veya doğrulanmamış bilgiler tutulmasın.
- Yalnızca hâlâ geçerli olan proje kuralları, mimari kararlar ve çalışma talimatları burada yer alsın.
- Güncel durumu anlamak için mevcut kodu ve yapılandırmayı kontrol et. Bu dosyadaki bilgi onlarla çelişiyorsa eski bilgiyi düzelt.
- Her görev sonunda CLAUDE.md'ye otomatik olarak günlük veya ilerleme özeti ekleme.
