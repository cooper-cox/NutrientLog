import type { Profile } from '../../api/users';
import {
  buildProfileRequest,
  changeUnits,
  emptyForm,
  formFromProfile,
  parseBirthDate,
  parseNumber,
  type SurveyForm,
} from './survey';

const TODAY = new Date(2026, 9, 10); // 10 Oct 2026, local time

function filled(changes: Partial<SurveyForm> = {}): SurveyForm {
  return {
    ...emptyForm(),
    name: 'Cooper',
    sex: 'male',
    birthMonth: '10',
    birthDay: '8',
    birthYear: '1996',
    units: 'metric',
    heightCm: '180',
    weight: '80',
    goalWeight: '85',
    activity: 'moderate',
    goalType: 'gain',
    rateKg: 0.25,
    ...changes,
  };
}

describe('parseNumber', () => {
  it.each([
    ['80', 80],
    ['80.5', 80.5],
    [' 80,5 ', 80.5],
  ])('reads %p', (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each(['', '  ', 'abc', '8o', '1e3', '-5', '5.', '.5', '1.2.3'])('rejects %p', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe('parseBirthDate', () => {
  it('builds a YYYY-MM-DD date', () => {
    expect(parseBirthDate('1', '5', '1990', TODAY)).toEqual({ date: '1990-01-05' });
  });

  it('allows today', () => {
    expect(parseBirthDate('10', '10', '2026', TODAY)).toEqual({ date: '2026-10-10' });
  });

  it.each([
    ['', '5', '1990'],
    ['1', '5', '90'],
    ['a', '5', '1990'],
  ])('asks for a complete date for %p/%p/%p', (m, d, y) => {
    expect(parseBirthDate(m, d, y, TODAY)).toHaveProperty('error');
  });

  it.each([
    ['2', '30', '1990'],
    ['13', '1', '1990'],
    ['0', '1', '1990'],
    ['2', '29', '2023'], // not a leap year
  ])('rejects the impossible date %p/%p/%p', (m, d, y) => {
    expect(parseBirthDate(m, d, y, TODAY)).toEqual({ error: 'That date does not exist.' });
  });

  it('accepts 29 February in a leap year', () => {
    expect(parseBirthDate('2', '29', '2000', TODAY)).toEqual({ date: '2000-02-29' });
  });

  it('rejects the future', () => {
    expect(parseBirthDate('10', '11', '2026', TODAY)).toEqual({
      error: 'Your birth date cannot be in the future.',
    });
  });
});

describe('buildProfileRequest', () => {
  it('builds the request from metric answers', () => {
    expect(buildProfileRequest(filled(), 'America/Los_Angeles', TODAY)).toEqual({
      ok: true,
      body: {
        name: 'Cooper',
        sex: 'male',
        birth_date: '1996-10-08',
        height_cm: 180,
        weight_kg: 80,
        goal_weight_kg: 85,
        activity_level: 'moderate',
        goal_type: 'gain',
        rate_kg_per_week: 0.25,
        timezone: 'America/Los_Angeles',
        unit_preference: 'metric',
      },
    });
  });

  it('converts imperial answers to metric', () => {
    const result = buildProfileRequest(
      filled({
        units: 'imperial',
        heightFeet: '5',
        heightInches: '11',
        weight: '176',
        goalWeight: '190',
      }),
      'UTC',
      TODAY,
    );
    expect(result.ok && result.body).toMatchObject({
      height_cm: 180.3,
      weight_kg: 79.8,
      goal_weight_kg: 86.2,
      unit_preference: 'imperial',
    });
  });

  it('treats blank inches as zero and a blank goal weight and name as nothing', () => {
    const result = buildProfileRequest(
      filled({
        units: 'imperial',
        heightFeet: '6',
        heightInches: '',
        weight: '176',
        goalWeight: '',
        name: '  ',
      }),
      'UTC',
      TODAY,
    );
    expect(result.ok && result.body).toMatchObject({
      height_cm: 182.9,
      goal_weight_kg: null,
      name: null,
    });
  });

  it('sends a zero rate when the goal is to maintain', () => {
    const result = buildProfileRequest(filled({ goalType: 'maintain', rateKg: 0.5 }), 'UTC', TODAY);
    expect(result.ok && result.body.rate_kg_per_week).toBe(0);
  });

  it('reports every missing answer at once, under the server’s field names', () => {
    const result = buildProfileRequest(emptyForm(), 'UTC', TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'activity_level',
        'birth_date',
        'goal_type',
        'height_cm',
        'sex',
        'weight_kg',
      ]);
    }
  });

  it('flags unreadable numbers', () => {
    const result = buildProfileRequest(
      filled({ heightCm: 'tall', weight: '8o', goalWeight: 'x' }),
      'UTC',
      TODAY,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'goal_weight_kg',
        'height_cm',
        'weight_kg',
      ]);
    }
  });

  it('rejects 12 or more inches', () => {
    const result = buildProfileRequest(
      filled({ units: 'imperial', heightFeet: '5', heightInches: '12', weight: '170' }),
      'UTC',
      TODAY,
    );
    expect(result.ok).toBe(false);
  });

  it('leaves range checks (age, height, weight) to the server', () => {
    const result = buildProfileRequest(filled({ heightCm: '20', weight: '900' }), 'UTC', TODAY);
    expect(result.ok).toBe(true);
  });
});

describe('changeUnits', () => {
  it('converts typed weight and height when switching to imperial', () => {
    const next = changeUnits(
      filled({ heightCm: '180', weight: '80', goalWeight: '85' }),
      'imperial',
    );
    expect(next).toMatchObject({
      units: 'imperial',
      heightFeet: '5',
      heightInches: '10.9',
      weight: '176.4',
      goalWeight: '187.4',
    });
  });

  it('converts back to metric', () => {
    const imperial = filled({
      units: 'imperial',
      heightFeet: '6',
      heightInches: '0',
      weight: '176.4',
      goalWeight: '',
    });
    expect(changeUnits(imperial, 'metric')).toMatchObject({
      units: 'metric',
      heightCm: '182.9',
      weight: '80',
      goalWeight: '',
    });
  });

  it('leaves unreadable or empty text alone', () => {
    const next = changeUnits(filled({ heightCm: '', weight: 'abc', goalWeight: '' }), 'imperial');
    expect(next).toMatchObject({ weight: 'abc', heightFeet: '', goalWeight: '' });
  });

  it('does nothing when the units are unchanged', () => {
    const form = filled();
    expect(changeUnits(form, 'metric')).toBe(form);
  });
});

describe('formFromProfile', () => {
  const profile: Profile = {
    name: null,
    sex: 'female',
    birth_date: '1990-03-07',
    height_cm: 165,
    weight_kg: 60,
    goal_weight_kg: null,
    activity_level: 'light',
    goal_type: 'maintain',
    rate_kg_per_week: 0,
    timezone: 'UTC',
    unit_preference: 'imperial',
    updated_at: '2026-10-10T00:00:00Z',
  };

  it('fills the survey from a saved profile, in the saved units', () => {
    expect(formFromProfile(profile)).toMatchObject({
      name: '',
      sex: 'female',
      birthMonth: '3',
      birthDay: '7',
      birthYear: '1990',
      units: 'imperial',
      heightFeet: '5',
      heightInches: '5',
      weight: '132.3',
      goalWeight: '',
      activity: 'light',
      goalType: 'maintain',
      rateKg: 0.25,
    });
  });

  it('builds the same request again from what it filled in', () => {
    const result = buildProfileRequest(
      formFromProfile({ ...profile, unit_preference: 'metric' }),
      'UTC',
      TODAY,
    );
    expect(result.ok && result.body).toMatchObject({
      birth_date: '1990-03-07',
      height_cm: 165,
      weight_kg: 60,
    });
  });
});
