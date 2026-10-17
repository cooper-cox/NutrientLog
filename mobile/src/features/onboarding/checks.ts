import type { Limits , GoalType, UnitPreference } from '../../api/endpoints';
import { formatHeightLimit, formatWeightLimit } from '../../lib/units';

/*
 * The same checks the server makes when the survey is saved (backend/app/calc/profile_check.py),
 * run as people type. The numbers come from the server (see Limits), but the wording is written
 * twice, so keep the two in step. The server's answer always wins when the survey is saved.
 */

export type CheckedField = 'birth_date' | 'height_cm' | 'weight_kg' | 'goal_weight_kg';
export type CheckProblems = Partial<Record<CheckedField, string>>;

type Answers = {
  /** Each is undefined when that answer is missing or unreadable (reported separately). */
  ageYears?: number;
  heightCm?: number;
  weightKg?: number;
  /** null when there is no goal weight. */
  goalWeightKg?: number | null;
  goalType: GoalType;
  units: UnitPreference;
};

/** Whole years between a birth date and today. */
export function ageOn(year: number, month: number, day: number, today: Date): number {
  let age = today.getFullYear() - year;
  const birthdayPassed =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age;
}

function bmi(weightKg: number, heightCm: number): number {
  return weightKg / (heightCm / 100) ** 2;
}

function weightForBmi(targetBmi: number, heightCm: number): number {
  return targetBmi * (heightCm / 100) ** 2;
}

/** Every answer outside the limits, worded in the person's units. */
export function checkAnswers(answers: Answers, limits: Limits): CheckProblems {
  const { ageYears, heightCm, weightKg, goalWeightKg, goalType, units } = answers;
  const problems: CheckProblems = {};

  const weightRange =
    `${formatWeightLimit(limits.min_weight_kg, units, true, 10)} and ` +
    formatWeightLimit(limits.max_weight_kg, units, false, 10);

  if (ageYears !== undefined) {
    if (ageYears < limits.min_age_years) {
      problems.birth_date = `NutrientLog is for adults: you must be ${limits.min_age_years} or older.`;
    } else if (ageYears > limits.max_age_years) {
      problems.birth_date = `Please check your birth date: we support ages up to ${limits.max_age_years}.`;
    }
  }

  const heightInRange =
    heightCm !== undefined && limits.min_height_cm <= heightCm && heightCm <= limits.max_height_cm;
  if (heightCm !== undefined && !heightInRange) {
    problems.height_cm =
      `Height must be between ${formatHeightLimit(limits.min_height_cm, units, true)} and ` +
      `${formatHeightLimit(limits.max_height_cm, units, false)}.`;
  }

  const weightInRange =
    weightKg !== undefined && limits.min_weight_kg <= weightKg && weightKg <= limits.max_weight_kg;
  if (weightKg !== undefined && !weightInRange) {
    problems.weight_kg = `Weight must be between ${weightRange}.`;
  }

  if (weightKg !== undefined && weightInRange && heightCm !== undefined && heightInRange) {
    const current = bmi(weightKg, heightCm);
    if (current < limits.min_plausible_bmi || current > limits.max_plausible_bmi) {
      let message = "That height and weight don't look right together. Please check them.";
      if (current < limits.min_plausible_bmi) {
        message += ' If they are correct, please talk to a doctor before using a nutrition app.';
      }
      problems.weight_kg = message;
    }
  }

  if (goalWeightKg !== undefined && goalWeightKg !== null) {
    const goalProblem = goalWeightProblem(
      goalType,
      weightKg,
      goalWeightKg,
      heightInRange ? heightCm : undefined,
      units,
      limits,
      weightRange,
    );
    if (goalProblem) problems.goal_weight_kg = goalProblem;
  }
  return problems;
}

function goalWeightProblem(
  goalType: GoalType,
  weightKg: number | undefined,
  goalWeightKg: number,
  heightCm: number | undefined,
  units: UnitPreference,
  limits: Limits,
  weightRange: string,
): string | null {
  if (goalWeightKg < limits.min_weight_kg || goalWeightKg > limits.max_weight_kg) {
    return `Goal weight must be between ${weightRange}.`;
  }
  if (weightKg !== undefined) {
    if (goalType === 'gain' && goalWeightKg <= weightKg) {
      return 'To gain weight, the goal weight must be above your current weight.';
    }
    if (goalType === 'lose' && goalWeightKg >= weightKg) {
      return 'To lose weight, the goal weight must be below your current weight.';
    }
  }
  if (heightCm === undefined) return null; // the height problem is reported on its own

  if (goalType === 'lose') {
    const lowest = weightForBmi(limits.min_goal_bmi_when_losing, heightCm);
    if (goalWeightKg < lowest) {
      return `For your height, the lowest goal weight we can set is about ${formatWeightLimit(lowest, units, true, 5)}.`;
    }
  }
  if (goalType === 'gain') {
    // Only gaining is limited at the top: someone who already weighs more than this and wants
    // to lose weight (or stay put) must still be able to set a goal.
    const highest = weightForBmi(limits.max_goal_bmi, heightCm);
    if (goalWeightKg > highest) {
      return `For your height, the highest goal weight we can set is about ${formatWeightLimit(highest, units, false, 5)}.`;
    }
  }
  return null;
}
