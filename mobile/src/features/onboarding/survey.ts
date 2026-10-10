import type {
  ActivityLevel,
  GoalType,
  Profile,
  ProfileIn,
  Sex,
  UnitPreference,
} from '../../api/users';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, round1 } from '../../lib/units';

/** What is typed into the survey. Numbers stay as text until the person presses the button. */
export type SurveyForm = {
  name: string;
  sex: Sex | null;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  units: UnitPreference;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weight: string; // kg or lb, depending on `units`
  goalWeight: string; // same unit as `weight`; optional
  activity: ActivityLevel | null;
  goalType: GoalType | null;
  rateKg: number;
};

/** Names match the server's field names, so its error messages can be shown under the same box. */
export type FieldName =
  | 'name'
  | 'sex'
  | 'birth_date'
  | 'height_cm'
  | 'weight_kg'
  | 'goal_weight_kg'
  | 'activity_level'
  | 'goal_type'
  | 'rate_kg_per_week';

export type FieldErrors = Partial<Record<FieldName, string>>;

export const DEFAULT_RATE_KG = 0.25;

export function emptyForm(): SurveyForm {
  return {
    name: '',
    sex: null,
    birthMonth: '',
    birthDay: '',
    birthYear: '',
    units: 'imperial',
    heightCm: '',
    heightFeet: '',
    heightInches: '',
    weight: '',
    goalWeight: '',
    activity: null,
    goalType: null,
    rateKg: DEFAULT_RATE_KG,
  };
}

/** Weekly rates the person can choose from (in kg; shown in their units). */
export const RATE_CHOICES: Record<'gain' | 'lose', number[]> = {
  gain: [0.25, 0.5],
  lose: [0.25, 0.5, 0.75],
};

/** A plain number like "80", "80.5" or "80,5". Anything else (blank, "8o", "1e3") gives null. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseWhole(text: string): number | null {
  const cleaned = text.trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** A real calendar date that is not in the future, as YYYY-MM-DD. Otherwise a message. */
export function parseBirthDate(
  month: string,
  day: string,
  year: string,
  today: Date,
): { date: string } | { error: string } {
  const m = parseWhole(month);
  const d = parseWhole(day);
  const y = parseWhole(year);
  if (m === null || d === null || y === null || year.trim().length !== 4) {
    return { error: 'Enter your birth date as month, day and a 4-digit year.' };
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
  if (!isRealDate) return { error: 'That date does not exist.' };

  const todayKey =
    pad(today.getFullYear(), 4) + pad(today.getMonth() + 1, 2) + pad(today.getDate(), 2);
  const dateKey = pad(y, 4) + pad(m, 2) + pad(d, 2);
  if (dateKey > todayKey) return { error: 'Your birth date cannot be in the future.' };
  return { date: `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` };
}

export type BuildResult = { ok: true; body: ProfileIn } | { ok: false; errors: FieldErrors };

/**
 * Turns what was typed into what the server expects. Only checks that each answer is present
 * and readable; the server decides whether the values are in a safe range, because it is the
 * one place those rules live.
 */
export function buildProfileRequest(form: SurveyForm, timezone: string, today: Date): BuildResult {
  const errors: FieldErrors = {};
  const metric = form.units === 'metric';

  if (form.sex === null) errors.sex = 'Choose an option.';

  let birthDate = '';
  const birth = parseBirthDate(form.birthMonth, form.birthDay, form.birthYear, today);
  if ('error' in birth) errors.birth_date = birth.error;
  else birthDate = birth.date;

  let heightCm = 0;
  if (metric) {
    const cm = parseNumber(form.heightCm);
    if (cm === null) errors.height_cm = 'Enter your height in centimetres.';
    else heightCm = round1(cm);
  } else {
    const feet = parseNumber(form.heightFeet);
    const inches = form.heightInches.trim() === '' ? 0 : parseNumber(form.heightInches);
    if (feet === null) errors.height_cm = 'Enter your height in feet and inches.';
    else if (inches === null || inches >= 12)
      errors.height_cm = 'Inches must be a number from 0 to 11.';
    else heightCm = round1(ftInToCm(feet, inches));
  }

  let weightKg = 0;
  const weight = parseNumber(form.weight);
  if (weight === null)
    errors.weight_kg = `Enter your weight in ${metric ? 'kilograms' : 'pounds'}.`;
  else weightKg = round1(metric ? weight : lbToKg(weight));

  let goalWeightKg: number | null = null;
  if (form.goalWeight.trim() !== '') {
    const goalWeight = parseNumber(form.goalWeight);
    if (goalWeight === null) {
      errors.goal_weight_kg = `Enter a goal weight in ${metric ? 'kilograms' : 'pounds'}, or leave it blank.`;
    } else {
      goalWeightKg = round1(metric ? goalWeight : lbToKg(goalWeight));
    }
  }

  if (form.activity === null) errors.activity_level = 'Choose an option.';
  if (form.goalType === null) errors.goal_type = 'Choose an option.';

  if (
    Object.keys(errors).length > 0 ||
    form.sex === null ||
    form.activity === null ||
    form.goalType === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: {
      name: form.name.trim() === '' ? null : form.name.trim(),
      sex: form.sex,
      birth_date: birthDate,
      height_cm: heightCm,
      weight_kg: weightKg,
      goal_weight_kg: goalWeightKg,
      activity_level: form.activity,
      goal_type: form.goalType,
      rate_kg_per_week: form.goalType === 'maintain' ? 0 : form.rateKg,
      timezone,
      unit_preference: form.units,
    },
  };
}

function show(value: number): string {
  return String(round1(value));
}

/** Switches between metric and imperial, converting what has already been typed. */
export function changeUnits(form: SurveyForm, units: UnitPreference): SurveyForm {
  if (units === form.units) return form;
  const next: SurveyForm = { ...form, units };

  const convertWeight = (text: string): string => {
    const value = parseNumber(text);
    if (value === null) return text;
    return show(units === 'metric' ? lbToKg(value) : kgToLb(value));
  };
  next.weight = convertWeight(form.weight);
  next.goalWeight = convertWeight(form.goalWeight);

  if (units === 'imperial') {
    const cm = parseNumber(form.heightCm);
    if (cm !== null) {
      const { feet, inches } = cmToFtIn(cm);
      next.heightFeet = String(feet);
      next.heightInches = String(inches);
    }
  } else {
    const feet = parseNumber(form.heightFeet);
    if (feet !== null) {
      const inches = form.heightInches.trim() === '' ? 0 : parseNumber(form.heightInches);
      if (inches !== null) next.heightCm = show(ftInToCm(feet, inches));
    }
  }
  return next;
}

/** Fills the survey from a saved profile, so "Change my answers" starts from what was entered. */
export function formFromProfile(profile: Profile): SurveyForm {
  const [year, month, day] = profile.birth_date.split('-');
  const units = profile.unit_preference;
  const metric = units === 'metric';
  const { feet, inches } = cmToFtIn(profile.height_cm);
  const rate = profile.rate_kg_per_week > 0 ? profile.rate_kg_per_week : DEFAULT_RATE_KG;

  return {
    name: profile.name ?? '',
    sex: profile.sex,
    birthMonth: String(Number(month)),
    birthDay: String(Number(day)),
    birthYear: year,
    units,
    heightCm: show(profile.height_cm),
    heightFeet: String(feet),
    heightInches: String(inches),
    weight: show(metric ? profile.weight_kg : kgToLb(profile.weight_kg)),
    goalWeight:
      profile.goal_weight_kg === null
        ? ''
        : show(metric ? profile.goal_weight_kg : kgToLb(profile.goal_weight_kg)),
    activity: profile.activity_level,
    goalType: profile.goal_type,
    rateKg: rate,
  };
}
