# NutrientLog

A nutrition-first calorie and nutrient tracker for iPhone. It tells you what your body needs and why, not just how many calories you ate.

**Status:** v0.1 in progress (milestone M0: repo and tooling).

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
