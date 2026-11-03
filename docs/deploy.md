# Putting the backend online (free): Render + Neon

Goal: the app works on your phone anywhere, with your computer off. The backend runs on Render
(free web service), the database on Neon (free Postgres), and the app finds the server through
one setting.

**What to expect.** Render's free service falls asleep after 15 minutes without traffic and takes
up to about a minute to wake, so the first open after a quiet spell is slow (the app says so).
Render also says its free tier is not meant for production. That is fine for one person. Free
limits change, so check the Render and Neon pricing pages if something looks different.

## 1. Create the database (Neon)

1. Sign up at neon.com (free plan).
2. Create a project named `nutrientlog`.
3. On the project's dashboard, open **Connect** and turn **Connection pooling off** to get the
   **direct** address. Copy the connection string; it starts with `postgresql://` and ends with
   `?sslmode=require`. The server accepts it as it is.
4. Keep it private: it contains the password. Never put it in the repository or in a chat.

## 2. Create the server (Render)

1. Push the latest code to GitHub first (this change set adds `render.yaml`).
2. Sign up at render.com (free; no card should be needed to start).
3. **New > Blueprint**, connect your GitHub account, pick the `NutrientLog` repository. Render
   reads `render.yaml` and proposes one free web service, `nutrientlog-api`.
4. When asked for values, paste:
   - `DATABASE_URL`: the Neon string from step 1.
   - `USDA_API_KEY`: the same free key you use in `.env` (leave empty to turn USDA search off).
5. Click **Apply**. The first build takes several minutes. It applies the database migrations
   and starts the API by itself.
6. When it says **Live**, copy the address at the top of the service page. It looks like
   `https://nutrientlog-api.onrender.com`.

## 3. Check it works (from any browser)

- `https://YOUR-ADDRESS/health` shows `{"status":"ok"}`. (The first visit may take a minute.)
- `https://YOUR-ADDRESS/health/db` shows `"database":"reachable"`.
- If `/health/db` fails, the Neon address in `DATABASE_URL` is wrong or incomplete. Fix it under
  the service's **Environment** tab; Render redeploys.

## 4. Point the app at it

In the `mobile` folder, create a file named `.env` (git ignores it) containing one line:

```
EXPO_PUBLIC_API_URL=https://YOUR-ADDRESS
```

No slash at the end. Restart Expo with `npx expo start -c`. The phone now talks to the hosted
server, not your computer. (Delete the line to go back to your own computer.)

Your local database and the hosted one are separate, so you start with a fresh survey on the
hosted one. The app clears its old login by itself when the server does not know it.

## 5. Using it without your computer

The server part is now online. The other half is how the app itself reaches the phone, because
Expo Go normally loads it from your computer. We are testing two free ways (nothing is decided):

- **EAS Update into Expo Go.** Publishes the app's code to Expo's servers, and Expo Go opens it
  from there. Needs a free Expo account. Steps will be given after step 3 works.
- **A home-screen web app.** The same app as a website you add to your home screen.

Do steps 1 to 4 first; they are needed for both.

## Free-host limits and safety (one-person setup)

- The server accepts at most **25 users in total** (`accounts.max_users` in
  `backend/config.toml`), so a stranger who finds the address cannot fill the free database.
  Raise it when friends join, after the v0.9 hardening list is done.
- Only your phone has your login token. Anyone with the web address can see `/docs` and create
  users up to that limit, but cannot read your data without your token.
- Neon's free database sleeps when idle and wakes in under a second.
- Do not put the Neon address, the USDA key or any token in the repository. They belong only in
  Render's dashboard.
