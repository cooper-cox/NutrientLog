import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import type { ProfileSaved } from '../../api/users';
import { OnboardingScreen } from './OnboardingScreen';
import { saveSurvey } from './saveSurvey';

jest.mock('./saveSurvey');
jest.mock('../../lib/timezone', () => ({ getTimeZone: () => 'America/Los_Angeles' }));

const mockSaveSurvey = jest.mocked(saveSurvey);
const SAVED = { goal: { calories: 3034 } } as ProfileSaved;

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen(props: Partial<Parameters<typeof OnboardingScreen>[0]> = {}) {
  const onSaved = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <OnboardingScreen onSaved={onSaved} {...props} />
    </SafeAreaProvider>,
  );
  return { onSaved };
}

function type(label: string, text: string) {
  fireEvent.changeText(screen.getByLabelText(label), text);
}

function choose(name: string) {
  fireEvent.press(screen.getByRole('radio', { name }));
}

/** Fill in everything with metric units. */
function fillInSurvey() {
  choose('Kilograms and centimetres');
  choose('Male');
  type('Birth month', '10');
  type('Birth day', '8');
  type('Birth year', '1996');
  type('Height in centimetres', '180');
  type('Current weight in kilograms', '80');
  choose('Moderately active');
  choose('Gain weight');
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSaveSurvey.mockResolvedValue(SAVED);
});

describe('OnboardingScreen', () => {
  it('shows the medical disclaimer and explains the sex question', () => {
    renderScreen();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
    expect(screen.getByText('Sex (used for the calorie formula)')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Prefer not to say' })).toBeTruthy();
  });

  it('marks every missing answer and does not contact the server', () => {
    renderScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    expect(screen.getByText('Some answers need fixing. They are marked below.')).toBeTruthy();
    expect(
      screen.getByText('Enter your birth date as month, day and a 4-digit year.'),
    ).toBeTruthy();
    expect(screen.getAllByText('Choose an option.').length).toBeGreaterThanOrEqual(3);
    expect(mockSaveSurvey).not.toHaveBeenCalled();
  });

  it('sends the answers, in metric, with the phone’s time zone, then reports the result', async () => {
    const { onSaved } = renderScreen();
    fillInSurvey();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED));
    expect(mockSaveSurvey).toHaveBeenCalledWith({
      name: null,
      sex: 'male',
      birth_date: '1996-10-08',
      height_cm: 180,
      weight_kg: 80,
      goal_weight_kg: null,
      activity_level: 'moderate',
      goal_type: 'gain',
      rate_kg_per_week: 0.25,
      timezone: 'America/Los_Angeles',
      unit_preference: 'metric',
    });
  });

  it('asks for a weekly pace only when gaining or losing', () => {
    renderScreen();
    expect(screen.queryByText('How fast?')).toBeNull();

    choose('Gain weight');
    expect(screen.getByText('How fast?')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'about 1.5 lb per week' })).toBeNull();

    choose('Lose weight');
    expect(screen.getByRole('radio', { name: 'about 1.5 lb per week' })).toBeTruthy();

    choose('Maintain my weight');
    expect(screen.queryByText('How fast?')).toBeNull();
  });

  it('uses the chosen pace', async () => {
    renderScreen();
    fillInSurvey();
    choose('Kilograms and centimetres'); // already chosen; stays metric
    fireEvent.press(screen.getByRole('radio', { name: '0.5 kg per week' }));

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    await waitFor(() => expect(mockSaveSurvey).toHaveBeenCalled());
    expect(mockSaveSurvey.mock.calls[0][0].rate_kg_per_week).toBe(0.5);
  });

  it('shows the server’s message under the box it is about', async () => {
    mockSaveSurvey.mockRejectedValue(
      new ApiError('Some answers need fixing.', 422, {
        goal_weight_kg: 'to gain weight, the goal weight must be above your current weight',
        birth_date: 'age must be between 18 and 100',
      }),
    );
    renderScreen();
    fillInSurvey();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    expect(await screen.findByText('age must be between 18 and 100')).toBeTruthy();
    expect(
      screen.getByText('to gain weight, the goal weight must be above your current weight'),
    ).toBeTruthy();
  });

  it('shows a network problem as a message and lets the person try again', async () => {
    mockSaveSurvey.mockRejectedValueOnce(new ApiError('Could not reach the server.'));
    const { onSaved } = renderScreen();
    fillInSurvey();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByText('Could not reach the server.')).toBeNull();
  });

  it('ignores a second press while saving', async () => {
    let finish: (saved: ProfileSaved) => void = () => {};
    mockSaveSurvey.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { onSaved } = renderScreen();
    fillInSurvey();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));
    // While saving, the button says "Saving…" and is switched off.
    fireEvent.press(screen.getByRole('button', { name: 'Saving…' }));
    expect(mockSaveSurvey).toHaveBeenCalledTimes(1);

    finish(SAVED);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('converts what was typed when switching units', () => {
    renderScreen();
    choose('Kilograms and centimetres');
    type('Current weight in kilograms', '80');

    choose('Pounds and feet');

    expect(screen.getByLabelText('Current weight in pounds').props.value).toBe('176.4');
  });

  it('offers Cancel only when editing', () => {
    renderScreen();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('cancels editing', () => {
    const onCancel = jest.fn();
    renderScreen({ onCancel });
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
