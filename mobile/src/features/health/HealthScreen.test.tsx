import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../../api/client';
import { getDatabaseHealth, getHealth } from '../../api/health';
import { HealthScreen } from './HealthScreen';
import { useServerHealth } from './useServerHealth';

jest.mock('../../api/health');
jest.mock('../../config', () => ({ getApiBaseUrl: () => 'http://192.168.1.5:8000' }));

const mockGetHealth = jest.mocked(getHealth);
const mockGetDatabaseHealth = jest.mocked(getDatabaseHealth);

// Pretend to be an iPhone with a notch so the safe-area code has something to work with.
const PHONE = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <HealthScreen />
    </SafeAreaProvider>,
  );
}

function neverAnswers<T>(): Promise<T> {
  return new Promise<T>(() => {});
}

beforeEach(() => {
  jest.resetAllMocks();
  mockGetHealth.mockResolvedValue({ status: 'ok' });
  mockGetDatabaseHealth.mockResolvedValue({ status: 'ok', database: 'reachable' });
});

describe('HealthScreen', () => {
  it('shows that it is checking, then that everything is OK', async () => {
    renderScreen();

    expect(screen.getAllByText('Checking…').length).toBeGreaterThan(0);

    expect(await screen.findByText('OK (ok)')).toBeTruthy();
    expect(screen.getByText('OK (reachable)')).toBeTruthy();
    expect(screen.queryByText(/same Wi-Fi/)).toBeNull();
  });

  it('shows which server address it is using', async () => {
    renderScreen();
    await screen.findByText('OK (ok)');
    expect(screen.getByText('Server address: http://192.168.1.5:8000')).toBeTruthy();
  });

  it('explains what to check when the server cannot be reached', async () => {
    mockGetHealth.mockRejectedValue(new ApiError('Could not reach the server.'));
    mockGetDatabaseHealth.mockRejectedValue(new ApiError('Could not reach the server.'));

    renderScreen();

    expect(await screen.findAllByText('Problem: Could not reach the server.')).toHaveLength(2);
    expect(screen.getByText(/same Wi-Fi/)).toBeTruthy();
  });

  it('shows a problem with only the database when the API itself is fine', async () => {
    mockGetDatabaseHealth.mockRejectedValue(
      new ApiError('The server returned an error (503).', 503),
    );

    renderScreen();

    expect(await screen.findByText('OK (ok)')).toBeTruthy();
    expect(screen.getByText('Problem: The server returned an error (503).')).toBeTruthy();
  });

  it('recovers when "Check again" is pressed after the server comes back', async () => {
    mockGetHealth.mockRejectedValueOnce(new ApiError('Could not reach the server.'));
    mockGetDatabaseHealth.mockRejectedValueOnce(new ApiError('Could not reach the server.'));

    renderScreen();
    await screen.findAllByText('Problem: Could not reach the server.');

    fireEvent.press(screen.getByRole('button', { name: 'Check again' }));

    expect(await screen.findByText('OK (ok)')).toBeTruthy();
    expect(screen.getByText('OK (reachable)')).toBeTruthy();
    expect(screen.queryByText(/Problem/)).toBeNull();
    expect(mockGetHealth).toHaveBeenCalledTimes(2);
  });

  it('ignores presses on the button while a check is already running', () => {
    mockGetHealth.mockReturnValue(neverAnswers());
    mockGetDatabaseHealth.mockReturnValue(neverAnswers());

    renderScreen();
    fireEvent.press(screen.getByRole('button'));
    fireEvent.press(screen.getByRole('button'));

    expect(mockGetHealth).toHaveBeenCalledTimes(1);
  });
});

describe('useServerHealth', () => {
  it('ignores a slow answer from an older check once a newer check has finished', async () => {
    let failOldCheck: (reason: Error) => void = () => {};
    mockGetHealth.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failOldCheck = reject;
      }),
    );
    mockGetDatabaseHealth.mockReturnValueOnce(neverAnswers());

    const { result } = renderHook(() => useServerHealth());
    expect(result.current.isChecking).toBe(true);

    // A second check starts and finishes first...
    await act(async () => {
      result.current.refresh();
    });
    expect(result.current.api).toEqual({ kind: 'ok', detail: 'ok' });

    // ...then the first, slower check finally fails. That stale failure must not show.
    await act(async () => {
      failOldCheck(new Error('stale failure'));
    });
    expect(result.current.api).toEqual({ kind: 'ok', detail: 'ok' });
  });

  it('does not update after the screen is closed', async () => {
    let answerLate: (value: { status: string }) => void = () => {};
    mockGetHealth.mockReturnValue(
      new Promise((resolve) => {
        answerLate = resolve;
      }),
    );
    mockGetDatabaseHealth.mockReturnValue(neverAnswers());
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useServerHealth());
    unmount();
    await act(async () => {
      answerLate({ status: 'ok' });
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
