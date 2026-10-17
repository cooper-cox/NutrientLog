# NutrientLog: Engineering Rules (Draft 1)

Written after the M6.1 review, when the owner found that the code was over-split into tiny files, kept tunable numbers scattered at the top of modules, and that a public repo needs a security habit. These rules apply to every milestone from M6.R onward (M6.R, M6.2, M7+) and every version from v0.2. If a rule ever gets in the way, we change the rule here first, in plain words, rather than quietly ignoring it.

This file wins over older wording in `plan.md` and `v0.1-build-plan.md` where they disagree (for example, the "routes → services → repositories" rule, which is retired).

---

## 1. Simplicity: a developer must not get lost

**S1. One file per topic.** A file holds one idea completely (for example all of the user routes, or all of the food ranking). Do not create a file for under about 50 lines unless it is the only home of a real, separate idea. Split a file only when it passes roughly 300 to 400 lines and has a natural seam.

**S2. Shallow folders.** At most three levels below `backend/app/` or `mobile/src/`. A reader should find any feature in two clicks.

**S3. No layers for their own sake.** We do not add a layer, interface or folder for a future need. It is added when the second real use appears. (The food-source interface stays because there really are two sources, USDA and Open Food Facts.) The "repositories" layer is retired: database queries live next to the routes or logic that use them, unless a query is reused in three or more places.

**S4. Keep the one boundary that pays for itself: pure logic.** Calculations (calorie targets, nutrient scaling, ranking, unit conversion) stay as plain functions with no database or network calls, so they can be tested quickly and exactly.

**S5. Backend shape (as built in M6.R):**

```
backend/
  app/
    main.py          # builds the app
    settings.py      # loads .env and config.toml once, checks every value
    db.py            # database connection
    errors.py        # the one error format
    auth.py          # anonymous-user tokens and the "current user" check
    models.py        # database tables
    schemas.py       # request/response shapes (split by topic only past ~400 lines)
    routes.py        # every endpoint (split into routes/ by topic past ~400 lines)
    profiles.py      # saving the survey and working out the goal
    foods.py         # saving, finding and searching foods
    calc/            # pure functions: dates, food_check, food_rank, goals, nutrients, profile_check, units
    sources/         # __init__.py (the shared interface), usda.py, openfoodfacts.py
  config.toml
  migrations/
  tests/             # one test file per source file (unit/ mirrors app/calc and app/sources)
  scripts/           # search_check.py
```

**S6. Mobile: a feature folder holds a screen, its logic and its tests, usually 3 to 4 files.** Tiny helpers (a hook, a checks file, a save function) merge into the feature's logic file when they are used only there. Shared code lives in `src/api` and `src/lib`.

**S7. Tests mirror the code.** One test file per source file. Merge tiny test files along with the code.

**S8. Every file starts with a one-or-two-line comment saying what it is for, and the README has a short "where things live" map.** A new reader should be able to answer "where would X be?" from the README alone.

**S9. Every milestone's pull request says how many files it added or removed and why each new file exists.**

---

## 2. Configuration: three homes, no others

| What it is | Where it lives | Example |
|---|---|---|
| Secrets and per-machine values | `.env` (never committed). `.env.example` lists the names with blank or fake values. | `USDA_API_KEY`, `DATABASE_URL`, `POSTGRES_PASSWORD` |
| Tunable settings and policy numbers | `backend/config.toml` (committed, contains no secrets) | search ranking weights, page sizes, retry waits, validation limits, calorie floors, activity multipliers, quest values later |
| Formulas and science | In the code, next to the formula, named and commented with their source | 7,700 kcal per kg, Mifflin-St Jeor coefficients, ounces-to-grams |

**C1.** No tunable number sits at the top of a module. Modules read it from the settings object.

**C2.** `settings.py` loads `.env` and `config.toml` once, into one typed, validated object. A test loads the real `config.toml` and checks every value is in a sensible range, so a typo fails in CI, not in use.

**C3.** The phone never reads the TOML. Anything the phone needs (such as input limits) comes from the API (`/api/v1/limits`), so there is one source of truth.

**C4.** Formulas stay in code on purpose: moving science into a settings file invites accidental edits that quietly make calorie targets wrong.

**C5.** The search ranking weights live in `config.toml`, and `scripts/search_check.py` is the loop for tuning them.

---

## 3. Security: assume everything in the repo is read by attackers

The repo is public. Code being visible is fine: security must never depend on the code being secret. What must never be visible is anything that grants access.

**X1. Never commit:** keys, tokens, passwords (including "temporary" ones), personal data, real user data, or database dumps. `.gitignore` covers `.env`, key files and local data. Each milestone's checklist includes a quick look at what is about to be committed.

**X2. No default passwords in committed files.** `docker-compose.yml` reads `POSTGRES_PASSWORD` from `.env` and refuses to start if it is missing. `.env.example` shows a placeholder, never a real value.

**X3. Keep ports closed.** The database port stays bound to `127.0.0.1`. The API is reachable on the local network only while testing. Stop the containers when done, and do not test on public Wi-Fi.

**X4. Turn on GitHub's free protections** (public repos get them free): secret scanning with push protection, Dependabot alerts and updates, and CodeQL code scanning. Add a secret-scan step (gitleaks) to CI so a leaked key fails the build.

**X5. Logs and errors never contain secrets.** Keys go in headers, never URLs. Error details kept for developers (such as `FoodSourceError.detail`) never include keys, tokens or personal data.

**X6. Every user-data endpoint is checked for ownership.** Queries always filter by the signed-in user. Each new endpoint that returns user data gets a test that user A cannot read or change user B's data.

**X7. Every input has limits.** Text lengths, page numbers, list sizes and numeric ranges are validated at the edge, and returned errors say what is wrong without exposing internals.

**X8. Dependencies are kept few and current.** Adding one needs a reason in the pull request. Dependabot keeps them updated.

**X9. Per-milestone security check.** Each pull request answers: does this add an endpoint (who may call it, what is validated)? does it store anything new about a person? does it log or return anything sensitive? Any "yes" is written down.

**X10. A hard gate before anyone else uses the app (new version v0.9, Hardening, before v1.0):** HTTPS hosting; real accounts with expiring tokens (L10, L11); secrets in the host's secret store (L12); rate limiting and abuse protection (L13); data export and deletion plus a privacy policy (L14); migrations as a separate deploy step (L21); a fixed server address (L22); the medical screening question (L2); a review of the body-size limits (L29). v1.0 does not start until all are done.

---

## 4. How the rules are enforced

- **Automatic where cheap:** the config test, gitleaks, CodeQL, Dependabot, and a CI step that starts Docker Compose and checks `/health/db` (this also closes L20).
- **A checklist in every pull request** for the rest: simplicity (S9), configuration (no tunable numbers at the top of files), security (X9).
- **I (Claude) check each delivery against these rules before handing it over**, and say plainly in the delivery message if I had to break one and why.

## 5. How we work (to avoid stalled sessions)

- Small deliverables: one change set per zip, each independently useful.
- Progress and decisions are saved to the Project docs as we go, so a cut-off session can be resumed from the docs.
- Behaviour-preserving refactors (M6.R) change no behaviour: the same tests, run before and after, give the same results, and the search report is compared before and after.
