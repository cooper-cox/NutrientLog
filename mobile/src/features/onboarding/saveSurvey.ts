import { ApiError } from '../../api/client';
import { createUser, type ProfileIn, type ProfileSaved, saveProfile } from '../../api/users';
import { clearStoredToken, getStoredToken, storeToken } from '../../storage/token';

async function registerNewUser(): Promise<string> {
  const { token } = await createUser();
  await storeToken(token);
  return token;
}

/**
 * Saves the survey answers for this phone's user, creating the user the first time.
 *
 * If the server no longer knows the saved token (for example the development database was
 * wiped), a new user is created and the save is tried once more, so the person isn't stuck.
 */
export async function saveSurvey(answers: ProfileIn): Promise<ProfileSaved> {
  const token = (await getStoredToken()) ?? (await registerNewUser());
  try {
    return await saveProfile(token, answers);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearStoredToken();
      return saveProfile(await registerNewUser(), answers);
    }
    throw error;
  }
}
