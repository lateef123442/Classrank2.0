# ClassRank

A React Native + Expo app for ClassRank — the cross-department gamified quiz
and ranking app for university students. Backed by a real **Supabase**
project (Postgres + Auth), with role-based apps for students, teachers, and
admins, a full design/motion system, and monetization scaffolding.

**Before launching, read [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md)** —
a prioritized (P0/P1/P2) consolidation of every gap noted throughout this
codebase, rather than something you'd have to piece together from a dozen
scattered "Known limitations" sections.

## What's included

- **Auth** — real email/password sign-up (with profile creation) and log-in
- **Home** — live points, streak, and department rank pulled from Postgres
- **Quiz** — today's questions for the student's department, submitted via a
  Postgres RPC that awards points and updates the streak atomically
- **Leaderboard** — Department → Faculty → Campus tiers, queried live, with
  pull-to-refresh
- **Profile** — points, streak, badges, and sign-out

## Design & motion system

This isn't a functional skeleton with default styling bolted on — it has an
actual design direction, and the motion isn't decorative sprinkle-on.

**The idea:** the app's whole subject is climbing a rank. The signature
element (`PulseRing`, in `src/components/animated/`) is a circular progress
ring used everywhere something is "filling up toward a threshold" — points
toward the next milestone on Home, percentile on the leaderboard. Home's
hero is a dark "arena" surface (your stats displayed like a scoreboard under
stadium lights), deliberately contrasted with a calm light body below and
everywhere else in the app — that contrast is a structural idea, not a
one-off decoration, which is why it's kept exclusive to `ArenaBackground`
rather than reused as a generic dark-card style.

**Typography:** Sora (bold, geometric — display headings and big numbers)
paired with Inter (clean, gets out of the way — body text). Loaded via
`@expo-google-fonts`; the whole app is gated behind font-loading in
`App.tsx` so there's no flash of system font before they swap in.

**Color has meaning, not just palette variety:** points use teal, rank/
percentile uses violet, streaks use ember-orange — consistently, everywhere,
so "that's a rank number" vs. "that's a points number" is legible at a
glance without reading the label.

**Motion primitives** (`src/components/animated/`), all built from scratch
on `react-native-reanimated` rather than a Lottie file, so there are zero
binary animation assets to ship and every color pulls from the app's own
token palette:
- `PulseRing` — the signature progress ring, with a resting pulse
- `AnimatedNumber` — counts up to a new value instead of snapping (points
  ticking up after a quiz is a big part of why finishing one should *feel*
  like something)
- `PressableScale` — spring scale-down + haptic tick on every primary
  tappable surface app-wide, so the UI feels physically responsive
- `ConfettiBurst` — a from-scratch particle burst for a perfect quiz score
- `StreakFlame` — flicker intensity scales with streak length
- `StaggerIn` — staggered fade/rise entrance for list items (leaderboard
  rows, badges) so content arrives in a wave instead of popping in at once
- `Skeleton` — shimmer loading placeholders shaped like the content
  they're standing in for, replacing bare spinners on Home/Teacher/Admin
  dashboards and the leaderboard

**Where the polish pass was applied deepest:** Home, Quiz, Leaderboard
(including a top-3 podium), Profile, and Auth — the screens every student
touches daily. Teacher and Admin screens inherit the same color/typography
system automatically (see the compatibility shim note in
`src/theme/colors.ts`) and got tactile buttons + skeleton loading, but
weren't rebuilt screen-by-screen with the same density of custom animation —
that was a deliberate scope call given where student attention actually
lives, not an oversight.

**Honest limitation:** I can't run a simulator or screenshot this app from
where I'm working — I can verify the code type-checks and the animation
logic is physically correct (no conditional hooks, no stale closures, no
memory leaks from unmounted timers), but you'll be the first to actually
see it move. If anything looks or feels off once you run it, that's real
feedback I don't have access to yet — tell me and I'll fix it.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project (free tier is fine).
2. In the dashboard, go to **SQL Editor → New query**, paste in the contents of
   `supabase/schema.sql`, and run it. This creates all tables, row-level
   security policies, the `leaderboard` view, and the `submit_quiz_results`
   function.
3. Run `supabase/002_normalized_leaderboard.sql` the same way — this adds the
   `leaderboard_normalized` view used by the Faculty and Campus boards (see
   "How the fairness model works" below).
4. Run `supabase/003_seed_today.sql` the same way to publish today's quiz for
   every department. **Run this again each day** until Phase 4 (the content
   pipeline) replaces this with an admin tool.
5. Run `supabase/004_production_hardening.sql` and
   `supabase/005_per_question_grading.sql` — these fix the security and
   correctness issues described below. **Required**, not optional, even for
   a demo — the earlier version leaks quiz answers to the client.
6. Run `supabase/006_roles_foundation.sql`, `supabase/007_admin_teacher_rpcs.sql`,
   and `supabase/009_teacher_list_questions.sql` — these add teacher/admin
   roles and all the RPCs the Teacher and Admin apps depend on.
7. Run `supabase/011_account_deletion.sql` and `supabase/012_pagination.sql`.
   The first is **required before app store submission** — see "Account
   deletion" below.
8. Run `supabase/013_push_tokens.sql` — adds storage for device push tokens
   (see "Notifications" below for what this does and doesn't enable yet).
9. Run `supabase/014_referrals.sql` and `supabase/015_social_feed.sql` — adds
   the referral system and social feed described below.
10. Run `supabase/016_subscriptions.sql` — adds Pro status columns and the
    Streak Shield mechanic. The actual paywall needs real setup beyond SQL —
    see "Monetization" below before expecting purchases to work.
10b. Run `supabase/017_courses_and_groups.sql` then `supabase/018_group_quizzes.sql` (group quizzes with server-side grading), then `supabase/019_push_notifications.sql` (push for announcements/replies; also deploy `supabase functions deploy notify`), then `supabase/020_study_sync.sql` (cloud backup of each student's study data) — adds teacher-run courses
    (join codes, materials, practice questions, announcements, exams, class
    analytics) and student study groups. **Required** for the Community tab,
    the teacher/admin Courses tabs and Home announcements. Then deploy the
    study companion function: `supabase functions deploy study-companion`
    (needs the `ANTHROPIC_API_KEY` secret; powers AI quiz/flashcard generation
    and the tutor). See `STUDY_COMPANION.md` for what the study features do.
11. **Required for password reset to work at all**: go to
    **Authentication → URL Configuration → Redirect URLs** and add
    `classrank://reset-password` to the allow-list. Without this, Supabase
    silently rejects the app's `redirectTo` and falls back to its default
    (a web URL your app can't handle), and the reset email link goes
    nowhere useful. See "Password reset" below.
12. (Optional but recommended for testing) In **Authentication → Providers →
   Email**, turn off "Confirm email" so new sign-ups can log in immediately
   without clicking an email link.
13. Go to **Project Settings → API** and copy your **Project URL** and
   **anon public key**.
14. After you've signed up once in the app (as any role), run
   `supabase/010_bootstrap_first_admin.sql` with your email filled in to make
   that account an admin. There's no self-service admin sign-up — see "Roles"
   below for why.

## Roles

ClassRank has three roles, each routed to a completely different set of
screens after login:

- **Student** (default, self-service sign-up) — Home, Quiz, Leaderboard, Profile.
- **Teacher** — Dashboard (department engagement stats), Questions (create/edit/
  delete their own department's quiz questions), Profile. Teacher sign-up
  requires an invite code (see below) — it is not self-service, because
  letting anyone grant themselves grading power over a department would be a
  serious integrity hole.
- **Admin** — Dashboard (platform-wide stats), Departments (create departments,
  generate teacher invite codes), Users (search and promote/demote roles),
  Profile. Admins are never self-service — see the bootstrap step above.

**How a teacher gets an account:** an admin generates a one-time invite code
scoped to a specific department (Admin app → Departments tab → select
department → Generate). The teacher enters that code during sign-up
(Auth screen → "Teacher" mode). The code is single-use and tied to that
department — a teacher can't accidentally (or deliberately) sign up for a
different department than the one the code was issued for.

**Why so many of these are RPCs instead of RLS policies:** Postgres
row-level security is row-level, not column-level — it can restrict *which
rows* a policy allows, but a naive setup can't stop someone from writing to
a column (like `role`) they shouldn't touch on a row they do own. Every
teacher/admin action here goes through a `security definer` function that
explicitly checks the caller's role before doing anything, which keeps the
authorization logic auditable in one place per action rather than scattered
across policies that are easy to under-scope. The `role` column itself also
has column-level privileges revoked from the `authenticated` Postgres role
as defense in depth — see `006_roles_foundation.sql`.

## Account deletion

Apple's App Store Review Guideline 5.1.1(v) requires apps that support
account creation to also support account deletion, in-app, without needing
to contact support. This is implemented: **Profile → Delete Account**,
behind a type-to-confirm modal (typing "DELETE" is required — this is
irreversible and immediate, not a soft delete or grace period).

Under the hood, `delete_own_account()` (see `011_account_deletion.sql`)
deletes the row directly from `auth.users`; because `profiles` and
`quiz_attempts` both reference their parent with `on delete cascade`, all of
that user's personal data is removed in one atomic operation with no
orphaned rows left behind.

## Legal documents

`legal/PRIVACY_POLICY.md` and `legal/TERMS_OF_SERVICE.md` are drafted and
cover the required substance (what data is collected, who it's shared with,
retention, user rights, account deletion, etc.) — **but they are templates,
not legal advice**. Both app stores require a live, hosted Privacy Policy
URL before they'll review your app. Before launch:
1. Have an actual lawyer review both documents for your jurisdiction(s).
2. Fill in the bracketed placeholders (contact emails, governing law, dates).
3. Host them somewhere public (a simple static page works) and put that URL
   in your App Store Connect / Play Console listing.

## Crash reporting

Wired up via `src/lib/errorReporting.ts`, using Sentry. It's a safe no-op
until you set `EXPO_PUBLIC_SENTRY_DSN` in `.env` — local development doesn't
require a Sentry account. Once set:
- The app-wide error boundary reports caught render errors automatically.
- Crash reports are tagged with the user's internal ID (not name/email) for
  investigation without embedding extra PII in crash logs.
- Before shipping, consider lowering `tracesSampleRate` in
  `errorReporting.ts` from `1.0` once you have real traffic, to avoid
  burning through your Sentry quota.

**One real limitation:** `@sentry/react-native` includes native code, which
plain **Expo Go doesn't include** — everything else in this app (Reanimated,
SVG, gradients, haptics, fonts) ships inside the standard Expo Go app for
SDK 51, but Sentry doesn't. To actually test crash reporting locally, you'll
need an EAS development build (`eas build --profile development`) rather
than plain `expo start` + Expo Go. It works fine in production EAS builds
either way — this only affects local testing of that one feature.

## Pagination

The Campus leaderboard and admin user search both paginate now instead of
returning a single capped page with no way to see more — Campus leaderboard
loads 50 rows at a time (scroll to load more), and admin user search loads
20 at a time. `supabase/012_pagination.sql` also clamps `admin_search_users`'
limit/offset server-side so a buggy or malicious client can't request an
unbounded result set.

If the Faculty/Campus fairness ranking (percentile-based, computed live)
ever becomes a performance bottleneck at large scale, see
`supabase/OPTIONAL_scaling_leaderboard.sql` for a materialized-view approach
— not applied by default, since most deployments won't need it.

## Notifications

Two distinct things live under "notifications," and it's worth keeping
them separate:

**Streak-risk reminder (built, works today):** a *local* notification —
scheduled entirely on-device via `expo-notifications`, no server involved.
Whenever a student's quiz-completion status changes, `AppContext`
reschedules it for the next 6 PM (today's if it hasn't passed, tomorrow's
otherwise) if they haven't done today's quiz yet, or cancels it if they
have. This matches the "Retention Loop" described in the original business
plan. See `src/lib/notifications.ts`.

**Push token capture (foundation only, not a working feature yet):** on
login, the app registers for a device push token and stores it on the
user's profile (`013_push_tokens.sql`). This is groundwork for a *future*
feature — e.g. a teacher publishing an announcement that pushes to their
department — but the sending side (a Supabase Edge Function calling Expo's
push API) isn't built. Don't advertise server-sent push notifications as a
current feature; the wiring exists, the delivery mechanism doesn't yet.

**Testing note:** push tokens require a physical device (simulators can't
get a real one) and, like Sentry, work fully in EAS builds but have
limitations in plain Expo Go depending on SDK version — the local streak
reminder doesn't have this limitation, since it never touches a push token.

## Password reset

Fixed a real gap, not just polish: previously, tapping the reset-password
email link had nowhere to go. Now:

1. The app registers a custom URL scheme (`classrank://`, in `app.json`).
2. The Supabase client uses PKCE flow (`src/lib/supabase.ts`) instead of
   the older implicit flow.
3. `resetPassword()` passes `redirectTo: classrank://reset-password` (built
   via `expo-linking`, so it resolves correctly in both Expo Go dev and a
   standalone build).
4. `src/lib/deepLinking.ts` catches the incoming link (cold start or
   already-running) and exchanges its one-time code for a session.
5. That triggers a `PASSWORD_RECOVERY` auth event, which `AppContext`
   detects and uses to route to `SetNewPasswordScreen` — taking priority
   over normal role-based routing in `RootNavigator` until the user sets a
   new password.

**This absolutely will not work without the Supabase dashboard step** in
the setup list above (adding `classrank://reset-password` to the redirect
URL allow-list). This is the kind of thing that's easy to test in isolation
and get subtly wrong in a way that only shows up on a real device with a
real email client — test it end-to-end before shipping, not just that the
code compiles.

## Onboarding

A three-slide carousel (`OnboardingCarousel.tsx`) shown once to first-time,
signed-out users — explaining the department-fair ranking system, streaks,
and the podium — before they hit the Auth screen. Skippable. The "seen it"
flag lives in `AsyncStorage`, checked once at `RootNavigator` startup
alongside the font-loading gate. An already-authenticated user reopening
the app never sees it again, regardless of the stored flag — it's a
first-impression tool, not something to nag returning users with.

Uses its own full-bleed gradient (not `ArenaBackground`, which is a
card-shaped component with rounded corners meant specifically for Home's
hero — reusing it here would have shown a visible border-radius gap around
the screen edges, and contradicted the "dark surface is exclusive to Home"
design principle documented in `theme/tokens.ts`).

## Analytics

`src/lib/analytics.ts` wraps PostHog with the same honest no-op-without-a-
key pattern as Sentry and RevenueCat — safe to run with nothing configured.
Once `EXPO_PUBLIC_POSTHOG_API_KEY` is set, it tracks: signup, login, quiz
completion (with score), badge earned, post created, referral shared,
upgrade modal viewed, and purchase completed — see `AnalyticsEvents` in that
file for the full, single-source-of-truth list rather than grepping the
codebase for track() calls.

Identify traits are deliberately minimal — role, university, department —
not name or email, matching the restraint the drafted Privacy Policy
commits to. `resetAnalytics()` is called on sign-out and account deletion so
events after logout aren't attributed to the previous user.

## Monetization

**The short version: the code is complete and correct; the business
accounts it depends on are not, and can't be, since they need real
Apple/Google/RevenueCat credentials only you can create.**

### What's built

- **`profiles.is_pro` / `pro_expires_at`** — the server-side source of
  truth for entitlement. Locked down with the same column-privilege
  pattern as `role` (006) — the client can never set these directly.
- **A real premium mechanic, not a placeholder**: Streak Shield. Free users
  lose their streak after missing one day; Pro users get a one-day grace.
  It's implemented directly in `submit_single_answer` (016), so it's
  enforced server-side, not just a client-side display difference.
- **`supabase/functions/revenuecat-webhook/`** — a Supabase Edge Function
  that receives RevenueCat's webhook events and updates `is_pro` using the
  service-role key (which bypasses RLS — this is the only thing that's
  allowed to write these columns).
- **`src/lib/purchases.ts`** — the RevenueCat client SDK wrapper: configure,
  log in (critical — see below), fetch offerings, purchase, restore.
- **`UpgradeModal`** — a real paywall UI. If no RevenueCat key is
  configured, it shows an honest "not set up yet" state instead of pretending
  to work.
- **Pro badges** — a crown next to Pro users' names on the leaderboard
  (all three tiers) and profile.

### What you need to do before any of this actually works

1. **Apple Developer account** ($99/year) — create your app in App Store
   Connect, then create an auto-renewable subscription product.
2. **Google Play Console account** ($25 one-time) — create your app, then
   create a subscription product.
3. **RevenueCat account** (free to start) — create a project, connect it to
   both app store products, and get your iOS/Android API keys.
4. Put those keys in `.env` as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` /
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
5. Deploy the webhook: `supabase functions deploy revenuecat-webhook`, then
   `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... REVENUECAT_WEBHOOK_SECRET=...`
   (the service role key is in Project Settings → API — **never** put this
   one in the app's `.env`, it bypasses every security rule in this
   database).
6. In the RevenueCat dashboard, add a webhook pointing at your deployed
   function's URL, with the Authorization header set to the same
   `REVENUECAT_WEBHOOK_SECRET`.
7. **This requires an EAS development build, not plain Expo Go** —
   `react-native-purchases` includes native code, same category as Sentry.
   `expo start` + Expo Go will not show real purchases.

None of this is optional scaffolding-that-might-help-later — without all
seven steps, the paywall will correctly show its "not configured" state
rather than silently pretending to work, which is deliberate: better an
honest empty state than a fake purchase flow.

### One architectural note worth understanding

`refreshProfileAfterPurchase()` in `AppContext` retries a few times after a
purchase completes, because RevenueCat confirms the purchase (Apple/Google
have already charged the card) *before* our webhook necessarily finishes
updating the database. This is normal, expected webhook lag, not a bug —
the purchase succeeded regardless of exactly when `is_pro` flips in our
mirror. The UI says so plainly rather than implying something went wrong if
it doesn't land within the retry window.

## Referral system

Every profile gets an auto-generated referral code (derived deterministically
from their own user id — collision-free, no retry-on-conflict logic needed).
A new student can enter someone else's code at sign-up; the code is
resolved to a real referrer **server-side**, in `complete_student_signup`
— never trust a client-supplied "who referred me" value, since that would
let anyone fabricate a referral for free points.

**The hones6t scope, matching what the original business plan actually
needed vs. what's actually built:**

- ✅ **Vesting delay** — the referrer isn't paid until the referred student
  has taken quizzes on 3 separate calendar days (`submit_single_answer` in
  `014_referrals.sql`). This is the real anti-farming lever: a fake account
  can't shortcut "3 different days" by answering many questions in one
  sitting, it takes real elapsed time.
- ✅ **Shadow-flagging** — an account with an unusually high number of
  successfully-vested referrals (>20, a starting guess worth tuning) gets
  quietly excluded from leaderboards for admin review, rather than a public
  ban that risks being wrong and creating a dispute.
- ❌ **Device/IP fingerprinting** — the original plan mentioned rate-limiting
  by device ID and IP. **Not implemented.** That needs infrastructure this
  migration can't provide (a fraud-detection service, Cloudflare Turnstile,
  etc.). Don't represent this as covered — it isn't.

Referral code + share button + stats (invited / vested count) live on
Profile for students.

## Social feed

Students (and teachers) can post to their own department's feed by default,
or mark a post "campus-wide" to make it public. Visibility is enforced by
real Postgres RLS on the `posts` table itself — not the
view-bypasses-RLS pattern used elsewhere in this schema for
`quiz_questions_public`/`leaderboard` (which works there because those
intentionally show the same rows to everyone, just fewer columns). Here,
*which rows* are visible genuinely depends on the viewer's own department,
so `feed_posts` is a `security_invoker = true` view (Postgres 15+, which
Supabase runs) — it correctly re-checks RLS as the querying user instead of
running with the view owner's elevated privileges. Getting this distinction
right matters: getting it wrong would leak "department-only" posts to the
entire campus.

Likes are optimistic client-side (instant feedback, rolled back on failure)
backed by a real unique constraint server-side (`post_likes` primary key on
`(post_id, profile_id)`) so a double-tap can't double-count.

**Scope note:** the Feed tab is only in the student navigation, not
Teacher/Admin — a deliberate call given where daily engagement actually
lives, not an oversight. Teachers/admins can still post and appear in the
feed (the RPCs don't restrict by role), they just don't have a dedicated
tab for it yet.

## Badges

Expanded from 4 to 8 tiers (`src/data/badges.ts` — streak at 3/7/14/30 days,
points at 500/1000/2500/5000), and earning one now triggers a proper
celebration: a modal with confetti and a spring pop-in, not just an item
quietly appearing in a list next time you open Profile.

Newly-earned detection persists in `AsyncStorage` per-user
(`useNewBadgeCelebration.ts`) — deliberately not a database column, since
it's purely "have I shown this animation before," not data with any reason
to sync across devices.

## 2. Configure the app

```bash
cp .env.example .env
```

Then fill in the two values from step 5 above:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

## 3. Run it

You'll need Node.js (18+) and either the **Expo Go** app on your phone, or an
iOS/Android simulator.

```bash
npm install
npx expo install --fix   # reconciles native package versions against your Expo SDK
npx expo start
```

> **Clean install (do this once after pulling the SDK 57 upgrade):**
> ```bash
> rm -rf node_modules package-lock.json .expo
> npm install
> npx expo install --fix     # snaps every package to the exact SDK 57 version
> npx expo start -c --tunnel
> ```
> **Expo Go on Android:** push notifications and reminders are not available there (Expo removed them in
> SDK 53). The app detects this and skips them silently — use a development build (`eas build --profile
> development`) to test notifications. Everything else runs in Expo Go.

Then scan the QR code with Expo Go, or press `i` / `a` for a simulator.
Everything in this app (Reanimated, SVG, gradients, haptics, fonts) runs
fine in plain Expo Go for SDK 57 — the one exception is Sentry crash
reporting, see "Crash reporting" above.

## Testing, type checking, and builds

```bash
npm run typecheck   # TypeScript, no emit
npm test            # Jest — validation logic + component smoke tests
```

CI (`.github/workflows/ci.yml`) runs both automatically on every push/PR to
`main`, plus a separate `security` job: `npm audit` (fails on high/critical
vulnerabilities) and a secret-scanning pass (`gitleaks`) over full git
history, not just the current diff. `.github/dependabot.yml` opens weekly
PRs for outdated/vulnerable dependencies, grouping minor/patch bumps
together and leaving major version bumps separate for individual review
(major bumps can break native modules like Reanimated or
react-native-purchases in ways minor bumps usually don't).

To build for real devices/app stores via EAS:

```bash
npm install -g eas-cli
eas login
eas build --profile development   # or preview / production
```

You'll need to replace `REPLACE_WITH_YOUR_EAS_PROJECT_ID` in `app.json` with a
real project ID from `eas init` first.

## Project structure

```
App.tsx                        # entry point: error boundary + navigation + global state
.env.example                   # copy to .env with your Supabase/Sentry/RevenueCat/PostHog keys
.gitignore
eas.json                       # EAS build profiles + submit config (dev/preview/production)
STORE_LISTING.md               # ready-to-use App Store / Play Store copy
.github/workflows/ci.yml       # typecheck + test on every push
legal/
  PRIVACY_POLICY.md             # draft — needs legal review before publishing
  TERMS_OF_SERVICE.md           # draft — needs legal review before publishing
supabase/
  001_schema.sql                # tables, RLS policies, leaderboard view, base RPC
  002_normalized_leaderboard.sql # percentile-based fairness view
  003_seed_today.sql            # publishes today's quiz per department
  004_production_hardening.sql  # security fix (hide answers), indexes, constraints
  005_per_question_grading.sql  # per-question grading RPC (replaces batch RPC)
  006_roles_foundation.sql      # role column, invite codes table, column-privilege lockdown
  007_admin_teacher_rpcs.sql    # security-definer RPCs for all teacher/admin actions
  009_teacher_list_questions.sql # lets teachers see their own answer keys
  010_bootstrap_first_admin.sql # one-time manual promotion of the first admin
  011_account_deletion.sql      # in-app account deletion (App Store requirement)
  012_pagination.sql            # bounded, paginated admin user search
  013_push_tokens.sql           # push token storage (foundation, not a working push feature yet)
  014_referrals.sql              # referral codes, vesting, shadow-flag safeguard
  015_social_feed.sql            # posts, likes, RLS-enforced department/campus visibility
  016_subscriptions.sql          # Pro status columns, Streak Shield mechanic
  017_courses_and_groups.sql     # courses, course content + analytics, study groups (RPC-only writes)
  018_group_quizzes.sql          # group quizzes graded on the server (answers never sent to takers)
  019_push_notifications.sql     # notified-once markers, safe push-token register/clear (shared phones)
  020_study_sync.sql             # private per-student cloud backup of study data (revisioned, RPC-only)
  OPTIONAL_scaling_leaderboard.sql # materialized-view note for large-scale deployments
  functions/
    revenuecat-webhook/index.ts   # Deno Edge Function — updates is_pro from RevenueCat events
    study-companion/index.ts      # Deno Edge Function — AI tutor + question/flashcard generation
    notify/index.ts               # Deno Edge Function — Expo push for course announcements + group replies
src/
  lib/
    supabase.ts                 # Supabase client (reads EXPO_PUBLIC_ env vars)
    teacherApi.ts                # wrappers around teacher RPCs
    adminApi.ts                  # wrappers around admin RPCs
    errorReporting.ts             # Sentry wrapper, no-op until DSN is configured
    notifications.ts              # local streak reminder + push token registration
    deepLinking.ts                 # password-reset deep link handling (PKCE code exchange)
    analytics.ts                   # PostHog wrapper, no-op until a key is configured
    feedApi.ts                    # wrappers around social feed RPCs
    referralApi.ts                 # wrapper around referral stats RPC
    purchases.ts                   # RevenueCat SDK wrapper — configure/login/purchase/restore
  types.ts                      # shared TS types matching the DB schema
  utils/validation.ts            # email/password validation + tests
  data/badges.ts                 # badge definitions — shared by Profile display + celebration logic
  hooks/useNewBadgeCelebration.ts # detects newly-earned badges, persists "seen" state
  navigation/RootNavigator.tsx  # routes to Auth, or Student/Teacher/Admin tabs by role
  context/AppContext.tsx        # session, profile, quiz, leaderboard, notification scheduling
  theme/
    tokens.ts                    # full design system: colors, type, spacing, radii, shadow, motion
    colors.ts                    # back-compat shim — old screens' `{ colors, radius }` imports
    useAppFonts.ts                # Sora/Inter loading, gates rendering until ready
  screens/
    AuthScreen.tsx              # student sign-up (+ referral code) / teacher sign-up (invite code) / log-in
    SetNewPasswordScreen.tsx     # shown when a password-reset deep link is detected
    OnboardingCarousel.tsx        # first-run 3-slide intro, shown once to signed-out users
    HomeScreen.tsx                # dark "arena" hero with the signature Pulse Ring
    QuizScreen.tsx                # per-question grading, animated progress, confetti on perfect run
    LeaderboardScreen.tsx         # top-3 podium, paginated Campus tier, staggered rows
    ProfileScreen.tsx             # role-aware; account deletion; badges; referral invite card
    social/
      FeedScreen.tsx               # department/campus feed, inline composer, optimistic likes
    teacher/
      TeacherDashboardScreen.tsx  # department engagement stats
      TeacherQuestionsScreen.tsx  # create/edit/delete own department's questions
    admin/
      AdminDashboardScreen.tsx    # platform-wide stats
      AdminDepartmentsScreen.tsx  # create departments, generate invite codes
      AdminUsersScreen.tsx        # paginated search, promote/demote roles
  components/
    StatCard.tsx
    LeaderboardRow.tsx
    LeaderboardPodium.tsx         # animated top-3 podium
    ArenaBackground.tsx           # dark gradient hero surface (Home only, by design)
    BadgeCelebrationModal.tsx     # confetti + spring pop-in for a newly-earned badge
    UpgradeModal.tsx               # paywall — real offerings, honest not-configured state
    ErrorBoundary.tsx             # reports to Sentry via errorReporting.ts
    animated/
      PulseRing.tsx                # signature circular progress ring
      AnimatedNumber.tsx           # count-up number transitions
      PressableScale.tsx           # spring scale + haptic wrapper, used app-wide
      ConfettiBurst.tsx            # from-scratch particle burst
      StreakFlame.tsx              # flicker intensity scales with streak length
      StaggerIn.tsx                 # staggered list-item entrance
      Skeleton.tsx                  # shimmer loading placeholders
```

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | UI scaffold — navigation, screens, mock data | Done |
| 2 | Real backend — Supabase auth, schema, live queries, points RPC | Done |
| 3 | Fair ranking engine — percentile normalization for Faculty/Campus boards | Done |
| 3.5 | **Production hardening** — security fixes, error handling, validation, testing, CI | Done |
| 4 | **Admin & teacher roles** — invite-gated teacher accounts, question management, admin dashboard/user management | Done |
| 4.5 | **Launch-readiness pass** — account deletion, legal docs, crash reporting, pagination, `.gitignore` | Done |
| 4.6 | **Design & motion system** — token-based visual identity, signature Pulse Ring, tactile animation throughout Home/Quiz/Leaderboard/Profile/Auth | Done |
| 5 | **Engagement** — local streak-risk reminder, push-token foundation, expanded badges with celebration | Done |
| 6 | **Growth** — referral system with vesting/shadow-flag safeguards, department/campus social feed | Done |
| 7 | **Monetization** — Pro tier (Streak Shield), RevenueCat integration, webhook — code complete, needs real store/RevenueCat accounts to go live | Done |
| 8 | **Launch polish** — real password reset, onboarding carousel, analytics, EAS/store submission groundwork — code complete; still needs real app icon art and store accounts | Done |

## What "production hardening" actually fixed

Two things in the earlier build were not safe to ship as-is. Worth knowing
about even though they're now fixed:

1. **Quiz answers were sent to the client before grading.** The original
   design fetched an entire quiz (including `correct_index`) up front so it
   could show instant feedback locally. That's trivially interceptable —
   anyone could read the network response and see every answer before
   picking one. Fixed by (a) exposing a `quiz_questions_public` view that
   omits `correct_index` entirely, and (b) redesigning grading to happen one
   question at a time via a server-side RPC (`submit_single_answer`), which
   only reveals the answer for the question just submitted, after the
   student has already committed to a choice.
2. **The original points RPC could be farmed by resubmitting.** It counted
   every answer in a resubmitted payload toward points, even ones already
   graded. Fixed by making grading idempotent per question — a repeat
   submission returns the original result and pays out zero additional
   points, enforced by a unique `(profile_id, question_id)` constraint.

Beyond those two, this pass also added:
- **Real input validation** (email format, password strength) instead of
  relying only on UI affordances — see `src/utils/validation.ts` and its tests.
- **Actual error states everywhere**, not silent `console.warn`s — network
  failures, RLS violations, and RPC errors now surface a message and a retry
  button in the UI (Home/Quiz/Leaderboard/Auth all handle this).
- **An app-wide error boundary** (`src/components/ErrorBoundary.tsx`) so an
  unexpected render error shows a recovery screen instead of a blank white
  screen — swap the `console.error` in there for a real crash reporter
  (Sentry, Bugsnag) before shipping.
- **Retry-safe sign-up**: profile creation uses `upsert` instead of `insert`,
  so a dropped connection mid-signup can be safely retried without a
  duplicate-key error.
- **Forgot-password flow** via Supabase's built-in reset email.
- **Resumable quizzes**: if a student closes the app mid-quiz, they resume
  on the next unanswered question instead of losing progress or re-answering
  graded questions.
- **DB indexes and constraints** that the MVP schema didn't have (see
  `supabase/004_production_hardening.sql`) — without these, query performance
  degrades badly past a few hundred rows, and bad data (e.g. `correct_index`
  outside the options array) could otherwise slip in.
- **A CI pipeline** (`.github/workflows/ci.yml`) that runs typecheck + tests
  on every push, plus a starter test suite (`npm test`) covering validation
  logic and one component render.
- **EAS build config** (`eas.json`) with development/preview/production
  profiles, and version/build-number fields in `app.json` that a real store
  submission requires.

## Known limitations still worth addressing before a public launch

Being direct about what's *not* done, rather than implying full production
polish everywhere:

- **No app icon/splash image assets** — `app.json` references only a
  background color. This needs real brand design work (a logo, icon set,
  splash screen) — something a designer needs to produce, not something
  that can be generated from a code-only pass. You'll need this before App
  Store/Play Store submission.
- **Payment processing is built but not live** — the RevenueCat integration,
  webhook, and paywall UI are complete and correct, but purchases won't
  actually work until you create the App Store Connect / Google Play
  Console / RevenueCat accounts and configure them — see "Monetization"
  above for the exact steps. There's also no exam-mode product or
  sponsored-quiz billing yet (from the original business plan) — only the
  general Pro tier.
- **`react-native-purchases` needs an EAS development build to test** —
  like Sentry, it includes native code Expo Go doesn't ship. `expo start` +
  Expo Go can't show real purchases; use `eas build --profile development`.
- **No security audit** — this codebase has had a careful pass for the
  specific issues found (answer leakage, point farming, role
  self-escalation, missing account deletion), but a $1M-stakes launch
  should still get an independent security review before handling real
  student data at scale, not rely solely on one pass.
- **Leaderboard refetches on every point change** rather than being
  debounced or realtime — fine at small-to-medium scale (thousands of
  users), worth revisiting with Supabase Realtime subscriptions if you see
  it in production load testing.
- **No rate limiting beyond Supabase's defaults** on auth endpoints or
  invite-code redemption attempts — review Supabase's auth rate limits, and
  consider adding your own (e.g. via a Supabase Edge Function or
  Cloudflare) before a large public launch.
- **No automated database backups/monitoring configured** — set up
  Supabase's backup and alerting settings before you have real user data at
  stake; this is a dashboard setting, not code, but easy to forget.
- **Manual daily quiz publishing for departments without an active
  teacher** — a teacher must sign up and publish; there's no fallback
  content pipeline for a department with no teacher yet.
- **Difficulty is normalized by department percentile, not by actual question
  difficulty** — a reasonable first-pass fairness model, not a perfect one
  (see the note in the Phase 3 section below).
- **Invite codes never expire** and there's no admin UI to revoke an unused
  one — fine at small scale, worth adding before a large rollout.
- **No audit log of admin actions** (role changes, department creation) —
  worth adding if you'll have more than one or two trusted admins.
- **No device/IP-level referral fraud detection** — only the vesting delay
  and shadow-flag threshold are implemented (see "Referral system" above).
  A sufficiently motivated bad actor with patience (real accounts, spread
  over real days) could still work around vesting; that's a harder problem
  needing real fraud infrastructure, not a gap in this pass specifically.
- **Referral bonus (100 points) and shadow-flag threshold (20 referrals)
  are hardcoded**, not admin-configurable — fine to start, worth surfacing
  in the Admin app if referral volume becomes significant enough to need
  tuning.
- **No content moderation on the social feed** — any student/teacher can
  post anything within length limits; there's no reporting mechanism,
  profanity filter, or admin moderation queue yet. Worth prioritizing
  before a large rollout, given it's user-generated content visible to
  potentially the whole campus.
- **Password reset deep linking needs real end-to-end testing before
  launch** — the code follows the documented Supabase + PKCE pattern
  correctly, but this is exactly the kind of flow (email client → OS deep
  link → app cold/warm start → code exchange) that's easy to get subtly
  wrong in a way that only surfaces on a real device with a real email
  provider, not in a code review. Test it for real, on both platforms,
  before shipping.
- **Analytics events are instrumented but nothing consumes them yet** — no
  PostHog dashboards, funnels, or alerts have been built; the tracking
  calls exist so that work is possible once you decide what you actually
  want to measure, not because dashboards were built and I'm just not
  mentioning them.
- **Onboarding is unconditionally shown once per device, not per-account**
  — the "seen it" flag lives in `AsyncStorage`, not the database, so
  reinstalling the app (or a new device) shows it again even for an
  existing user. This is a deliberate simplicity trade-off, not an
  oversight — treat it as low priority to fix.
- **Server-sent push notifications aren't built** — the app captures and
  stores device push tokens (`013_push_tokens.sql`), but there's no Edge
  Function or admin UI to actually send one yet (e.g. a teacher announcement
  pushed to their department). Only the local, on-device streak reminder
  works today — see the "Notifications" section above for the distinction.
- **Native package versions were hand-written, not machine-verified** — the
  Reanimated/SVG/gradient/haptics/font versions in `package.json` are
  correct for Expo SDK 57 as of when this was written, but Expo SDK
  compatibility shifts over time. Run `npx expo install --fix` after
  cloning (see "Run it" below) to reconcile them against whatever SDK
  version is current when you actually set this up.
- **Legal documents are drafts** — see the "Legal documents" section above;
  they need real legal review before you publish them anywhere.

## How the fairness model works (Phase 3)

Run `supabase/002_normalized_leaderboard.sql` after the base schema. It adds a
`leaderboard_normalized` view that ranks each student by their **percentile
within their own department** (0 = bottom of dept., 1 = top of dept.), using
Postgres's `percent_rank()` window function.

- **Department board** still sorts by raw points — that comparison is already
  apples-to-apples, since everyone there took the same quizzes.
- **Faculty and Campus boards** sort by that department percentile instead of
  raw points, so a top performer in a "harder" department isn't structurally
  outranked by an average performer in an "easier" one. The app shows this as
  a "Top X% of dept." chip next to each name on those two tiers.

This is a reasonable first-pass fairness model, not a perfect one — a few
known limitations worth knowing about before you scale:
- Small departments (few students) produce noisy percentiles; the view treats
  a department of one student as automatically top-of-department, which is a
  simplification, not a real fairness guarantee.
- It compares students only to peers in their *own* department, not to
  question-level difficulty directly. If you want true difficulty-adjusted
  scoring (e.g. IRT-style item difficulty), that's a larger step — happy to
  scope that out separately if it becomes a priority.

## Notes

Each phase's SQL lives as its own numbered file in `supabase/` (e.g.
`002_normalized_leaderboard.sql`) so you can see exactly what changed and
re-run migrations in order on a fresh project.
