# Known Limitations

A running list of what the app can't do (or doesn't do well) yet, why, and how to fix it.
Updated as milestones land. Tick a box when an item is fixed, and add new items at the bottom of
their group.

**Revisit:** *Roadmap* means it is already planned as a feature. *Quick* means a small change that
could ride along with another milestone. *Before others* means it must be fixed before anyone but
the author uses the app.

Last reviewed after: the amount wheel.

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
  - **Progress (M5.1):** goal weights are now checked too (30-300 kg, no lower than a BMI of 18.5
    when losing, no higher than a BMI of 45 when gaining), and a height and weight that can't both
    be right (BMI under 14 or over 80) are rejected. All problems are shown at once, worded in the
    person's units. The numbers live on the server and the app fetches them (`/api/v1/limits`).
  - Fix: review the limits against real use and widen them if people are being wrongly turned away.
  - Also (M5.2): the limits are shown as tidy numbers (70 to 660 lb, 3 ft 6 in to 8 ft) that sit
    just inside the real limits, so typing any number shown is always accepted. Number boxes
    now have a length limit and ignore letters.
  - Revisit: whenever someone hits one. See also L29.

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
    lean mass for protein. Better still, choose the split from the person's training focus (see
    L30 and L31 and the personalization roadmap in the plan).
  - Note (M5 phone test): 425 g of carbs felt like a lot. The arithmetic is right (about 56% of a
    3,034-calorie target, which is normal for someone gaining weight and training), but one
    recipe can't suit a lifter, a runner and an office worker.
  - Revisit: after the prototype; it needs the training-focus question first.

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

- [x] **L20. CI doesn't start the whole Docker Compose setup.** Closed in M6.R: a CI job now starts
  Compose, calls `/health/db`, and shuts it down.

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
  - Fix: a native date picker; a free-form pace, typed in lb or kg per week (still capped by the
    server, with a clear message when it is capped). Requested after the M5 phone test.
    A "reach my goal in N weeks" input was also suggested. It is only safe if the pace it implies
    is checked against the same caps (and then it is the same thing as choosing a pace), so a
    pace input with a "this would take about N weeks" readout is the better design.
  - Revisit: v0.7 (function polish) or v0.8 (look and feel).

- [ ] **L28. The survey is a single long scrolling form,** and nothing is saved until you press
  the button. Closing the app halfway means starting again.
  - Fix: split into a few short steps and keep a draft on the phone.
  - Revisit: v0.7.

## D. Personalization (from the M5 phone test)

The goal is a plan that fits each person: their body, their goal, how and why they train, and
their job. Today's survey is a deliberately simple first version. These items, together with the
"Personalization roadmap" in `docs/plan.md`, describe how it grows.

- [ ] **L29. The body-size limits are judgement calls, not medical facts.** The limits in L4
  (BMI 14-80 for height and weight together, goal weights no lower than BMI 18.5 when losing and
  no higher than BMI 45 when gaining) are meant to catch typos and clearly unsafe goals. BMI is a
  crude measure: very muscular people score high, and it ignores build and age.
  - Why: some limit is needed, and these are conservative starting points.
  - Fix: review the numbers with a qualified professional, and consider measures other than BMI.
  - Revisit: *Before others*.

- [ ] **L30. The activity question ignores workout intensity and duration.** "3-5 workouts a week"
  can mean a 20-minute all-out session or a 40-minute one with long rests, and these burn very
  different amounts.
  - Why: one multiplier per activity level is the simplest honest starting point.
  - Fix: ask about typical duration and intensity, and estimate calories burned per workout
    (MET values) instead of using one multiplier. Take care not to count workouts twice once
    "eat back workout calories" exists.
  - Revisit: *Roadmap* (v0.5, workouts). A simple version of the question could come sooner.

- [ ] **L31. The survey doesn't ask what kind of training someone does, what physique they want,
  or what their job demands.** A lifter, a swimmer, a baseball player, and someone doing hard
  manual labour need different calories, macros and nutrients, and "gain weight" can mean muscle
  or just mass.
  - Why: each extra question needs evidence-based targets behind it, and we don't have those yet.
  - Fix: a "training focus" question (for example build muscle, lose fat, endurance, general
    health, a named sport, physical job), with per-focus macro presets and nutrient priorities
    taken from published sports-nutrition guidance, ideally reviewed by a professional. The app
    can support a goal, but it should never promise a particular body.
  - Revisit: *Roadmap* (see the plan's personalization section).

- [ ] **L32. The wording of the survey checks is written twice**, once on the server and once in
  the app (so the app can show problems as people type). The numbers come from the server, and a
  shared file of test cases (`shared/profile_check_cases.json`) makes both sides' tests fail if
  the answers or wording drift apart.
  - Why: the app needs instant feedback without a round trip.
  - Fix: if it becomes a burden, have the server return structured problem codes and let the
    app word them.
  - Revisit: only if the two sides keep drifting.

- [ ] **L33. Scrolling to the first problem is only checked by hand.** The automated tests don't
  simulate scrolling.
  - Fix: add a UI test with a real scroll view, or an end-to-end test on a simulator.
  - Revisit: when end-to-end tests are added.

- [ ] **L34. Number boxes are plain text boxes with a number keyboard.** A spinner or slider
  can be quicker for rough values, but is slow and imprecise for exact ones such as 182.5 lb.
  - Fix: keep text boxes for weight and height. Consider a spinner or stepper for small bounded
    choices (weekly pace, birth year) in the v0.8 look-and-feel pass, and always keep typing as
    an option.
  - Revisit: v0.8.

## E. Added with M6 (foods)

- [ ] **L35. The USDA lookup has not been run against the real USDA service.** The mapping was
  written from USDA's documentation and tested with sample replies shaped like it. The build
  environment cannot reach the internet, so the first real search happens on your computer.
  - Fix: with a free key in `.env`, search "banana" and "clif bar" at `/docs` and check the
    calories look right (about 89 and 380 per 100 g). Anything off is a small mapping fix.
  - Revisit: at the start of M7.

- [ ] **L36. Saved foods can't be edited or deleted yet**, and nothing is shared between people.
  - Fix: edit/delete saved foods (planned with the "manage saved foods" screen), and a shared
    pool of foods once there is a reason for one.
  - Revisit: v0.2.

- [ ] **L37. Saved-food search is a plain "contains the words" match** (no spelling tolerance,
  no ranking by how often you eat something). It is fast enough for one person's foods.
  - Fix: Postgres text search or trigram matching, plus recents and favorites.
  - Revisit: when a person has hundreds of saved foods.

- [ ] **L38. The free USDA key has a request limit** (about 1,000 an hour). Searches over the
  limit show a "busy" message and still return saved foods.
  - Fix: cache recent searches, or save popular foods locally.
  - Revisit: only if it is ever hit.

- [ ] **L39. USDA branded foods with unusual serving data** (millilitres, odd units) get no
  serving shortcut, only grams. Nutrients USDA reports in a form we can't read are left unknown.
  - Fix: a density table, or Open Food Facts as a second source.
  - Revisit: M7 phone test.

- [ ] **L40. Search results show nutrition per 100 g only**, which makes a 260-calorie bar look like 382. 
  - Fix: done in M6.1 (each serving carries its own nutrition); M7 shows it first. Foods with
    no serving still show per 100 g until M6.2 adds measures.
  - Revisit: M6.2.

- [ ] **L41. Only grams, ounces (weight) and named servings convert today.** Cups, spoons and millilitres need each food's density.
  - Fix: M6.2 (plan section 15.3).
  - Revisit: M6.2.

- [ ] **L42. Open Food Facts data is community-made**, so quality varies (typos, wrong serving
  sizes, calories per serving typed as per 100 g). The first report showed it works when asked
  gently; it failed when asked too fast. It is now a fallback source, limited to US products.
  - Fix: the calorie cross-check ranks suspicious entries lower; a "report a wrong food" button
    and per-food corrections come later.
  - Update (third report): Open Food Facts itself was unavailable ("Page temporarily unavailable",
    HTTP 503) for about 8 of 17 searches asked. Searches then show only USDA results, and the
    exact packaged product (for example the 68 g Clif Crunchy Peanut Butter bar) can be missing.
    It is now retried twice and then left alone for 60 seconds. A saved copy of earlier answers
    would help, and so would saving a food you pick (see L36 and L38).
  - Revisit: after the next search report.

- [ ] **L43. The ranking weights are first guesses.** They are tested on made-up examples
  (`test_food_rank.py`), not yet on real results.
  - Fix: tune from the real search report, then keep the 40 searches as a regression check.
  - Revisit: M6.1 testing.

- [ ] **L44. Searches ask up to three services per typed phrase** (USDA twice when it finds few
  matches, plus Open Food Facts), so a search can take a second or two, and Open Food Facts
  limits heavy use.
  - Fix: cache recent searches; search as the person pauses typing rather than on every key.
  - Revisit: M7 phone test.

- [ ] **L45. Plain foods have no named serving yet.** "Bananas, raw" shows only per 100 g
  because USDA keeps portions such as "1 medium (118 g)" in a separate record.
  - Fix: M6.2 reads those portions (and derives density for cups and spoons).
  - Revisit: M6.2.

- [ ] **L46. Misspellings are only partly handled.** Half-typed words ("banan") and one-letter
  typos ("chiken") are matched when the database returns the food at all, but USDA does not
  tolerate typos itself, so a badly misspelt word can find nothing.
  - Fix: a spelling-suggestion step (a word list built from foods seen), or a search service that
    tolerates typos.
  - Revisit: M7 phone test.

- [ ] **L47. Among many similar branded foods the "most popular" one cannot be known.** Typing
  "oreo" lists Oreo cheesecake and muffins ahead of the cookie, because nothing says which
  people actually eat.
  - Fix: your own recents and favourites first (planned), then Open Food Facts' scan counts.
  - Revisit: M7 (recents).

## F. Added with the amount wheel

- [ ] **L48. Rough sizes are estimates built from one set of cup sizes.** A "small bowl" is half a
  cup of the food and a "large plate" 3.5 cups, whatever the food is. A bowl of cereal, soup and
  yogurt really differ, and people's bowls differ. Bowls and plates only appear when the food's
  weight per cup is known (from USDA's own measures or a short list of plain foods); other foods
  get "small portion" and "large portion" (half and one and a half times their serving).
  - Why: one honest, adjustable rule beats invented per-food numbers.
  - Fix: sizes per food group (cereal, soup, pasta, yogurt); "my bowl" calibration (weigh your
    bowl once, and "small bowl" means yours); show the estimate in the log so it is clear which
    entries were guesses.
  - Revisit: after the prototype, with the personalization work.
