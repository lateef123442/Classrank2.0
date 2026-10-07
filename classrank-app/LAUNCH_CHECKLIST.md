# Launch Readiness Checklist

Everything below is pulled from honest notes scattered throughout this
codebase — SQL migration comments, README "Known limitations" sections,
and code comments — consolidated into one prioritized list instead of
something you'd have to piece together by reading every file. Nothing here
is new information; it's the same gaps, organized so you can actually act
on them.

**P0 = blocking.** Don't submit to an app store or onboard real users
without these. **P1 = fix before scaling past a pilot.** Fine for a small
initial cohort, risky at real volume. **P2 = genuinely optional,** worth
knowing about, not worth delaying launch for.

---

## P0 — Blocking

### Infrastructure & accounts
- [ ] Create your production Supabase project and run all migrations
      `001` through `016` **in numbered order** (see README "1. Create your
      Supabase project" for the exact list — a few files are required, not
      optional, because earlier versions leak quiz answers or allow role
      self-escalation without them).
- [ ] Add `classrank://reset-password` to Supabase's redirect URL
      allow-list (Authentication → URL Configuration). Password reset is
      silently broken without this.
- [ ] Sign up once in the app, then run `010_bootstrap_first_admin.sql`
      with your real email to create your first admin account.
- [ ] Replace every `REPLACE_WITH_...` placeholder still in the codebase:
      `app.json` (EAS project ID), `eas.json` (Apple ID, ASC app ID, Apple
      Team ID), `src/lib/notifications.ts` (EAS project ID, mirrors
      app.json), `STORE_LISTING.md` (support email, privacy policy URL).
      Run `grep -rn "REPLACE_WITH" .` from the project root to find any
      that were added after this checklist was written.
- [ ] Turn off "Confirm email" in Supabase Auth settings for testing, or
      verify your email templates/sender are configured correctly if
      keeping it on for production.

### Legal & compliance
- [ ] Have an actual lawyer review `legal/PRIVACY_POLICY.md` and
      `legal/TERMS_OF_SERVICE.md` — they're substantive drafts, not
      placeholders, but they are not legal advice and weren't written by
      one.
- [ ] Fill in the bracketed placeholders in both (contact emails,
      governing law jurisdiction, dates).
- [ ] Host both documents at a public URL — **both app stores require a
      live Privacy Policy URL before they'll even review your app.**
- [ ] Decide your actual answer to the age-rating questionnaire's
      user-generated-content question honestly, given the social feed has
      no moderation yet (see P1).

### Design assets
- [ ] Commission or create a real app icon (1024×1024) and splash screen.
      `app.json` currently only specifies a background color — this is a
      design task, not something further code can produce.
- [ ] Take real screenshots from a running build for both stores (see the
      checklist in `STORE_LISTING.md` for suggested shots).

### Quality gate
- [ ] **Run this app on a real device, both platforms, before anything
      else on this list matters.** Every line of this codebase type-checks
      correctly, but it has never once been executed — I have no way to
      verify runtime behavior, animation feel, or platform-specific quirks
      from where I work. This is the single highest-leverage thing left.
- [ ] Test the password-reset flow specifically, end to end, on a real
      device with a real email provider — it's the flow most likely to
      have a subtle bug that only shows up outside a code review.
- [ ] If launching with Pro subscriptions: complete all 7 steps in the
      README's "Monetization" section (Apple Developer + Google Play +
      RevenueCat accounts, webhook deployment, EAS dev build for testing).
      Alternative: launch without monetization first (the app works fully
      as a free product) and add Pro later once you have real usage data
      to justify the setup cost.

---

## P1 — Before scaling past a pilot

- [ ] **Independent security review.** This codebase has had a careful,
      deliberate pass for the specific issues that were found and fixed
      (quiz-answer leakage, point farming, role self-escalation, missing
      account deletion) — but a single pass by one reviewer (however
      careful) is not a substitute for independent review once real
      student data and real money are at stake.
- [ ] Configure Supabase's automated database backups and alerting
      (dashboard settings, not code — easy to forget specifically because
      it's not a code change).
- [ ] Review Supabase's default auth rate limits; add your own layer
      (Cloudflare, a rate-limiting Edge Function) if you expect meaningful
      signup/login volume.
- [ ] Set a real `EXPO_PUBLIC_SENTRY_DSN` and confirm crash reports are
      actually arriving — the integration is built but inert without this.
- [ ] Set a real `EXPO_PUBLIC_POSTHOG_API_KEY` and build actual dashboards
      /funnels — events are instrumented (signup, quiz completion, badges,
      posts, referrals, purchases) but nothing currently consumes them.
- [ ] Build a basic content-moderation mechanism for the social feed
      (report button, admin review queue) before a large rollout — it's
      user-generated content potentially visible campus-wide with zero
      moderation today.
- [ ] Add a fallback content pipeline for departments with no active
      teacher — right now a department with no teacher simply has no quiz.
- [ ] Add invite-code expiration and an admin UI to revoke unused codes.
- [ ] Add an audit log for admin actions (role changes, department
      creation) if you'll have more than one or two trusted admins.
- [ ] Revisit the referral shadow-flag threshold (currently a hardcoded
      >20-vested-referrals guess) once you have real referral volume data
      to tune it against.
- [ ] Watch leaderboard query performance under real load; the
      materialized-view approach in
      `supabase/OPTIONAL_scaling_leaderboard.sql` is ready if the live
      percentile computation becomes a bottleneck.

---

## P2 — Optional, worth knowing about

- [ ] No device/IP-level fraud detection on referrals — only the
      multi-day vesting delay and shadow-flag threshold are implemented.
      Real fraud infrastructure (Cloudflare Turnstile, a dedicated fraud
      service) is a bigger project than this pass could cover.
- [ ] No end-to-end test suite (Detox/Maestro) — current test coverage is
      unit-level (validation logic, badge logic, one component render).
- [ ] No SQL/migration testing framework (e.g. pgTAP) — the 16 migration
      files have been reviewed carefully but never executed against a real
      Postgres instance from this environment.
- [ ] No internationalization — all strings are hardcoded English.
      Worth planning for if you expect non-English-speaking campuses,
      but a significant mechanical effort (externalizing strings across
      ~25 screens/components) not worth doing speculatively.
- [ ] No dedicated accessibility audit (VoiceOver/TalkBack testing,
      color contrast verification, Dynamic Type support) — some
      accessibility props exist on high-traffic screens (Auth, Quiz,
      Leaderboard) but this hasn't been systematically verified.
- [ ] No exam-mode premium product or sponsored-quiz billing from the
      original business plan — only the general Pro tier (Streak Shield)
      exists.
- [ ] Server-sent push notifications (e.g. a teacher announcement pushed
      to their department) aren't built — only the local, on-device streak
      reminder works today. Push token capture exists as foundation.

---

## What this checklist is and isn't

This is a consolidation of engineering and product gaps visible from the
code and this conversation. It is **not** a substitute for your own launch
planning — go-to-market strategy, campus partnerships, support staffing,
and the business decisions in the original business plan (pricing,
positioning, campus rollout order) aren't things a checklist like this can
capture, and weren't the focus of this pass.

---

## Course file attachments (supabase/022_material_files.sql) — known limits

- [ ] Run 022 on staging first; it has never been executed against a real Supabase project.
- [ ] Orphaned files: a course's files are removed (best effort) just before the course is deleted, and a single
      material's file is removed when that material is deleted. An upload that is never registered, a failed
      cleanup, or a course removed another way (e.g. account deletion) leaves orphans. Run
      `supabase/023_orphan_file_sweep.sql`, deploy `sweep-files`, set `SWEEP_SECRET`, and schedule a daily POST
      (try `{"dryRun": true}` first). It only deletes files older than 1 hour that no material references.
- [ ] The AI tools now read uploaded files (the teacher's question drafter, and students' quiz / flashcard / practice
      generators in course rooms): redeploy `study-companion`
      (`supabase functions deploy study-companion`). It reads up to 3 files per request (the newest matching the
      topic), fetched with the caller's own login so storage rules still apply. PDFs and images go to Claude
      directly; text, Word, PowerPoint and Excel are converted to text on the server. Scanned PDFs work if Claude
      can read the pages; password-protected or corrupt files are skipped and the user is told. Not yet run
      against real files in the deployed function. Students' own subjects (not course rooms) use notes only.
      Students must open the course once after this update so file paths sync into their notes.
- [ ] No virus scanning. Mitigations in place: private bucket, 10 MB cap, MIME allow-list (no HTML/SVG/scripts/
      executables), signed links that expire in 5 minutes. Add scanning if teachers are not fully trusted.
- [ ] Files open in the phone's browser or viewer (via `Linking.openURL`), not inside the app.
