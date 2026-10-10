# NutrientLog

[![Backend CI](https://github.com/cooper-cox/NutrientLog/actions/workflows/backend-ci.yml/badge.svg?branch=main)](https://github.com/cooper-cox/NutrientLog/actions/workflows/backend-ci.yml)
[![Mobile CI](https://github.com/cooper-cox/NutrientLog/actions/workflows/mobile-ci.yml/badge.svg?branch=main)](https://github.com/cooper-cox/NutrientLog/actions/workflows/mobile-ci.yml)

A nutrition-first calorie and nutrient tracker for iPhone. It tells you what your body needs and why, not just how many calories you ate.

**Status:** v0.1 in progress. Backend (health checks, users, profile, goals) is done; M4 (the Expo app on the iPhone, with real mobile CI) is in review. Next: M5, the onboarding screen.

## Stack

- **Mobile:** React Native + Expo + TypeScript (`mobile/`)
- **Backend:** Python + FastAPI (`backend/`)
- **Database:** PostgreSQL
- **Containers:** Docker Compose (API + Postgres)
- **CI:** GitHub Actions

## Repository layout

```
backend/    FastAPI app, migrations, tests
mobile/     Expo app
docs/       Project plan, build plans, per-version phone test checklists
.github/    CI workflows
```

## Running the backend

Requires Docker Desktop.

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
| `PUT /api/v1/users/me/profile` | Saves the survey and calculates a new goal |
| `GET /api/v1/goals/current` | The current calorie and macro targets, with how they were calculated |

## Running the app on your iPhone

Needs Node 20.19 or newer, and the Expo Go app on the iPhone. The phone and the Mac must be on the same Wi-Fi.

```
docker compose up          # in one terminal: starts the API and database
cd mobile
npm ci                     # first time only
npx expo start             # in a second terminal
```

Scan the QR code with the iPhone Camera and open it in Expo Go. Allow the "Local Network" question the first time. The screen should show **OK** for both the API and the database. Do not use `--tunnel`: the app finds the API by using the Mac's address.

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

export DATABASE_URL=postgresql+psycopg://nutrientlog:nutrientlog@localhost:5432/nutrientlog
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

Changing a table: edit the model in `app/models/`, then run `alembic revision --autogenerate -m "describe change"` and review the generated file in `migrations/versions/`.

## Docs

- [Project plan](docs/plan.md)
- [v0.1 build plan](docs/v0.1-build-plan.md)
- [v0.1 phone test checklist](docs/checklists/v0.1.md)

## How versions work

A version is finished, and the next one starts, only when **both** pass:

1. All GitHub Actions checks are green.
2. The version's phone checklist passes on a real iPhone.

Then it is tagged in Git (`v0.1`, `v0.2`, ...).

## Git workflow

- `main` always works.
- One short-lived branch per milestone (for example `m1-backend-skeleton`), merged by pull request once CI is green.
