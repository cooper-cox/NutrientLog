import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Goal, Profile } from '../../api/users';
import { ResultsScreen } from './ResultsScreen';

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PROFILE: Profile = {
  name: 'Cooper',
  sex: 'male',
  birth_date: '1996-10-08',
  height_cm: 180,
  weight_kg: 80,
  goal_weight_kg: 85,
  activity_level: 'moderate',
  goal_type: 'gain',
  rate_kg_per_week: 0.25,
  timezone: 'UTC',
  unit_preference: 'metric',
  updated_at: '2026-10-10T00:00:00Z',
};

const GOAL: Goal = {
  effective_from: '2026-10-10',
  calories: 3034,
  protein_g: 144,
  fat_g: 84,
  carb_g: 425,
  weight_kg: 80,
  bmr: 1780,
  tdee: 2759,
  daily_adjustment: 275,
  rate_kg_per_week: 0.25,
  rate_was_capped: false,
  floor_was_applied: false,
  weeks_to_goal: 20,
};

function renderResults(profile: Profile = PROFILE, goal: Goal = GOAL) {
  const onChangeAnswers = jest.fn();
  const onCheckConnection = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <ResultsScreen
        profile={profile}
        goal={goal}
        onChangeAnswers={onChangeAnswers}
        onCheckConnection={onCheckConnection}
      />
    </SafeAreaProvider>,
  );
  return { onChangeAnswers, onCheckConnection };
}

describe('ResultsScreen', () => {
  it('shows the calorie and macro targets', () => {
    renderResults();
    expect(screen.getByText('Cooper, your daily targets')).toBeTruthy();
    expect(screen.getByText('3034')).toBeTruthy();
    expect(screen.getByLabelText('Protein: 144 grams')).toBeTruthy();
    expect(screen.getByLabelText('Fat: 84 grams')).toBeTruthy();
    expect(screen.getByLabelText('Carbs: 425 grams')).toBeTruthy();
  });

  it('explains how the target was reached', () => {
    renderResults();
    expect(screen.getByText(/about 1780 calories a day at rest/)).toBeTruthy();
    expect(screen.getByText(/about 2759 a day to stay at the same weight/)).toBeTruthy();
    expect(screen.getByText(/we add 275 calories \(\+275 a day\)/)).toBeTruthy();
  });

  it('estimates the time to the goal weight in the person’s units', () => {
    renderResults();
    expect(
      screen.getByText('At 0.25 kg per week, reaching 85 kg would take about 20 weeks.'),
    ).toBeTruthy();

    renderResults({ ...PROFILE, unit_preference: 'imperial' });
    expect(
      screen.getByText(/At about 0.5 lb per week, reaching 187.4 lb would take about 20 weeks/),
    ).toBeTruthy();
  });

  it('says nothing about the time when there is no estimate', () => {
    renderResults({ ...PROFILE, goal_weight_kg: null }, { ...GOAL, weeks_to_goal: null });
    expect(screen.queryByText(/would take about/)).toBeNull();
  });

  it('says so when the pace was reduced or the minimum was applied', () => {
    renderResults(PROFILE, { ...GOAL, rate_was_capped: true, floor_was_applied: true });
    expect(screen.getByText(/faster than we consider safe/)).toBeTruthy();
    expect(screen.getByText(/raised to the lowest daily amount/)).toBeTruthy();
  });

  it('explains maintaining without any adjustment', () => {
    renderResults(
      { ...PROFILE, goal_type: 'maintain' },
      { ...GOAL, daily_adjustment: 0, rate_kg_per_week: 0, weeks_to_goal: null },
    );
    expect(screen.getByText(/nothing is added or removed/)).toBeTruthy();
  });

  it('describes losing as removing calories', () => {
    renderResults({ ...PROFILE, goal_type: 'lose' }, { ...GOAL, daily_adjustment: -275 });
    expect(screen.getByText(/we remove 275 calories \(-275 a day\)/)).toBeTruthy();
  });

  it('shows the medical disclaimer', () => {
    renderResults();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
  });

  it('has working buttons', () => {
    const { onChangeAnswers, onCheckConnection } = renderResults();
    fireEvent.press(screen.getByRole('button', { name: 'Change my answers' }));
    fireEvent.press(screen.getByRole('button', { name: 'Check server connection' }));
    expect(onChangeAnswers).toHaveBeenCalled();
    expect(onCheckConnection).toHaveBeenCalled();
  });
});
