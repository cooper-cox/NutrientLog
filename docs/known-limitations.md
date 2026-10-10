# Known Limitations

A running list of what the app can't do (or doesn't do well) yet, why, and how to fix it.
Updated as milestones land. Tick a box when an item is fixed, and add new items at the bottom of
their group.

**Revisit:** *Roadmap* means it is already planned as a feature. *Quick* means a small change that
could ride along with another milestone. *Before others* means it must be fixed before anyone but
the author uses the app.

Last reviewed after: M5 (onboarding screen).

---

## A. Who the app can safely serve

- [ ] **L1. Under-18s can't create a profile.**
  - Why: the calorie formula is for adults. Growing teenagers need different, growth-based
    guidance, and weight-focused targets for minors can contribute to unhealthy eating habits.
    Age also comes from a self-entered birth date, so it can't be verified.
  - Fix: keep the block and show a friendly explanation. If we ever serve minors, build a
    separate "healthy eating" mode with no weight targets, based on pediatric references and
    reviewed by a professional, and handle parental consent and the App Store age rating.
  - Revisit: only if we decide to serve minors. Not planned. (As of M5 the survey shows the
    server's "age must be between 18 and 100" message under the birth date box.)

- [ ] **L2 (partly done). No handling of medical situations.** Pregnancy or breastfeeding, diabetes, kidney
  disease, a history of eating disorders, and some medications all change what a safe target is.
  - Why: the formulas assume a healthy adult, and there is no "not medical advice" text in the
    app yet.
  - Fix: add the disclaimer to onboarding and settings (easy), then a short screening question
    that, when answered "yes", shows a "talk to your doctor" message and turns off weight-loss
    targets.
  - **Progress (M5):** the disclaimer text is now on the survey and results screens. It is not in
    a settings screen yet (there isn't one). The screening question is still to do.
  - Revisit: screening *Before others*; disclaimer in settings when settings exist.

- [x] **L3. The sex question only offers "male" and "female".** *Fixed in M5.*
  - Why: the calorie formula has one version of its constant for each, and the calorie floor
    differs too.
  - Fix: label it "Sex (used for the calorie formula)" and add "prefer not to say", which uses the
    average of both versions, with a short explanation.
  - Done: the survey says "Sex (used for the calorie formula)" and offers "Prefer not to say"
    (average of both formulas, minimum 1,350 kcal).

- [ ] **L4. Fixed input limits** (age 18-100, height 100-250 cm, weight 30-300 kg).
  - Why: sanity rails that reject typos and absurd values.
  - Fix: review the limits against real use and widen them if people are being wrongly turned away.
  - Revisit: whenever someone hits one.

## B. Accuracy of the numbers

- [ ] **L5. The calorie target is an estimate.** The formula is typically within about 10%, the
  activity level is self-reported, and "7,700 calories per kg" is a rule of thumb. Muscle gain in
  particular doesn't follow it neatly.
  - Why: no formula can know an individual's metabolism.
  - Fix: adjust the target automatically from the real weight trend (not gaining as expected, so
    raise it).
  - Revisit: *Roadmap* (v0.4, weight tracking). This is the core fix for the original problem.

- [ ] **L6. Rate limits and calorie floors are fixed numbers** (gain at most 0.5 kg/week, lose at
  most 1.0 kg/week, floors of 1500 and 1200). They don't scale with body size.
  - Why: simple, conservative rails for the first version.
  - Fix: express the limits as a percentage of body weight and base the floor on resting
    calories. Check against published guidance before changing.
  - Revisit: low priority.

- [x] **L7. Goal weight is saved but not used.** *Fixed in M5.* Choosing "gain" with a goal weight below the
  current weight is accepted silently, and there's no "about N weeks to goal" estimate.
  - Why: it was collected for later, and no check was written.
  - Fix: validate that the goal weight agrees with the goal type (error or gentle warning) and
    estimate the time to goal from the weekly rate.
  - Done: a goal weight that points the wrong way is rejected with a message under the goal
    weight box, and the results screen shows "about N weeks" to the goal.

- [ ] **L8. The macro split is one fixed recipe** (protein 1.8 g per kg, fat 25% of calories, carbs
  the rest). Big surpluses give very high carbs (for example 472 g, about 59% of calories).
  Protein uses total body weight rather than lean mass, and there are no presets
  (vegetarian, lower-carb).
  - Why: a simple, sensible starting point that needs no extra questions.
  - Fix: let the user adjust the split, offer a few presets, and use goal weight or an estimated
    lean mass for protein.
  - Revisit: after the prototype.

- [ ] **L9. No vitamin and mineral targets yet.**
  - Why: v0.1 covers calories and macros only.
  - Fix: targets from standard reference intakes by age and sex, shown on the Nutrition screen.
  - Revisit: *Roadmap* (v0.3).

## C. Accounts, privacy, and security

- [ ] **L10. An account is a secret token on one phone.** Losing or resetting the phone,
  reinstalling the app, or clearing its data makes the account unreachable, and there's no
  second-device use.
  - Why: we skipped login for the prototype on purpose.
  - Fix: real accounts (Sign in with Apple or email) with cloud backup. A stopgap would be a
    "backup code" to export and import.
  - Revisit: *Before others* (v1.0).

- [ ] **L11. Tokens never expire and can't be revoked.** A stolen token works forever.
  - Why: the simplest possible scheme.
  - Fix: expiring, rotating tokens and a "sign out everywhere" option, which come with accounts.
  - Revisit: *Before others*, with L10.

- [ ] **L12. Local-only security setup.** The phone talks to the server over plain HTTP on your
  Wi-Fi, so anyone else on that network could in principle read it. The database also uses a
  default password (fine now because its port is only open to your own computer).
  - Why: no hosting, no HTTPS certificate, and nothing sensitive on a home network yet.
  - Fix: host on a free tier that provides HTTPS, move passwords and keys into hosting secrets,
    and never use the dev passwords outside your computer.
  - Revisit: *Before others* (hosting step).

- [ ] **L13. Anyone can create unlimited users.**
  - Why: there's no abuse protection yet. It's harmless on your home network but would let
    anyone fill a public database.
  - Fix: rate limiting, Apple's App Attest (proof the request comes from the real app), and
    accounts.
  - Revisit: *Before others* (hosting step).

- [ ] **L14. You can't export or delete your data, and there's no privacy policy.** Weight, height,
  and birth date are sensitive health information.
  - Why: not built yet. The database is already set up so deleting a user removes all their rows.
  - Fix: a delete-my-data and a download-my-data option, a privacy policy, and encryption at rest
    on the host. App Store rules and privacy laws expect all of these.
  - Revisit: *Roadmap* (v0.7), and required *Before others*.

## D. Gaps in what's built

- [ ] **L15. Saving the profile always recalculates and adds a new goal**, even if you only
  change the name or the unit preference. The target can also shift slightly just because a
  birthday or a day has passed.
  - Why: one endpoint saves the whole survey, which was the simplest design.
  - Fix: a separate settings endpoint for preferences (units, theme, notifications), and ask
    "recalculate my targets?" when editing body or goal details.
  - Revisit: *Quick* if the Settings screen comes early, otherwise v0.7.

- [ ] **L16. The timezone is saved once, with the profile.** If you travel or move, "today" won't
  follow you.
  - Why: nothing needs the live timezone yet, because food logging doesn't exist.
  - Fix: each logged entry carries the phone's local date and timezone at that moment.
  - Revisit: decide at the log-entry milestone (M8).

- [ ] **L17. Only the *current* goal can be looked up**, not "what was my goal on March 3rd?" The
  history is stored, but the lookup isn't built.
  - Why: nothing needed it yet.
  - Fix: a query for the newest goal that started on or before a given date.
  - Revisit: needed for the history charts and "goal met?" calendar (v0.4).

- [ ] **L18. Weight is just "weight at the last profile save".** No history until the weight log
  exists (each goal row keeps a snapshot of the weight it used, so some history survives).
  - Fix: the weight log, then keep the profile weight in sync with the latest entry.
  - Revisit: *Roadmap* (v0.4).

- [x] **L19. Two shapes of error message.** *Fixed in M5.* Automatic validation errors come back as a list of
  field problems, while our own checks (like "age must be between 18 and 100") come back as a
  single sentence. The app has to handle both.
  - Why: they come from different parts of the server.
  - Fix: one consistent error format that names the field, so the survey screen can show each
    message under the right box.
  - Revisit: *Quick*, best done in M5 when the survey screen needs it.
  - Done: every error now has a plain-sentence `detail`, and problems with a specific answer also
    carry `errors: [{field, message}]`, which the survey screen shows under the right box.

- [ ] **L20. CI doesn't start the whole Docker Compose setup.** It builds the Docker image but
  never runs it, so a mistake in `docker-compose.yml` would only show up on your Mac.
  - Fix: add a CI step that starts Compose, calls `/health/db`, and shuts it down. Good practice
    for your Docker and Actions goals.
  - Revisit: after the prototype.

- [ ] **L21. Database migrations run automatically every time the API container starts.**
  - Why: convenient for one local copy.
  - Fix: run migrations as a separate step in the deploy process once there is hosting, so two
    servers never try to migrate at once.
  - Revisit: *Before others* (hosting step).

- [ ] **L22. The app finds the API by borrowing the Mac's address from the Expo dev server.**
  That works for development on home Wi-Fi only (and not with `--tunnel`). A real, hosted app
  needs a fixed server address.
  - Fix: set `EXPO_PUBLIC_API_URL` per build once there is hosting.
  - Revisit: *Before others* (hosting step).

- [ ] **L23. Light mode only.** The app ignores the phone's dark mode setting.
  - Fix: add dark colors with the look-and-feel work.
  - Revisit: v0.8.

- [ ] **L24. `npm audit` reports many warnings**, all inside tools that come with Expo/React
  Native and are used only while developing, not shipped in the app.
  - Why: they are deep inside dependencies we don't control. `npm audit fix --force` can break
    the project, so we don't run it.
  - Fix: update Expo when a new version comes out and re-check.
  - Revisit: after the prototype, then at each Expo upgrade.

- [ ] **L25. The testing library is pinned to an older major version (13)** because the newest
  needs Node 22 and you have Node 20.
  - Fix: upgrade Node and the library together.
  - Revisit: after the prototype.

- [ ] **L26. Expo Go may insist on a free Expo account.** On first run, Expo Go refused to open
  the app until you were logged in to the same Expo account on both the phone and the Mac.
  - Why: a requirement of the Expo development tools, not of our code.
  - Fix: none needed for development. Note it in the README so it is not a surprise on a new
    phone or computer. A real (TestFlight/App Store) build doesn't use Expo Go.
  - Revisit: when preparing a real build.

- [ ] **L27. The birth date is three typed boxes** (month, day, year) instead of a date picker,
  and the weekly pace offers a few fixed choices (gain 0.25 or 0.5 kg; lose 0.25, 0.5 or 0.75 kg).
  - Why: typed boxes are simple, work the same everywhere and are easy to test. Fixed paces keep
    people inside the safe limits.
  - Fix: a native date picker; a free-form pace (still capped by the server).
  - Revisit: v0.7 (function polish) or v0.8 (look and feel).

- [ ] **L28. The survey is a single long scrolling form,** and nothing is saved until you press
  the button. Closing the app halfway means starting again.
  - Fix: split into a few short steps and keep a draft on the phone.
  - Revisit: v0.7.
