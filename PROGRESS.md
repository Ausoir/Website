# Progress notes

PK Lab — a "Micro/Macro psychokinesis test console" (Micro-PK: live REG
binary-trial test; Macro-PK: simulated Random Mechanical Cascade/Galton
board), built with Next.js 16 + Supabase + Vercel. Live at
https://pktest.vercel.app. Git repo pushed to https://github.com/Ausoir/Website
(`main`).

The site originally started as an MBTI-style personality quiz; that content
was fully replaced by PK Lab (see "History" below). Auth/account
infrastructure (Google OAuth via Supabase) was kept as-is since it's
independent of what content sits on `/`.

## Stack / accounts

- Supabase project: https://cofccoayvgugynyfcemb.supabase.co
- Supabase publishable key + URL live in `.env.local` (gitignored; `.env.example`
  has the placeholder shape and IS committed) and in the Vercel project's
  Production env vars
- Auth: Google OAuth only (no password/email auth, no SMTP needed) — Google Cloud
  Console OAuth client and Supabase "Google" provider are both configured and
  tested working end-to-end (sign-in redirects to Google, comes back to
  `/account` signed in). The downloaded OAuth client secret JSON lives at
  `C:\Users\Ga\Documents\credentials\` — outside the repo, never committed.
- Vercel: project `quiz-site` under account `robe2`. Deployed via Vercel CLI
  (not GitHub auto-deploy — the Vercel account isn't connected to GitHub as a
  login method, so `vercel --prod` has to be run manually for each deploy).
  Hobby (free) plan — note Hobby's terms restrict it to non-commercial use;
  revisit if/when ads or paid features go live.
- Public URL: **pktest.vercel.app** — added as a proper Vercel project domain
  (not just an alias) so it's exempt from the project's
  `ssoProtection: all_except_custom_domains` setting. All other URLs for this
  project (the auto-generated `quiz-site-*.vercel.app` ones, raw deployment
  URLs) are intentionally gated behind Vercel's login SSO / return 404 — only
  `pktest.vercel.app` is meant to be public.

## What's built

- Scaffolded with `create-next-app` (TypeScript, Tailwind, App Router, `src/` dir)
- `src/lib/supabase/{client,server,middleware}.ts` — browser/server Supabase clients
- `src/proxy.ts` — session-refresh middleware (Next 16 renamed `middleware.ts` -> `proxy.ts`)
- `src/components/pk-lab.tsx` + `src/components/pk-lab.css` — the PK Lab
  console (client component). Ported near-verbatim from a standalone HTML
  prototype (`pk_lab.html`): CSS extracted into its own file (scoped under a
  `.pk-lab-page` wrapper class rather than global `:root`/`body`, so it
  doesn't clobber the site header's styling), JS logic wrapped in a
  `useEffect` with a container-scoped `$()` query helper and a proper cleanup
  function (cancels animation frames, removes the `window` resize listener)
  instead of the original's `document`-wide selectors.
  - Micro-PK: live `crypto.getRandomValues` bit stream, tracks deviation from
    50%, z-score, two-tailed p, drawn as a running deviation chart with
    ±1.96σ control bounds
  - Macro-PK: simulated Galton-board ball cascade (10 rows), bin histogram vs.
    expected binomial curve, same z/p stats
  - Both are pure client-side, no DB writes
- Pages:
  - `/` — renders `<PkLab />`
  - `/login` — "Continue with Google" button only
  - `/auth/callback` — OAuth code exchange route
  - `/account` — signed-in-only history page (redirects to `/login` if not
    authed). Currently always empty since nothing writes to `attempts`
    anymore post-quiz-removal; kept as-is since removing auth wasn't asked for.
- `src/components/site-header.tsx` — nav with sign in / email+sign out,
  branded "PK Lab"

## History: MBTI quiz → PK Lab

The site originally shipped as an MBTI-style personality quiz (scoring logic,
question-by-question runner, `quizzes`/`attempts`/etc. DB schema). That was
fully removed from the app in favor of PK Lab:

- Deleted: `src/app/quiz/[slug]/page.tsx`, `src/components/quiz-runner.tsx`,
  `src/lib/quiz/` (scoring + types)
- **Not touched**: the Supabase DB schema/migrations
  (`supabase/migrations/*.sql`, `supabase/seed.sql`) — those tables
  (quizzes, attempts, etc.) still exist in the live DB but are now unused by
  the app. Left alone since dropping them wasn't asked for and isn't
  necessary (RLS just means they sit idle).
- `src/components/ad-slot.tsx` (the `<AdSlot />` placeholder) is now
  unreferenced/orphaned — left in place in case it's wanted again later.

## Verified working

- `npx tsc --noEmit` (after a `next build`/`next dev` pass to regenerate
  `.next/types`) and `npm run build` both clean; `npm run lint` clean
- Production build's route list confirmed `/quiz/[slug]` is gone and no
  stale "Personality Quiz"/quiz copy remains
- Dev server smoke-tested: fetched rendered HTML, confirmed both canvases
  (`micro-canvas`, `macro-canvas`), both tabs, and PK Lab branding are present
- Supabase publishable key confirmed valid (hit `/auth/v1/health`)
- Google OAuth flow confirmed working by the user in a real browser (prior to
  the PK Lab swap — not yet re-verified since, though nothing about the auth
  path changed)
- `pktest.vercel.app` confirmed publicly serving (200), other project URLs
  confirmed gated/gone (302 SSO / 404)
- **Not yet done**: interactive/visual testing of the PK Lab console itself in
  a real browser (Start/Stop/Reset buttons, live chart drawing, tab
  switching) — only server-rendered HTML and a static content check have been
  verified so far

## Open decisions / deferred

- Domain name: not purchased yet. Currently living on the free `pktest.vercel.app`
  subdomain. Registrar notes from earlier discussion: Porkbun/Cloudflare
  Registrar for honest at-cost pricing (~$9-10/yr renewal), Namecheap for
  ease-of-use (~$17/yr), avoid GoDaddy (cheap first year, steep renewals).
  Typical `.com` budget: $10-20/yr.
- Vercel Hobby vs Pro: staying on free Hobby for now since there's no
  monetization live; will need to upgrade to Pro ($20/mo) before turning on
  any ads/paid features, per Vercel's ToS.
- GitHub → Vercel auto-deploy isn't wired up (account not connected to GitHub
  login) — every deploy is a manual `vercel --prod` from the local repo.
- Ads/subscriptions: no real ad network or payment integration; the
  `<AdSlot />` placeholder is currently unused since it isn't dropped
  anywhere in the PK Lab page.

## Next up

1. Interactive smoke test of PK Lab in an actual browser (run a Micro-PK and
   Macro-PK session, confirm charts draw, tab switching works, dark mode
   looks right).
2. Decide whether to wire up GitHub→Vercel auto-deploy (needs connecting
   GitHub as a login method on the Vercel account) or keep manual
   `vercel --prod` deploys.
3. Decide on a real domain once the site is live and happy.
