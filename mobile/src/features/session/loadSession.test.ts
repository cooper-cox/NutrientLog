import { ApiError } from '../../api/client';
import { getCurrentGoal, getProfile, type Goal, type Profile } from '../../api/users';
import { clearStoredToken, getStoredToken } from '../../storage/token';
import { loadSession } from './loadSession';

jest.mock('../../api/users');
jest.mock('../../storage/token');

const mockGetToken = jest.mocked(getStoredToken);
const mockClearToken = jest.mocked(clearStoredToken);
const mockGetProfile = jest.mocked(getProfile);
const mockGetGoal = jest.mocked(getCurrentGoal);

const PROFILE = { sex: 'male' } as Profile;
const GOAL = { calories: 3034 } as Goal;

beforeEach(() => {
  jest.resetAllMocks();
  mockGetToken.mockResolvedValue('token');
  mockGetProfile.mockResolvedValue(PROFILE);
  mockGetGoal.mockResolvedValue(GOAL);
});

describe('loadSession', () => {
  it('asks for the survey when there is no saved login', async () => {
    mockGetToken.mockResolvedValue(null);
    await expect(loadSession()).resolves.toEqual({ kind: 'needs-survey' });
    expect(mockGetProfile).not.toHaveBeenCalled();
  });

  it('shows the results when the survey is already done', async () => {
    await expect(loadSession()).resolves.toEqual({ kind: 'ready', profile: PROFILE, goal: GOAL });
    expect(mockGetProfile).toHaveBeenCalledWith('token');
  });

  it('asks for the survey when the server has a user but no profile yet', async () => {
    mockGetProfile.mockRejectedValue(new ApiError('x', 404));
    await expect(loadSession()).resolves.toEqual({ kind: 'needs-survey' });
    expect(mockClearToken).not.toHaveBeenCalled();
  });

  it('forgets a login the server does not recognise', async () => {
    mockGetProfile.mockRejectedValue(new ApiError('x', 401));
    await expect(loadSession()).resolves.toEqual({ kind: 'needs-survey' });
    expect(mockClearToken).toHaveBeenCalled();
  });

  it('keeps the login and shows an error when the server cannot be reached', async () => {
    mockGetProfile.mockRejectedValue(new ApiError('Could not reach the server.'));
    await expect(loadSession()).resolves.toEqual({
      kind: 'error',
      message: 'Could not reach the server.',
    });
    expect(mockClearToken).not.toHaveBeenCalled();
  });
});
