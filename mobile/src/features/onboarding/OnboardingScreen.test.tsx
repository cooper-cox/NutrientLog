import sharedCases from '../../../../shared/profile_check_cases.json';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import { getLimits, type Limits , ProfileSaved } from '../../api/endpoints';
import { OnboardingScreen } from './OnboardingScreen';
import { saveSurvey } from './saveSurvey';

jest.mock('./saveSurvey');
jest.mock('../../api/endpoints');
jest.mock('../../lib/timezone', () => ({ getTimeZone: () => 'America/Los_Angeles' }));

const mockSaveSurvey = jest.mocked(saveSurvey);
const mockGetLimits = jest.mocked(getLimits);

// The same numbers the server reports (shared with the server's own tests).
const LIMITS = sharedCases.limits as Limits;
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
  // By default the limits never arrive, so nothing changes after a test has finished.
  mockGetLimits.mockReturnValue(new Promise(() => {}));
});

/** Lets the server's limits arrive before the test carries on. */
const limitsArrive = () => act(async () => {});

/** Shows the screen with the server's limits already loaded. */
async function renderWithLimits() {
  mockGetLimits.mockResolvedValue(LIMITS);
  const shown = renderScreen();
  await limitsArrive();
  return shown;
}

function leave(label: string) {
  fireEvent(screen.getByLabelText(label), 'blur');
}

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

    expect(screen.getByText('6 answers need fixing. They are marked in red.')).toBeTruthy();
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
        goal_weight_kg: 'To gain weight, the goal weight must be above your current weight.',
        birth_date: 'Please check your birth date: we support ages up to 100.',
      }),
    );
    renderScreen();
    fillInSurvey();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    expect(
      await screen.findByText('Please check your birth date: we support ages up to 100.'),
    ).toBeTruthy();
    expect(
      screen.getByText('To gain weight, the goal weight must be above your current weight.'),
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

describe('checking answers as they are typed', () => {
  it('shows a problem when the person leaves the box, not only when they press the button', async () => {
    await renderWithLimits();
    choose('Pounds and feet');
    type('Current weight in pounds', '9999');
    expect(screen.queryByText(/Weight must be between/)).toBeNull();

    leave('Current weight in pounds');

    expect(screen.getByText('Weight must be between 70 lb and 660 lb.')).toBeTruthy();
    expect(mockSaveSurvey).not.toHaveBeenCalled();
  });

  it('words height and weight problems in the units that were chosen', async () => {
    await renderWithLimits();

    choose('Pounds and feet');
    type('Height, feet', '9');
    leave('Height, feet');
    expect(screen.getByText('Height must be between 3 ft 6 in and 8 ft.')).toBeTruthy();

    choose('Kilograms and centimetres');
    type('Height in centimetres', '300');
    leave('Height in centimetres');
    expect(screen.getByText('Height must be between 100 cm and 250 cm.')).toBeTruthy();
  });

  it('does not complain about a half-typed birth date', async () => {
    await renderWithLimits();

    type('Birth month', '1');
    leave('Birth month');
    expect(screen.queryByText(/4-digit year|does not exist|must be 18/)).toBeNull();

    type('Birth day', '1');
    type('Birth year', '2015');
    leave('Birth year');
    expect(screen.getByText('NutrientLog is for adults: you must be 18 or older.')).toBeTruthy();
  });

  it('shows every problem at once when the button is pressed', async () => {
    await renderWithLimits();
    choose('Pounds and feet');
    choose('Male');
    type('Birth month', '1');
    type('Birth day', '1');
    type('Birth year', '2015');
    type('Height, feet', '9');
    type('Current weight in pounds', '9999');
    type('Goal weight in pounds', '1100');
    choose('Moderately active');
    choose('Gain weight');

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    expect(screen.getByText('4 answers need fixing. They are marked in red.')).toBeTruthy();
    expect(screen.getByText('NutrientLog is for adults: you must be 18 or older.')).toBeTruthy();
    expect(screen.getByText('Height must be between 3 ft 6 in and 8 ft.')).toBeTruthy();
    expect(screen.getAllByText('Weight must be between 70 lb and 660 lb.')).toHaveLength(1);
    expect(screen.getByText('Goal weight must be between 70 lb and 660 lb.')).toBeTruthy();
    expect(mockSaveSurvey).not.toHaveBeenCalled();
  });

  it('rejects an absurdly low weight for the height', async () => {
    await renderWithLimits();
    fillInSurvey();
    type('Height in centimetres', '183');
    type('Current weight in kilograms', '36');

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    expect(screen.getByText(/don't look right together/)).toBeTruthy();
    expect(mockSaveSurvey).not.toHaveBeenCalled();
  });

  it('updates the goal weight problem when the goal changes', async () => {
    await renderWithLimits();
    fillInSurvey();
    type('Goal weight in kilograms', '70'); // below 80 kg, but the goal is to gain
    leave('Goal weight in kilograms');
    expect(
      screen.getByText('To gain weight, the goal weight must be above your current weight.'),
    ).toBeTruthy();

    choose('Lose weight');

    expect(screen.queryByText(/must be above your current weight/)).toBeNull();
  });

  it('clears a problem as soon as it is fixed', async () => {
    await renderWithLimits();
    choose('Kilograms and centimetres');
    type('Current weight in kilograms', '5');
    leave('Current weight in kilograms');
    expect(screen.getByText('Weight must be between 30 kg and 300 kg.')).toBeTruthy();

    type('Current weight in kilograms', '80');

    expect(screen.queryByText(/Weight must be between/)).toBeNull();
  });

  it('still lets the server decide if the limits could not be fetched', async () => {
    mockGetLimits.mockRejectedValue(new ApiError('Could not reach the server.'));
    renderScreen();
    await limitsArrive();
    fillInSurvey();
    type('Current weight in kilograms', '500');

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));

    await waitFor(() => expect(mockSaveSurvey).toHaveBeenCalled());
    expect(mockSaveSurvey.mock.calls[0][0].weight_kg).toBe(500);
  });

  it('clears the server’s message once an answer is changed', async () => {
    mockSaveSurvey.mockRejectedValue(
      new ApiError('Some answers need fixing.', 422, { name: 'Something about the name.' }),
    );
    await renderWithLimits();
    fillInSurvey();
    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));
    expect(await screen.findByText('Something about the name.')).toBeTruthy();

    type('Your name', 'Coop');

    expect(screen.queryByText('Something about the name.')).toBeNull();
  });

  it('does not show a problem while the person is still typing in the box', async () => {
    await renderWithLimits();
    choose('Pounds and feet');
    fireEvent(screen.getByLabelText('Current weight in pounds'), 'focus');
    type('Current weight in pounds', '9999');
    expect(screen.queryByText(/Weight must be between/)).toBeNull();

    // Even if they have been to the box before, editing it again hides the problem.
    leave('Current weight in pounds');
    expect(screen.getByText('Weight must be between 70 lb and 660 lb.')).toBeTruthy();
    fireEvent(screen.getByLabelText('Current weight in pounds'), 'focus');
    type('Current weight in pounds', '1');
    expect(screen.queryByText(/Weight must be between/)).toBeNull();
    leave('Current weight in pounds');
    expect(screen.getByText('Weight must be between 70 lb and 660 lb.')).toBeTruthy();
  });

  it('points out a bad birth month as soon as that box is left', async () => {
    await renderWithLimits();
    fireEvent(screen.getByLabelText('Birth month'), 'focus');
    type('Birth month', '90');
    expect(screen.queryByText('The month must be from 1 to 12.')).toBeNull();

    leave('Birth month');
    expect(screen.getByText('The month must be from 1 to 12.')).toBeTruthy();

    // Moving on to the next box does not make it disappear; fixing it does.
    fireEvent(screen.getByLabelText('Birth day'), 'focus');
    expect(screen.getByText('The month must be from 1 to 12.')).toBeTruthy();
    type('Birth month', '9');
    expect(screen.queryByText('The month must be from 1 to 12.')).toBeNull();
  });

  it('points out a bad birth day and year when each is left', async () => {
    await renderWithLimits();
    type('Birth day', '45');
    leave('Birth day');
    expect(screen.getByText('The day must be from 1 to 31.')).toBeTruthy();
    type('Birth day', '4');
    type('Birth year', '19');
    leave('Birth year');
    expect(screen.getByText('Enter a 4-digit year.')).toBeTruthy();
  });

  it('only says the birth date is incomplete after the button is pressed', async () => {
    await renderWithLimits();
    type('Birth month', '1');
    leave('Birth month');
    type('Birth day', '2');
    leave('Birth day');
    expect(screen.queryByText(/4-digit year/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Calculate my targets' }));
    expect(
      screen.getAllByText('Enter your birth date as month, day and a 4-digit year.').length,
    ).toBeGreaterThan(0);
  });

  it('warns when the limits could not be loaded, after a few tries', async () => {
    jest.useFakeTimers();
    try {
      mockGetLimits.mockRejectedValue(new ApiError('Could not reach the server.'));
      renderScreen();
      await limitsArrive();
      expect(screen.queryByText(/Couldn’t load the answer limits/)).toBeNull();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });

      expect(mockGetLimits).toHaveBeenCalledTimes(3);
      expect(screen.getByText(/Couldn’t load the answer limits/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps trying and uses the limits if a retry succeeds', async () => {
    jest.useFakeTimers();
    try {
      mockGetLimits.mockRejectedValueOnce(new ApiError('Could not reach the server.'));
      mockGetLimits.mockResolvedValue(LIMITS);
      renderScreen();
      await limitsArrive();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      choose('Kilograms and centimetres');
      type('Current weight in kilograms', '5');
      leave('Current weight in kilograms');

      expect(screen.getByText('Weight must be between 30 kg and 300 kg.')).toBeTruthy();
      expect(screen.queryByText(/Couldn’t load the answer limits/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('limits the length of number boxes and drops anything that is not part of a number', async () => {
    renderScreen();
    choose('Kilograms and centimetres');

    expect(screen.getByLabelText('Current weight in kilograms').props.maxLength).toBe(5);
    expect(screen.getByLabelText('Goal weight in kilograms').props.maxLength).toBe(5);
    expect(screen.getByLabelText('Height in centimetres').props.maxLength).toBe(5);

    type('Current weight in kilograms', '8a0,5.5');
    expect(screen.getByLabelText('Current weight in kilograms').props.value).toBe('80.55');
  });
});
