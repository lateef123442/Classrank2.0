# Study companion — build status

Core loop: **Plan → Study → Practice → Measure → Weakness → Review → Practice again.**
All study data is local-first (`src/lib/studyStore.ts`, same storage key as before; old saves upgrade automatically).
Derived logic (strength, streaks, recommender, schedule suggester) is pure and unit-tested: `src/lib/studyInsights.ts`.

## Done (Phase 1 + part of 2)
- **Home**: time-of-day greeting, minutes planned/done ring, study streak, weakest topic, recommendation with steps.
- **Learn tab / Subject Rooms**: topics, notes, questions (manual + AI-generated), exam date, jump to practice.
- **Practice tab**: Quick, Topic, Subject, Mock (timed, navigable), Daily Challenge; explanations; post-quiz analysis
  (went well / struggled / revise / next action); history + trend. Ranked department quiz kept as-is.
- **Planner**: 7-day view, reschedule, missed sessions, "Suggest my week".
- **Spaced review of topics**: quiz results schedule topic reviews (1→3→7→14→30 days; struggling = tomorrow).
- **Notifications**: session-start, missed-session, daily challenge, review prompts; per-type toggles + quiet hours.
- **Focus tab**: custom duration, break length + auto-break, today/week stats.
- **Progress**: subject + topic performance, improvement chart, accuracy, XP/level, achievements.
- **Profile**: goals, preferred study time, daily minutes, notification settings, achievements.
- **AI**: tutor now sees weak topics/due reviews; can receive prefilled prompts from quiz results; question generation via Edge Function.

## Phase 2 additions
- **Spaced Review mode** (Practice tab): quizzes you on topics that are due or that you're struggling with; the recommender sends you here when reviews are due.
- **Flashcards**: linked to topics; AI generation from a topic/your notes; "Save missed questions as flashcards" after a quiz;
  rating buttons preview the next interval (Again <1d, Good 3d, …); per-subject review filter. Flashcard ratings now also feed topic strength.
- **AI companion tools** (one tap, written into your own library): generate quiz, make flashcards, plan my week, find my gaps (computed locally, works offline).
  Follow-up chips keep the hint-first flow going (Give me a hint / Explain simpler / Quiz me on this).
- **Analytics**: weekly activity chart, per-subject trend (latest 3 quizzes vs the 3 before), knowledge-gaps list.

## Motion & polish
All built on the existing Reanimated setup and `motion` presets; everything decorative respects the phone's **Reduce Motion** setting.
- **Launch**: animated brand splash (ring draws, mark springs in, tagline rises, fades out) that continues from the native splash (same `#10162C`);
  branded bouncing-dots loader replaces the bare spinner while the session restores.
- **Navigation**: slide-from-right pushes, fade for Auth, bottom-sheet slide for the AI tutor, fade-up for quizzes (swipe-back disabled mid-quiz so
  answers can't be thrown away by accident; the Exit button asks first), springing tab icons.
- **Loading**: skeleton placeholders on Courses, Groups, course/group detail and teacher screens; typing dots in the tutor; "writing your questions/cards" loaders.
- **Quiz**: wrong answers shake + error haptic, right answers pop + success haptic, each question and explanation rises in; results show an animated
  score ring with count-up, confetti at 80%+, staggered insight cards, and an achievement-unlocked toast.
- **Flashcards**: real 3D flip (tap the card or "Show answer"); new card rises in.
- **Focus**: breathing timer and break countdown.
- **Everywhere**: progress bars glide to their value; lists stagger in (Learn, Practice modes, Courses, Groups); Home announcement card fades in.
- New files: `src/components/animated/{AppSplash,Loader,Reveal,FlipCard,AnswerFeedback,TabIcon,Breathing,AchievementToast,useMotionOK}`.
- Tuning: durations live in each component; shared springs in `theme/tokens.ts → motion`. Not verified on a device — check performance on a low-end Android.

## Fixes to existing code (found by whole-project type-check)
- `type.bodySemibold`, `type.bodyBold` and `colors.navy` were referenced by Auth, Feed, Leaderboard, Profile, UpgradeModal and others but
  never defined in `theme/tokens.ts`. `type.bodySemibold.fontFamily` throws at import time, so those screens would crash on load, and
  `colors.navy` left buttons/titles with no color. Added the three tokens (same values the legacy shim already used).
- `PressableScale` now accepts no children (the teacher question editor uses it as an empty radio button); `ConfettiBurst` no longer
  spreads `key` into JSX (React warning).

## Audit pass (Phases 1 + 2)
Fixed after a line-by-line review: schedule suggester could propose sessions in the past or past midnight; Topic Quiz with no topic
picked returned unrelated questions; Subject/Mock "All" silently became mixed quizzes; Focus ignored the subject/note you came from
("Study this note" now loads it, recommendations preselect the subject); saved data could be overwritten if a write beat the initial
load (store now loads eagerly, before any screen renders); reminder sync no longer re-renders the tab navigator; new students are nudged
to set up goals/study times; Setup warns when system notifications are off; unused imports removed.
Second pass: type-checked every new/edited screen against stubbed external packages (my own modules, tokens and context fully typed) — no errors in the new code.
Verified without running the app: strict + noUnusedLocals on the logic layer, every cross-file import resolves, every touched file parses.

## Phase 3 (social + institutional) — `supabase/017_courses_and_groups.sql`
Same security model as 006/007/015: RLS for reads, role-checked `security definer` RPCs for every write.
- **Courses**: teachers (own department) and admins create courses; students join with a code. Teachers publish study materials
  (note / link / video), 4-option practice questions with explanations, announcements, and exam dates.
- **Sync into the study loop**: joining builds a Subject Room (topics, notes, questions, exam date → planner/recommendations).
  Re-opening the course refreshes it; edits and deletions by the teacher flow through; the student's own content is never touched.
- **Teacher analytics**: class accuracy, active students, hardest questions, weak topics, per-student accuracy — from students'
  practice answers on course questions (students are told on join; leaving a course stops reporting).
- **Study groups**: join codes, discussions / questions / resources with replies, owner/author/admin moderation, focus-time challenges
  with standings (minutes are self-reported from the student's own focus log).
- **Admin**: Courses tab lists every course and can open/moderate/delete any.
- **Announcements**: the latest teacher announcement (last 14 days) shows on Home and opens the course.
- **Entry points**: Home "Community" tile, Profile link, teacher & admin "Courses" tabs.

### Added after Phase 3
- **Group quizzes** (`supabase/018_group_quizzes.sql`): any member shares a quiz built from their own practice questions; members take it once,
  exam-style; **graded on the server** (the quiz is delivered without answers, so the ranking can't be cheated by reading the network response);
  ranking by score then time; answers + explanations unlock after you submit.
- **Teachers**: AI-drafted questions shown for review (nothing is published until the teacher taps Publish) and bulk paste import
  (`Q:` / `A)`–`D)` / `Answer:` / optional `Why:` `Topic:`), with per-question error messages.
- **Fixed leftovers**: the streak reminder now honours quiet hours; review sessions are sized per topic (3 questions for a fresh topic, 5 once matured, max 15).

### Push notifications + shared-phone safety (`019_push_notifications.sql`, `functions/notify`)
- **Push**: a teacher's announcement or exam date goes to every enrolled student; a group reply goes to the post's author and earlier repliers.
  Tapping the notification opens that course or group (also from a cold start). Each event is pushed **at most once** (atomic `notified_at`
  claim), only course staff can announce, only the reply's author can trigger a reply push, and tokens are only ever read server-side.
- **Opt-out**: Study setup → "Class announcements & replies". Off removes this phone's token; registration now happens under that
  toggle instead of unconditionally at login.
- **Shared / handed-down phone fixes** (found while building this): sign-out now detaches the push token and cancels that user's scheduled
  reminders; a token moves with the device if a different account registers it; **study data is now stored per account**
  (it used to be one shared slot, so a second student on the same phone would have seen the first's notes and history). Existing data
  is adopted once by the first account that signs in. Deleting an account wipes its on-device study data.
- **Setup required**: set your real EAS project id in `app.json → extra.eas.projectId` (currently the placeholder) or devices cannot get a token;
  push needs a real device + a development/production build (not Expo Go on recent SDKs). Push ignores quiet hours (the phone shows it on arrival).

### Cloud backup (`020_study_sync.sql`, `lib/studySync.ts`, `lib/studyMerge.ts`)
- Each student's notes, questions, quiz history, flashcards, plans and settings are backed up to their own private row (only they can read it;
  no table access, RPC-only). A new or reinstalled phone **restores everything** on first sign-in. The app stays offline-first: edits are
  pushed a few seconds after you stop, when the app goes to the background, and once more just before sign-out.
- **Two phones**: writes use a revision number; if another device got there first, the app pulls, **merges on the device**, and pushes.
  Merge rules are deterministic and symmetric (`merge(a,b) ≡ merge(b,a)`) so devices converge instead of ping-ponging. Known limit: an item
  deleted on one phone can reappear if the other phone still has it; a rescheduled session / moved exam date resolves to the later one.
- Status + "Back up now" live in Study setup → Cloud backup. If migration 020 isn't applied the app says "Not available yet" and keeps working locally.
- Verified here by running the **real engine** against an in-memory fake of the SQL with two simulated phones (`scripts/verify-sync.js`, 11 scenarios:
  restore, divergence + merge, offline queueing, relaunch, per-account isolation, no spurious pushes), plus unit tests for the merge. The real
  SQL has not been executed. Size cap is 5 MB per student.

### Phase 3 not done / caveats
- A second read-through of the SQL found and fixed a real bug (`get_course_content` ordered by a column its subquery didn't select, which would have broken joining/syncing). Treat the rest as unproven until it runs.
- **The SQL has never been executed.** Run it on a staging project first. Function names/params were machine-cross-checked against the app.
- **Practice stats are self-practice, not proof.** Migration 021 makes the server grade the option a student *picked* (a client can no longer claim "correct"), skips unanswered questions and caps repeat reports, but the phone still holds the answer key for offline practice, so a determined student can pick the right option. Use exams for numbers you can rely on.
- **Timed exams (built, untested on a device):** `021_exams_and_trusted_stats.sql` adds teacher-scheduled exams (open/close window + duration), delivered without answers, server clock, one attempt, server grading, answers revealed after close, per-student and per-question results. UI: teacher **Exams** tab (`TeacherExamsPanel.tsx`: schedule from course questions, results, delete), student **Timed exams** section on the course page, and `ExamScreen.tsx` (countdown from the server deadline, auto-submit at zero, leave warning, post-close review). The close time is a hard stop: attempts still open at that moment end there. Pure logic in `examTime.ts` (7 tests, run with node only; `jest` not run). Exams don't stop a student from getting outside help. Exam dates/times are entered in the teacher's local time.
- **File upload for materials (built, untested on a device):** `022_material_files.sql` adds a private `course-files` bucket (10 MB limit, MIME allow-list: PDF, PNG/JPEG/WebP/GIF, txt/md/csv, docx/pptx/xlsx; no HTML/SVG/executables), storage policies (course staff upload/delete in their own course folder, enrolled students + staff read, no overwrite), and `staff_add_file_material` which re-checks the object in storage and records its real size/type (max 40 files per course). Teachers get **Attach a file** in the Materials tab (`TeacherFileUpload.tsx`, uses new dependency `expo-document-picker`: run `npm install`); students open files from a **Files** section on the course page through a 5-minute signed link. In the Subject Room a file shows as a pointer note. Gaps: deleting a whole course leaves its files in storage (deleting a single material removes its file); an upload that's never registered stays orphaned; the AI question drafter can't read uploaded files (they're excluded from its notes); there is no virus scanning; files open in the phone's browser/viewer, not in-app. Pure rules in `fileRules.ts` (5 tests, run with node only).
- Teachers see student names + accuracy for their own course only; consider a privacy review before launch.
- Existing department feed is unchanged (now reached through Community).

## Not done / needs your attention
- **Not run on a device or simulator, and `tsc`/`jest` were not run on the full app** (no dependencies installed where this was built).
  The pure logic (`studyInsights`) is type-checked under `strict` and its 41 tests pass. Run `npm run typecheck && npm test` first.
- **Redeploy the Edge Function** (`supabase functions deploy study-companion`) for AI question generation.
- Notification scheduling uses local notifications only; needs a real device and permission grant. Android channel config not customised.
- Videos: no dedicated video player; paste links into Notes.
- AI-generated questions/cards aren't fact-checked; the UI asks the student to skim them. Redeploy the Edge Function (new `flashcards` task).
- Analytics have no time-of-day insight (attempts store a date, not a timestamp).
- Community is still the existing feed; no study groups/group quizzes. Teacher/admin dashboards untouched — teachers can't yet publish
  practice questions into student Subject Rooms (needs a Supabase `courses`/`questions` schema first).
- Tabs: Quiz and Feed are hidden from the tab bar (still reachable from Practice / Profile).
