import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Goal, Profile } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { deleteLogEntry, getDay, type Day } from '../../api/food';
import { HomeScreen } from './HomeScreen';

jest.mock('../../api/food');

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PROFILE = { name: 'Cooper' } as Profile;
const GOAL = { calories: 3034, protein_g: 144, fat_g: 84, carb_g: 425 } as Goal;

const DAY: Day = {
  date: '2026-10-18',
  entries: [
    {
      id: 'e1',
      food_id: 'f1',
      food_name: 'Bananas, raw',
      brand: null,
      logged_on: '2026-10-18',
      grams: 118,
      amount_text: '1 medium',
      nutrients: { calories: 105 },
    },
  ],
  totals: { calories: 105, protein_g: 1.3, fat_g: 0.4, carb_g: 27 },
  goal_calories: 3034,
  remaining_calories: 2929,
};

const mockDay = jest.mocked(getDay);
const mockDelete = jest.mocked(deleteLogEntry);

beforeEach(() => {
  jest.resetAllMocks();
  mockDay.mockResolvedValue(DAY);
  mockDelete.mockResolvedValue(undefined);
});

function renderHome(reloadKey = 0) {
  const onAddFood = jest.fn();
  const onShowTargets = jest.fn();
  const view = render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <HomeScreen
        profile={PROFILE}
        goal={GOAL}
        reloadKey={reloadKey}
        onAddFood={onAddFood}
        onShowTargets={onShowTargets}
      />
    </SafeAreaProvider>,
  );
  return { onAddFood, onShowTargets, view };
}

describe('HomeScreen', () => {
  it('shows calories left, what was eaten and the macros so far', async () => {
    renderHome();
    expect(await screen.findByLabelText('2929 calories left')).toBeTruthy();
    expect(screen.getByText('Eaten 105 kcal of 3034 kcal')).toBeTruthy();
    expect(screen.getByText('Protein 1 / 144 g')).toBeTruthy();
    expect(screen.getByText('Bananas, raw')).toBeTruthy();
    expect(screen.getByText('1 medium · 105 kcal')).toBeTruthy();
  });

  it('shows how far over the target someone is', async () => {
    mockDay.mockResolvedValue({ ...DAY, remaining_calories: -120 });
    renderHome();
    expect(await screen.findByLabelText('120 calories over')).toBeTruthy();
    expect(screen.getByText('calories over your target')).toBeTruthy();
  });

  it('invites the first entry on an empty day', async () => {
    mockDay.mockResolvedValue({ ...DAY, entries: [], totals: {}, remaining_calories: 3034 });
    renderHome();
    expect(await screen.findByText(/Nothing yet/)).toBeTruthy();
    expect(screen.getByLabelText('3034 calories left')).toBeTruthy();
  });

  it('removes an entry and reloads today', async () => {
    renderHome();
    fireEvent.press(await screen.findByLabelText('Remove Bananas, raw'));
    await act(async () => {});
    expect(mockDelete).toHaveBeenCalledWith('e1');
    expect(mockDay).toHaveBeenCalledTimes(2);
  });

  it('reloads when something was added', async () => {
    const { view } = renderHome(0);
    await screen.findByLabelText('2929 calories left');
    view.rerender(
      <SafeAreaProvider initialMetrics={PHONE}>
        <HomeScreen
          profile={PROFILE}
          goal={GOAL}
          reloadKey={1}
          onAddFood={jest.fn()}
          onShowTargets={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    await act(async () => {});
    expect(mockDay).toHaveBeenCalledTimes(2);
  });

  it('shows an error with a way to try again', async () => {
    mockDay.mockRejectedValueOnce(new ApiError('Could not reach the server.'));
    renderHome();
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(await screen.findByLabelText('2929 calories left')).toBeTruthy();
  });

  it('opens the add-food and targets screens', async () => {
    const { onAddFood, onShowTargets } = renderHome();
    await screen.findByLabelText('2929 calories left');
    fireEvent.press(screen.getByLabelText('Add food'));
    fireEvent.press(screen.getByLabelText('My targets and answers'));
    expect(onAddFood).toHaveBeenCalled();
    expect(onShowTargets).toHaveBeenCalled();
  });
});
