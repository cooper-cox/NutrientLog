# NutrientLog: design decisions (look and feel)

Status: built for v0.1 (see the "Looks and polish" note in `v0.1-build-plan.md`). The mockups
live in the Design artifact "NutrientLog Look Options"; the colours and sizes live in
`mobile/src/ui/theme.ts`.

## Palette (black-led, 60 / 30 / 10)
- Background near-black `#0E0B14` (60). Purple surfaces `#2B2045` and `#3A2C5E` (30). Orange
  `#F2913D` (10): primary buttons, today, key numbers, and secondary actions (Edit, Remove).
- Chart bars `#8F7BD6`, muted text `#B0A6CB`, tab bar `#17112A`. Dark only for v0.1.
- Feel: calm and soothing, with enough contrast to stand out. A selected item is shown by a
  border, not a filled block.

## Text sizes (the larger set was chosen)
- Screen titles 30, section headers 19, date subtitles 16, body 16, small 13.

## Structure
- Four tabs: Home, Food, Workout, Profile.
- A Calendar button top right on Home, Food and Workout (not Profile). It opens a sheet over
  the faded screen; the tab bar stays usable. Picking a day sets the day Food and Workout add to.
- Calendar: no food/workouts toggle. Orange dots mark workout days. Tapping a day shows a
  summary and a More button, which folds the grid to that week and shows foods, macros and
  nutrients. Less restores the month.

## Screens
- Home: calories left, progress bar, last 7 days, macros, burned and balance.
- Food: search, add by hand, eaten today with Edit/Remove. Swipe left for Nutrition: bars for
  ten nutrients; tap a food to see its share in orange. Meals get their own totals later.
- Workout: "This week" minutes chart (Sunday to Saturday, weekday over mm/dd), two wheels each
  with its own border, intensity in a few words (Light: Easy, you could chat; Moderate:
  Sweating a little; Hard: Heavy breathing, minimal breaks), "Calories burned (if known)",
  and the day's workouts with an orange Remove.
- Profile: goal and daily macros in one card with a Details button explaining how the numbers
  were set; About you; Edit my answers; Check connection. Personalization (photo etc.) later.

## Later: education (core to the app's purpose)
- Explain what each nutrient and macro is and why it matters (on the Nutrition page or a
  separate screen).
- Teach how to read a nutrition label and which ingredients to watch for, and why.
- The aim is helping people build healthier eating habits, not only counting.

## Later: polish and other ideas
- Colour-coded workouts by intensity or duration on the calendar; Strava / workout-app linking
  (deferred, not a priority); DM Sans (L50); per-nutrient targets (L51).
