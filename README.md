# NutrientLog

[![Backend CI](https://github.com/cooper-cox/NutrientLog/actions/workflows/backend-ci.yml/badge.svg?branch=main)](https://github.com/cooper-cox/NutrientLog/actions/workflows/backend-ci.yml)
[![Mobile CI](https://github.com/cooper-cox/NutrientLog/actions/workflows/mobile-ci.yml/badge.svg?branch=main)](https://github.com/cooper-cox/NutrientLog/actions/workflows/mobile-ci.yml)

A nutrition-first calorie and nutrient tracker for iPhone. It tells you what your body needs and why, not just how many calories you ate.

**Status:** v0.1 in progress. Done: backend (health, users, profile, goals), the Expo app, and CI for both. M5 (the onboarding survey and results screen) is merged and M5.1 (better survey checks) is merged and M5.2 (survey check fixes) is merged. M6 (foods on the backend) is in review, with M6.1 (better food search) following it. Next: M6.2 (any-unit amounts), then M7, the add-food screen on the phone.

## Stack

- **Mobile:** React Native + Expo + TypeScript (`mobile/`)
- **Backend:** Python + FastAPI (`backend/`)
- **Database:** PostgreSQL
- **Containers:** Docker Compose (API + Postgres)
- **CI:** GitHub Actions

## Repository layout

```
backend/    FastAPI app, migrations, tests
shared/     Test cases used by both the backend and the app, so they agree
mobile/     Expo app
docs/       Project plan, build plans, per-version phone test checklists
.github/    CI workflows, security scans, Dependabot
```

### Where things live

| If you want to find... | Look in |
|---|---|
| An API endpoint | `backend/app/routes.py` |
| The shape of what the API accepts and returns | `backend/app/schemas.py` |
| The database tables | `backend/app/models.py` (changes go in `backend/migrations/`) |
| How a calorie goal is worked out | `backend/app/calc/goals.py` |
| How food search results are ordered | `backend/app/calc/food_rank.py` (weights are in `backend/config.toml`) |
| Talking to USDA and Open Food Facts | `backend/app/sources/` |
| Saving the survey / saving and searching foods | `backend/app/profiles.py`, `backend/app/foods.py` |
| Numbers you can tune (search weights, limits, retry waits) | `backend/config.toml` |
| Secrets and per-machine settings | your `.env` file (see `.env.example`; never committed) |
| A screen on the phone | `mobile/src/features/<name>/` |
| Every call the phone makes to the server | `mobile/src/api/endpoints.ts` |
| Tests | next to what they test: `backend/tests/` mirrors `backend/app/`; phone tests sit beside their files |
| The rules we build by | `docs/engineering-rules.md` |

## Running the backend

Requires Docker Desktop. First copy `.env.example` to a new file named `.env` and choose a database password in it (there is no built-in password, and `docker compose` refuses to start without one). Then:

```
docker compose up --build
```

Then open:

- http://localhost:8000/health returns `{"status":"ok"}`
- http://localhost:8000/health/db returns `{"status":"ok","database":"reachable"}`
- http://localhost:8000/docs shows the interactive API docs

The API container applies database migrations on startup. Stop everything with `Ctrl+C`, and add `-v` to `docker compose down` to also wipe the database.

### Trying the API by hand

Everything under `/api/v1` can be tried from the docs page at http://localhost:8000/docs:

1. Open `POST /api/v1/users`, click **Try it out**, then **Execute**. Copy the `token` from the response. It is shown only once.
2. Click **Authorize** at the top of the page, paste the token, and confirm.
3. Open `PUT /api/v1/users/me/profile`, click **Try it out**, edit the example survey answers, and **Execute**. The response contains your profile and your calorie and macro targets.
4. `GET /api/v1/goals/current` returns the targets again, and `GET /api/v1/users/me/profile` returns the saved survey.

| Endpoint | What it does |
|---|---|
| `POST /api/v1/users` | Creates an anonymous user and returns a secret token |
| `GET /api/v1/users/me/profile` | The saved survey answers (404 until onboarding is done) |
| `PUT /api/v1/users/me/profile` | Saves the survey and calculates a new goal. Answers it can't accept come back as `422` with `errors: [{field, message}]` |
| `GET /api/v1/limits` | The numbers the survey answers are checked against (no login needed), so the app can check as people type |
| `GET /api/v1/goals/current` | The current calorie and macro targets, with how they were calculated |
| `POST /api/v1/foods` | Saves a food (typed in, or a USDA result from a search). Nutrients are per 100 g; any left out are *unknown*, not zero |
| `GET /api/v1/foods/search?q=&page=` | One search box: your saved foods, then the best matches from USDA (needs a free `USDA_API_KEY`) and Open Food Facts (no key), ranked as one list. Each result carries nutrition for its serving (e.g. `1 bar (68 g)` = 260 kcal). `sources` says which database answered, and `has_more` says whether `page=2` has more |
| `GET /api/v1/foods/{id}` | One saved food |

## Running the app on your iPhone

Needs Node 20.19 or newer, and the Expo Go app on the iPhone. The phone and the Mac must be on the same Wi-Fi.

```
docker compose up          # in one terminal: starts the API and database
cd mobile
npm ci                     # first time only
npx expo start             # in a second terminal
```

Scan the QR code with the iPhone Camera and open it in Expo Go. Allow the "Local Network" question the first time. The first screen is the onboarding survey; after you finish it the app shows your calorie and macro targets (and remembers you next time). **Check server connection** on that screen shows the API and database status. Do not use `--tunnel`: the app finds the API by using the Mac's address.

Expo Go may ask you to be logged in to the same free Expo account on both the phone and the Mac (`npx expo login` on the Mac). See limitation L26.

Starting over: wipe the database with `docker compose down -v`, then `docker compose up` again. The app notices the server no longer knows it and creates a new user when you save the survey again.

To point the app at a different server, set `EXPO_PUBLIC_API_URL` (see `mobile/.env.example`).

The same checks CI runs (from `mobile/`):

```
npm run lint
npm run typecheck
npm test
```

## Developing the backend

Run Postgres in Docker and the API on your machine:

```
docker compose up -d db

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

export DATABASE_URL=postgresql+psycopg://nutrientlog:YOUR_PASSWORD@localhost:5432/nutrientlog   # the password from your .env
alembic upgrade head
uvicorn app.main:app --reload
```

The same checks CI runs (from `backend/`, with the virtual environment active):

```
ruff check . && ruff format --check .
mypy app migrations tests
pytest tests/unit
pytest tests/integration      # needs the database and migrations from above
alembic check                 # fails if models and migrations disagree
```

Changing a table: edit the model in `app/models.py`, then run `alembic revision --autogenerate -m "describe change"` and review the generated file in `migrations/versions/`.

## Docs

- [Project plan](docs/plan.md)
- [v0.1 build plan](docs/v0.1-build-plan.md)
- [Engineering rules](docs/engineering-rules.md) (simple code layout, settings in one place, security for a public repo)
- [Known limitations](docs/known-limitations.md)
- [v0.1 phone test checklist](docs/checklists/v0.1.md)

## How versions work

A version is finished, and the next one starts, only when **both** pass:

1. All GitHub Actions checks are green.
2. The version's phone checklist passes on a real iPhone.

Then it is tagged in Git (`v0.1`, `v0.2`, ...).

## Git workflow

- `main` always works.
- One short-lived branch per milestone (for example `m1-backend-skeleton`), merged by pull request once CI is green.

## Checking food search against real data

Search quality can only be judged on the real databases. With your USDA key in `.env`:

```
docker compose run --rm -T api python scripts/search_check.py > search_report.md
```

This runs about 40 typical searches ("peanut butter clif bar", "banana", "vanilla extract"...) and writes the top results for each, so ranking can be tuned on real results instead of guesses.

It takes a few minutes on purpose: the script waits between searches so the free databases are not rushed. The report starts with a PASS count, lists what any failing database actually said, and marks searches the app cannot answer yet as "known gap" rather than failure. Send `search_report.md` back after a run.

**After changing any code, rebuild first** (`docker compose build api`). The image holds a copy of the code, so a run without a rebuild checks the old version.
