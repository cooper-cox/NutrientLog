import type { Limits } from '../../api/limits';
import type { GoalType, UnitPreference } from '../../api/users';
import sharedCases from '../../../../shared/profile_check_cases.json';
import { ageOn, checkAnswers } from './checks';

/*
 * These cases are shared with the server's own test (backend/tests/unit/calc/
 * test_profile_check_shared.py), so the app and the server give the same answers in the same
 * words. If a case fails here, the app's copy of a check has drifted from the server's.
 */
type SharedCase = {
  name: string;
  age_years: number;
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number | null;
  goal: GoalType;
  units: UnitPreference;
  expected: Record<string, string>;
};

const shared = sharedCases as unknown as { limits: Limits; cases: SharedCase[] };

describe('checkAnswers (shared cases)', () => {
  it.each(shared.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const found = checkAnswers(
      {
        ageYears: c.age_years,
        heightCm: c.height_cm,
        weightKg: c.weight_kg,
        goalWeightKg: c.goal_weight_kg,
        goalType: c.goal,
        units: c.units,
      },
      shared.limits,
    );
    expect(found).toEqual(c.expected);
  });
});

describe('checkAnswers (missing answers)', () => {
  it('checks only what it has', () => {
    expect(checkAnswers({ goalType: 'gain', units: 'metric' }, shared.limits)).toEqual({});
    expect(
      checkAnswers({ weightKg: 500, goalType: 'gain', units: 'metric' }, shared.limits),
    ).toEqual({ weight_kg: 'Weight must be between 30 kg and 300 kg.' });
  });

  it('still checks the goal weight against the range when the current weight is missing', () => {
    expect(
      checkAnswers({ goalWeightKg: 900, goalType: 'lose', units: 'metric' }, shared.limits),
    ).toEqual({ goal_weight_kg: 'Goal weight must be between 30 kg and 300 kg.' });
  });
});

describe('ageOn', () => {
  const today = new Date(2026, 9, 10); // 10 Oct 2026

  it('counts whole years', () => {
    expect(ageOn(1996, 10, 10, today)).toBe(30); // birthday today
    expect(ageOn(1996, 10, 11, today)).toBe(29); // birthday tomorrow
    expect(ageOn(1996, 9, 30, today)).toBe(30);
    expect(ageOn(2008, 10, 10, today)).toBe(18);
    expect(ageOn(2008, 10, 11, today)).toBe(17);
  });
});
