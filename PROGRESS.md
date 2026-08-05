# Progress notes

**PP Lab** — Micro/Macro psychokinesis test console (Next.js 16 + Supabase +
Vercel). Formerly an MBTI-style quiz site; that content was fully replaced.
Repo: https://github.com/Ausoir/Website (`main`). Live: https://pktest.vercel.app
(deploy of the PP Lab swap in progress — not yet confirmed live).

## Stack

- Supabase: https://cofccoayvgugynyfcemb.supabase.co · Google OAuth only,
  confirmed working. Keys in `.env.local` (gitignored) + Vercel Production env.
  OAuth client secret JSON kept outside the repo at `C:\Users\Ga\Documents\credentials\`.
- Vercel: project `quiz-site` / account `robe2`, Hobby (free) plan — note
  Hobby ToS forbids commercial/ad use, revisit before monetizing. No
  GitHub↔Vercel auto-deploy (account not linked to GitHub); deploys are
  manual `vercel --prod`. Public domain `pktest.vercel.app` is a real
  project domain (exempt from `ssoProtection`); all other project URLs are
  intentionally gated/404.
- Domain: no real domain purchased yet, running on free `.vercel.app`.

## What's built

- `src/components/pp-lab.{tsx,css}` — the console. Ported from a standalone
  `pk_lab.html` prototype: CSS scoped under `.pp-lab-page`, JS moved into a
  `useEffect` with container-scoped queries + cleanup (cancels rAF, removes
  resize listener). Micro-PK (live REG bit-stream) and Macro-PK (simulated
  Galton board), both pure client-side.
- Third tab, **Statistics**: one box per test (Micro-PK, Macro-PK) showing
  live current-session numbers (always) plus an "all-time" summary for
  signed-in users (runs saved, total trials, best |z|, last run). Anonymous
  visitors just see the live session box + a sign-in nudge.
- Persistence: `pk_runs` table (`supabase/migrations/0003_pk_runs.sql`,
  **not yet applied to the live DB — run it in the Supabase SQL editor**).
  On Reset, if signed in and the run had ≥1 trial, `pp-lab.tsx` inserts a
  summary row via the browser Supabase client (RLS: insert/select own rows
  only). `/` (`src/app/page.tsx`) is now an async server component that
  fetches the user and passes `{ id }` into `<PpLab user={...} />`.
- `/` renders `<PpLab user={...} />`. `/login`, `/auth/callback`, `/account`
  (auth pages) kept as-is; `/account` is still the old quiz-attempts history
  view and doesn't yet show PK run history.
- Removed: quiz runner, scoring lib, `/quiz/[slug]` route. **Not removed**:
  Supabase quiz schema/migrations — tables still exist, unused. `<AdSlot />`
  component also now unused/orphaned.

## Verified

- `tsc`/`eslint` clean after the Statistics tab work; dev-server HTML fetch
  confirmed all three tabs, both live-stat boxes, and the anon sign-in note
  render server-side.
- **Not yet done**: `next build`; interactive browser test of the console
  (start/stop/reset, live charts, tab switching, Statistics tab after a
  Reset while signed in); applying `0003_pk_runs.sql` to the live Supabase
  DB; confirming the latest Vercel deploy went live.

## Next up

1. Run `supabase/migrations/0003_pk_runs.sql` in the Supabase SQL editor
   (needed before signed-in stat persistence works anywhere but never).
2. Confirm the in-progress `vercel --prod` deploy succeeded and
   `pktest.vercel.app` serves PP Lab (not the old quiz).
3. Interactive smoke test of PP Lab in a real browser, including the new
   Statistics tab (anon session view + signed-in all-time view).
4. Decide: wire up GitHub→Vercel auto-deploy, or keep manual deploys.
5. Buy a real domain once happy with the site (registrar notes: Porkbun/
   Cloudflare for at-cost pricing, avoid GoDaddy's renewal hikes).
