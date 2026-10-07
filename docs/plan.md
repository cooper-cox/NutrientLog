# NutrientLog: Project Plan (Draft 3)

Working name: **NutrientLog** (placeholder, can change anytime).
Status: planning only. No code until this plan is agreed.

## 1. Vision

A nutrition-first tracker that tells users what their body needs and why, not just how many calories they ate. Built to be useful to me first, then to other people.

**Problem I'm solving:** I'm working out more but not gaining or losing weight as intended. I need an app that (a) sets calorie and nutrient goals from my situation, (b) makes logging brand foods and portions painless, (c) shows me whether my intake is varied and nutritionally complete, and (d) checks my actual weight trend against my goal.

**What makes it different from existing apps:**
- Nutrition (vitamins, minerals, fat and carb types) is the main feature, not fitness or recipes.
- Every number comes with an explanation of what it is and why it matters.
- Portion conversion is handled for the user (package, slice, cup, and gram all convert automatically).
- Brand foods that aren't in a database can still be added quickly.

## 2. Decisions made

| Topic | Decision |
|---|---|
| Phone | iPhone 11 (iOS first; Android and tablets later) |
| Mobile app | React Native + Expo + TypeScript |
| Backend | Python + FastAPI |
| Database | PostgreSQL |
| Containers | Docker Compose: API + Postgres |
| CI/CD | GitHub Actions: lint, type-check, tests, Docker build |
| Accounts | None for the prototype. Anonymous user ID per device. Real login later. |
| Units | User chooses metric or imperial. Stored internally as metric. |
| Audience | Just me for now, designed so others can use it later |
| Weight tracking | Core feature |
| Cost | Free tiers only, always (see section 10) |
| Workout calories | "Eat back" ON by default, with a settings toggle so I can test both |
| Recipe builder | v0.2 |

## 3. Core concepts

- **Food**: one item with nutrition data (a Clif bar, an avocado).
- **Recipe**: a saved Food built from ingredients (my salad). Once saved, it behaves like any Food.
- **Meal**: a grouping of today's log entries (breakfast, post-gym shake). Has totals and a color or label.
- **Saved meal** (later): a template that can be re-logged in one tap.
- **Log entry**: "I ate X grams of Food Y on date D," optionally assigned to a Meal.

## 4. Rules for every version

### Version gate (definition of done)
A version is not finished, and the next one does not start, until **both** pass:
1. **Automated checks:** lint, type-check, unit tests, integration tests, and Docker build are all green in GitHub Actions.
2. **My phone test:** I run a manual checklist on my iPhone 11. The checklist for each version is written *before* building that version, so "done" is defined up front.

Then the version is tagged in Git (v0.1, v0.2, ...).

### Scalability rules (built in from v0.1)
- **Layered backend:** routes (HTTP) → services (business logic) → repositories (database). Logic never lives in a route handler.
- **Versioned API** (`/api/v1/...`) so the app and server can change independently.
- **Database migrations from day one** (Alembic). The schema only changes through migrations.
- **Data-driven nutrients:** nutrients live in a table, not in code. Adding "iron" or "added sugars" later means adding rows plus a little UI config, not rewriting screens.
- **Data-driven game content:** monsters and activities are tables or config files too.
- **Feature modules in the app:** each feature (food, nutrition, weight, fitness, quest, settings) is its own folder with its own screens, API calls, and state. Adding a feature means adding a folder.
- **One place for each shared thing:** unit conversion, date/timezone handling, and the AI call each live in a single module.
- **Pure functions for calculations** (calorie target, MET calories, totals, unit conversion) so they are easy to unit test.
- **Settings and feature flags** stored per user, so toggles (eat back, units, quest on/off) are cheap to add.

## 5. Design principles

1. **Everything is grams internally.** Each food has a base (per 100 g) plus named servings ("1 slice = 28 g," "1 bar = 68 g"). The UI converts for display.
2. **Dates, not resets.** Each entry stores its local date. Screens query "today." Nothing is deleted at midnight, and history comes for free.
3. **Unknown is not zero.** A missing nutrient is stored as null and excluded from "% of goal," never counted as 0.
4. **Layered food lookup**, in this order:
   1. My saved foods (instant)
   2. USDA FoodData Central and Open Food Facts (real label data, barcodes)
   3. AI estimate (clearly labeled "estimated," user confirms or edits before saving)
   4. Manual entry
5. **Math in code, words from AI.** Calculations are plain tested code. AI is used only for parsing messy input, estimating unknown foods, and phrasing meal feedback around computed gaps.
6. **AI is called from the backend only.** The API key never lives on the phone. The model sits behind one function so it can be swapped.
7. **Offline-friendly logging.** Entries queue locally and sync when signal returns.

## 6. Features by screen

### Onboarding
- Survey: name, age, sex, height, weight, goal weight, activity level, motivation, gain/lose/maintain and desired rate.
- Computes calorie target (Mifflin-St Jeor + activity multiplier) and macro targets.
- Guardrails: calorie floor, limit on weekly rate of change, age check, "not medical advice" note.
- Can be redone or edited later.

### Home
- Calories remaining bar for today (target, minus eaten, plus workout calories if "eat back" is on).
- Goal adjustment (gain/lose and rate), with a suggestion based on actual weight trend.
- Weight trend mini-chart with quick "log weight."
- History view with a toggle: bar/line chart or calendar (day, week, month, year). Tapping a day shows the foods eaten and whether the goal was met.
- Quest status card (once the quest feature exists).

### Food
- Today's list with a "+" to add food. Search saved foods, recents, favorites, barcode scan, or create custom.
- Edit quantity, swipe to delete, undo after delete.
- Log to a past day, copy yesterday's meal.
- Manage saved foods (edit, delete, fix wrong values).
- Group entries into Meals with totals (cals, protein, carbs, fat), color or label, tap to expand.
- Create and edit Recipes from ingredients (v0.2).
- "Review this meal" button (meals only, on demand, never a popup). Gaps are computed in code, then the AI suggests foods for those gaps.
- Sort by calories, newest, oldest.

### Nutrition
Nutrients are added in stages, so we can confirm each one is correct before adding more:
- **Stage 1 (v0.3 start):** total carbs, total fats, protein.
- **Stage 2:** saturated fat, unsaturated fat, trans fat, total sugars, added sugars, sodium.
- **Stage 3:** iron, calcium, and vitamins (A onward), plus other minerals.

Features:
- Targets vs intake for each nutrient.
- Switch views between pie, table, and graph.
- Tap any term for a plain-language explanation of what it is and why the body needs it.
- "What contributed": which foods drove each nutrient (e.g. avocado = 57% of today's fat).
- Change indicators since last visit (up or down after adding or removing foods).

### Fitness
- Add a workout (type + duration or distance). Calories burned come from MET values: calories = MET × weight (kg) × hours, using the Compendium of Physical Activities. Deterministic and unit-testable.
- Optional AI helper turns free text ("45 min climbing") into activity and duration.
- Delete or edit workouts, with the calorie budget adjusting.
- Setting: "eat back workout calories" (default ON).
- Calendar history of workouts.

### Weight
- Log, edit, and delete weigh-ins.
- Trend line (smoothed) vs goal rate.
- Feeds the goal-adjustment suggestion.

### Quest (daily-habit game, v0.6)
A "heroic journey" that rewards logging and hitting your goal.

**Decided rules:**
- Each day can earn up to two dice rolls:
  1. **Log-in roll:** earned by logging **at least one food** that day.
  2. **Goal roll:** earned by completing the daily calorie goal, which depends on the user's goal type (see below).
- Each roll's result is damage dealt to the current monster.
- Monsters have HP, and tougher ones take multiple days: slime → goblin → orc → ... → dragon. The monster list is data-driven, so adding monsters is easy.
- **HP system:** the player has HP. A missed day (no food logged) costs HP, and the player is only defeated at 0 HP, which restarts the journey from the beginning. Starting HP, damage per missed day, and whether tougher monsters hit harder are config values we tune during v0.6, not hardcoded.
- Dice rolls and monster state are decided and stored on the backend so they can't drift or be exploited, and the app just displays them.
- Tied to notifications: "the goblin is waiting" fits inside the 4-per-day cap.

**What counts as "goal completed" (goal roll):**
- **Gain weight:** calories eaten are **at or above** the daily target. No upper limit, since people struggling to gain aren't going to suddenly overeat.
- **Lose weight:** calories eaten are **at or below** the daily target, and above the app's calorie floor (so eating almost nothing never counts as a win).
- **Maintain:** calories eaten are within a range of the target (about 90-110%, tunable).
- The "target" is the user's calorie target for that day, which already includes the goal surplus or deficit and, if "eat back" is on, that day's workout calories.

**Still true:**
- **Opt-in:** the quest is switchable off in settings. Streak-and-punishment mechanics can add unhealthy pressure around food for some users, so it is never forced.
- **Timing:** rolls and HP changes are resolved when the day closes in the user's timezone, which is simpler to make consistent than resolving them live.

### Settings
- Themes: dark, light, colorblind-friendly.
- Text: size and font.
- Units: metric or imperial.
- Eat back workout calories: on or off.
- Quest: on or off.
- Notifications on or off (max 4 per day, only if not opened or goal not met, spaced out; stop after 3 days of inactivity).
- Profile editing.
- Export and delete my data.

### Cross-cutting
- Timezone-correct "today."
- Loading, empty, and error states (especially for AI or network failures).

## 7. Data model (first sketch)

- `users`: id, anonymous_id, name, sex, birth_date, height_cm, timezone, activity_level, goal_type, goal_rate, created_at
- `user_settings`: user_id, unit_pref, eat_back_workouts, quest_enabled, theme, font_scale, notifications_enabled
- `goals`: user_id, effective_from, calories, protein_g, fat_g, carb_g
- `goal_nutrient_targets`: goal_id, nutrient_id, target_amount
- `foods`: id, owner_user_id (null = shared), name, brand, barcode, source (usda / off / ai / manual), is_estimated, kind (food / recipe)
- `food_nutrients`: food_id, nutrient_id, amount_per_100g (nullable)
- `nutrients`: id, name, unit, category, explanation, display_order, enabled
- `food_servings`: food_id, label, grams
- `recipe_ingredients`: recipe_id, ingredient_food_id, grams
- `meals`: id, user_id, date, label, color
- `log_entries`: id, user_id, food_id, grams, date, logged_at, meal_id (nullable)
- `workouts`: id, user_id, date, activity_id, duration_min, distance, calories_burned
- `activities`: id, name, met_value
- `weight_entries`: id, user_id, date, weight_kg
- *(later)* `monsters`: id, name, hp, dice_type, order; `quest_progress`: user_id, monster_id, damage_dealt, started_at; `quest_rolls`: user_id, date, roll_type, result

## 8. Architecture

```
iPhone (Expo / React Native)
        |  HTTPS (JSON)
FastAPI backend  --->  PostgreSQL
        |
        +--> USDA FoodData Central / Open Food Facts
        +--> AI model API (estimates, parsing, meal review)
```

Local development uses Docker Compose (API + Postgres). Hosting comes later, on a free tier.

## 9. Version roadmap

Every version must pass the version gate in section 4 before the next begins.

**v0.1: Prototype (minimal)**
- Onboarding (age, sex, height, weight, activity, goal) to calorie target
- Search USDA foods or enter manually
- Log in grams or a named serving
- "Calories remaining" for today
- Anonymous user, data in Postgres
- Docker Compose, GitHub Actions (lint, type-check, tests, build)
- Tests for the goal calculator and unit conversions

**v0.2: Daily use**
- Edit and delete entries (swipe, undo), saved foods and recents
- Meals (group, totals)
- Recipe builder
- Log to past days

**v0.3: Nutrition focus**
- Nutrition screen, Stage 1 nutrients (carbs, fats, protein), then Stage 2 and 3 once Stage 1 is verified correct
- Views (pie, table, graph), tap-for-explanation, contribution breakdown, change indicators
- Open Food Facts and barcode scan

**v0.4: Weight and history**
- Weight log and trend
- History chart and calendar on Home
- Goal-adjustment suggestions

**v0.5: AI and fitness**
- AI estimate fallback (labeled, confirm before save)
- Meal review button
- Workouts via MET table, workout calendar, eat-back setting

**v0.6: Quest**
- Dice rolls, player HP, monsters, journey progress, restart when HP hits 0
- Settings toggle, quest notifications

**v0.7: Polish (function)**
- Themes (dark, light, colorblind), fonts and text size, units toggle
- Notifications refinement
- Offline queue, export and delete data
- Error, loading, and empty states everywhere

**v0.8: Polish (look and feel)**
- Visual design pass: logo, color palette, typography, spacing, icons, animations
- Quest art and visual feedback
- Consistency review across all screens and screen sizes

**v1.0+: Other people**
- Real accounts, cloud backup
- Android and tablet layouts
- Hosting, privacy policy, App Store release

## 10. Free-tier plan

| Need | Free option | Watch out for |
|---|---|---|
| Phone testing | Expo Go | A development build on iOS needs a paid Apple Developer account (about $99/year). This is the one non-free item, and we only need it if Expo Go can't do something. |
| Food data | USDA FoodData Central, Open Food Facts | API rate limits |
| AI | A free-tier model API (e.g. Gemini Flash-tier) | Free limits and model names change, so we'll check current ones when we get to v0.5 |
| Database and hosting (later) | Postgres in Docker locally; free tiers (e.g. Supabase, Neon) for hosting | Free tiers can pause or limit storage |
| CI | GitHub Actions (free for public repos, with a monthly allowance for private ones) | Keep workflows lean |
| Notifications | Local scheduled notifications need no server | We'll verify what Expo Go supports when we reach v0.6 and v0.7 |

## 11. Learning goals map

| Goal | Where it shows up |
|---|---|
| Databases | Postgres schema, migrations, daily and range totals, saved-food lookups |
| GitHub Actions | Lint, type-check, tests, Docker build on every push; Postgres service container for integration tests |
| Containers | Docker Compose for API + DB |
| Version control | Feature branches and PRs, version tags, a green CI as the merge rule |

## 12. iPhone testing notes

- **Expo Go** (free): install from the App Store, scan a QR code, and the app runs live on the iPhone 11 over the same Wi-Fi. This is the plan for prototyping.
- The backend runs on my computer during early development, and the phone reaches it over local Wi-Fi.

## 13. Remaining questions

1. **Quest tuning (v0.6):** starting HP, HP lost per missed day, and whether tougher monsters hit harder. These are config values and can wait.
2. **Maintain-goal window:** is about 90-110% of target right? Also can wait until v0.6.
3. **v0.1 phone checklist:** drafted in `v0.1-build-plan.md` for your review.
4. App name and branding (placeholder: NutrientLog; real design comes in v0.8).
