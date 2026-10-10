import { ApiError } from '../../api/client';
import { createUser, type ProfileIn, type ProfileSaved, saveProfile } from '../../api/users';
import { clearStoredToken, getStoredToken, storeToken } from '../../storage/token';
import { saveSurvey } from './saveSurvey';

jest.mock('../../api/users');
jest.mock('../../storage/token');

const mockCreateUser = jest.mocked(createUser);
const mockSaveProfile = jest.mocked(saveProfile);
const mockGetToken = jest.mocked(getStoredToken);
const mockStoreToken = jest.mocked(storeToken);
const mockClearToken = jest.mocked(clearStoredToken);

const ANSWERS = { height_cm: 180 } as ProfileIn;
const SAVED = { goal: { calories: 3000 } } as ProfileSaved;

beforeEach(() => {
  jest.resetAllMocks();
  mockSaveProfile.mockResolvedValue(SAVED);
  mockCreateUser.mockResolvedValue({ user_id: 'u1', token: 'new-token' });
});

describe('saveSurvey', () => {
  it('creates and remembers a user the first time', async () => {
    mockGetToken.mockResolvedValue(null);

    await expect(saveSurvey(ANSWERS)).resolves.toBe(SAVED);

    expect(mockStoreToken).toHaveBeenCalledWith('new-token');
    expect(mockSaveProfile).toHaveBeenCalledWith('new-token', ANSWERS);
  });

  it('reuses the saved login afterwards', async () => {
    mockGetToken.mockResolvedValue('old-token');

    await saveSurvey(ANSWERS);

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockSaveProfile).toHaveBeenCalledWith('old-token', ANSWERS);
  });

  it('starts over with a new user if the server no longer knows the login', async () => {
    mockGetToken.mockResolvedValue('stale-token');
    mockSaveProfile.mockRejectedValueOnce(new ApiError('nope', 401));

    await expect(saveSurvey(ANSWERS)).resolves.toBe(SAVED);

    expect(mockClearToken).toHaveBeenCalled();
    expect(mockStoreToken).toHaveBeenCalledWith('new-token');
    expect(mockSaveProfile).toHaveBeenLastCalledWith('new-token', ANSWERS);
    expect(mockSaveProfile).toHaveBeenCalledTimes(2);
  });

  it('does not loop if the new login is refused too', async () => {
    mockGetToken.mockResolvedValue('stale-token');
    mockSaveProfile.mockRejectedValue(new ApiError('nope', 401));

    await expect(saveSurvey(ANSWERS)).rejects.toBeInstanceOf(ApiError);
    expect(mockSaveProfile).toHaveBeenCalledTimes(2);
  });

  it('passes other problems on without touching the login', async () => {
    mockGetToken.mockResolvedValue('token');
    mockSaveProfile.mockRejectedValue(new ApiError('Could not reach the server.'));

    await expect(saveSurvey(ANSWERS)).rejects.toThrow('Could not reach the server.');
    expect(mockClearToken).not.toHaveBeenCalled();
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});
