import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import {
  addLogEntry,
  amountToGrams,
  getMeasures,
  saveFood,
  searchFoods,
  type FoodCandidate,
  type SavedFood,
} from '../../api/food';
import { AddFoodScreen } from './AddFoodScreen';

jest.mock('../../api/food');

const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const BANANA: FoodCandidate = {
  source: 'usda',
  source_id: '173944',
  name: 'Bananas, raw',
  brand: null,
  barcode: null,
  nutrients: { calories: 89, protein_g: 1.1, fat_g: 0.3, carb_g: 22.8 },
  servings: [],
};

const SAVED_BANANA: SavedFood = {
  id: 'food-1',
  name: 'Bananas, raw',
  brand: null,
  nutrients: BANANA.nutrients,
  servings: [{ label: '1 medium (118 g)', grams: 118 }],
};

const mockSearch = jest.mocked(searchFoods);
const mockMeasures = jest.mocked(getMeasures);
const mockSave = jest.mocked(saveFood);
const mockGrams = jest.mocked(amountToGrams);
const mockAdd = jest.mocked(addLogEntry);

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  mockSearch.mockResolvedValue({
    saved: [],
    results: [BANANA],
    sources: [{ name: 'usda', available: true, message: null }],
    has_more: false,
  });
  mockMeasures.mockResolvedValue([
    { label: '1 medium (118 g)', grams: 118 },
    { label: '1 cup, sliced (150 g)', grams: 150 },
  ]);
  mockSave.mockResolvedValue(SAVED_BANANA);
  mockGrams.mockResolvedValue({ grams: 118 });
  mockAdd.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

function renderScreen() {
  const onAdded = jest.fn();
  const onBack = jest.fn();
  render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <AddFoodScreen onAdded={onAdded} onBack={onBack} />
    </SafeAreaProvider>,
  );
  return { onAdded, onBack };
}

async function pause(ms = 500) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function type(label: string, text: string) {
  fireEvent.changeText(screen.getByLabelText(label), text);
  await pause();
}

describe('AddFoodScreen', () => {
  it('searches after a pause in typing, not on every key', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByLabelText('Search foods'), 'b');
    fireEvent.changeText(screen.getByLabelText('Search foods'), 'ba');
    fireEvent.changeText(screen.getByLabelText('Search foods'), 'banana');
    await pause();
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('banana', 1);
    expect(await screen.findByText('Bananas, raw')).toBeTruthy();
    expect(screen.getByText('89 kcal · 1.1 g protein per 100 g')).toBeTruthy();
  });

  it('does not search for a single letter', async () => {
    renderScreen();
    await type('Search foods', 'b');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('finds a food, converts a typed amount and adds it to today', async () => {
    const { onAdded } = renderScreen();
    await type('Search foods', 'banana');
    fireEvent.press(await screen.findByLabelText(/^Bananas, raw/));
    await pause();

    // USDA's own measures arrive as quick amounts, and the first one is already typed in.
    expect(mockMeasures).toHaveBeenCalledWith('usda', '173944');
    expect(await screen.findByLabelText('Use 1 cup, sliced (150 g)')).toBeTruthy();
    await type('Amount', '1 medium banana');
    expect(mockGrams).toHaveBeenLastCalledWith(
      '1 medium banana',
      'Bananas, raw',
      expect.arrayContaining([{ label: '1 medium (118 g)', grams: 118 }]),
    );
    expect(await screen.findByText('105 kcal')).toBeTruthy();
    expect(screen.getByText('118 g of food')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Add to today'));
    await pause(0);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bananas, raw', source: 'usda', source_id: '173944' }),
    );
    expect(mockAdd).toHaveBeenCalledWith('food-1', 118, '1 medium banana');
    expect(onAdded).toHaveBeenCalled();
  });

  it('tapping a quick amount fills the box', async () => {
    renderScreen();
    await type('Search foods', 'banana');
    fireEvent.press(await screen.findByLabelText(/^Bananas, raw/));
    fireEvent.press(await screen.findByLabelText('Use 1 cup, sliced (150 g)'));
    expect(screen.getByLabelText('Amount').props.value).toBe('1 cup, sliced');
  });

  it('shows why an amount could not be worked out and will not add it', async () => {
    mockGrams.mockRejectedValue(
      new ApiError("I don't know how heavy this food is per cup or spoon.", 422, {}, 'unknown_density'),
    );
    const { onAdded } = renderScreen();
    await type('Search foods', 'banana');
    fireEvent.press(await screen.findByLabelText(/^Bananas, raw/));
    await type('Amount', '1 cup');
    expect(await screen.findByText(/don't know how heavy/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Add to today'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('logs a saved food without saving it again', async () => {
    mockSearch.mockResolvedValue({ saved: [SAVED_BANANA], results: [], sources: [], has_more: false });
    const { onAdded } = renderScreen();
    await type('Search foods', 'banana');
    fireEvent.press(await screen.findByLabelText(/^Bananas, raw/));
    await pause();
    fireEvent.press(await screen.findByLabelText('Add to today'));
    await pause(0);
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledWith('food-1', 118, '1 medium');
    expect(onAdded).toHaveBeenCalled();
  });

  it('mentions a food database that is down but keeps the other results', async () => {
    mockSearch.mockResolvedValue({
      saved: [],
      results: [BANANA],
      sources: [{ name: 'off', available: false, message: 'Open Food Facts had a problem.' }],
      has_more: false,
    });
    renderScreen();
    await type('Search foods', 'banana');
    expect(await screen.findByText('Open Food Facts had a problem.')).toBeTruthy();
    expect(screen.getByText('Bananas, raw')).toBeTruthy();
  });

  it('says so when nothing is found', async () => {
    mockSearch.mockResolvedValue({ saved: [], results: [], sources: [], has_more: false });
    renderScreen();
    await type('Search foods', 'zzzz');
    expect(await screen.findByText('Nothing found. Try other words.')).toBeTruthy();
  });

  it('shows the error when the search fails', async () => {
    mockSearch.mockRejectedValue(new ApiError('Could not reach the server.'));
    renderScreen();
    await type('Search foods', 'banana');
    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
  });

  it('adds a food by hand from the label numbers, then asks how much', async () => {
    mockSave.mockResolvedValue({
      id: 'food-2',
      name: 'Granola',
      brand: null,
      nutrients: { calories: 450 },
      servings: [{ label: '1 serving', grams: 40 }],
    });
    mockGrams.mockResolvedValue({ grams: 40 });
    const { onAdded } = renderScreen();
    await type('Search foods', 'granola');
    fireEvent.press(screen.getByLabelText('Add a food by hand'));

    // The name carries over from what was searched for.
    expect(screen.getByLabelText('Name').props.value).toBe('granola');
    fireEvent.changeText(screen.getByLabelText('Name'), 'Granola');
    fireEvent.changeText(screen.getByLabelText('Serving size in grams'), '40');
    fireEvent.changeText(screen.getByLabelText('Calories per serving'), '180');
    fireEvent.press(screen.getByLabelText('Save and continue'));
    await pause(0);

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Granola',
        source: 'manual',
        servings: [{ label: '1 serving', grams: 40 }],
      }),
    );
    expect(mockSave.mock.calls[0][0].nutrients.calories).toBeCloseTo(450);
    await pause();
    fireEvent.press(await screen.findByLabelText('Add to today'));
    await pause(0);
    expect(mockAdd).toHaveBeenCalledWith('food-2', 40, '1 serving');
    expect(onAdded).toHaveBeenCalled();
  });

  it('will not save a hand-typed food that is missing its numbers', async () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Add a food by hand'));
    fireEvent.changeText(screen.getByLabelText('Name'), 'Mystery');
    fireEvent.press(screen.getByLabelText('Save and continue'));
    expect(await screen.findByText(/serving size in grams/i)).toBeTruthy();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('goes back', () => {
    const { onBack } = renderScreen();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('lets someone correct a wrong database entry, then logs their copy', async () => {
    const wrong: FoodCandidate = {
      ...BANANA,
      name: 'Nut Butter Bar',
      source_id: '9',
      nutrients: { calories: 511.1, protein_g: 19, fat_g: 30, carb_g: 40 },
      servings: [{ label: '1 bar (50 g)', grams: 50 }],
    };
    mockSearch.mockResolvedValue({ saved: [], results: [wrong], sources: [], has_more: false });
    mockMeasures.mockResolvedValue([]);
    mockSave.mockResolvedValue({
      id: 'food-9',
      name: 'Nut Butter Bar',
      brand: null,
      nutrients: { calories: 382.4, protein_g: 16.2 },
      servings: [{ label: '1 bar', grams: 68 }],
    });
    mockGrams.mockResolvedValue({ grams: 68 });
    const { onAdded } = renderScreen();
    await type('Search foods', 'nut butter');
    fireEvent.press(await screen.findByLabelText(/^Nut Butter Bar/));
    await pause();
    fireEvent.press(screen.getByLabelText('These numbers are wrong: fix them'));

    // The form starts from the database's numbers for one serving.
    expect(screen.getByText('Correct the numbers')).toBeTruthy();
    expect(screen.getByLabelText('Serving size in grams').props.value).toBe('50');
    expect(screen.getByLabelText('Protein in grams').props.value).toBe('9.5');
    fireEvent.changeText(screen.getByLabelText('Serving size in grams'), '68');
    fireEvent.changeText(screen.getByLabelText('Calories per serving'), '260');
    fireEvent.changeText(screen.getByLabelText('Protein in grams'), '11');
    fireEvent.press(screen.getByLabelText('Save and continue'));
    await pause(0);

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', servings: [{ label: '1 bar', grams: 68 }] }),
    );
    expect(mockSave.mock.calls[0][0].nutrients.protein_g).toBeCloseTo(16.18, 1);
    await pause();
    fireEvent.press(await screen.findByLabelText('Add to today'));
    await pause(0);
    expect(mockAdd).toHaveBeenCalledWith('food-9', 68, '1 bar');
    expect(onAdded).toHaveBeenCalled();
  });
});
