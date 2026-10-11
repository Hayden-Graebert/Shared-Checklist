# Together Checklist

A shared checklist for two friends.

## What it includes

- Custom checklist name
- Add, complete, and delete activities
- Shared cloud persistence with Supabase
- Automatic syncing between browsers
- Light/dark theme toggle (saved per browser)
- A canvas fireworks celebration whenever an activity is completed
- Share links containing a private random invite code
- Guest mode with optional email/password account upgrade
- "My checklists" for signed-in users
- Delete checklists you created, with a confirmation prompt (permanently removes their activities and shared access)

The fireworks are an original canvas particle effect rather than a copy of copyrighted Star Wars footage.

## Supabase setup

### 1. Authentication

In the Supabase dashboard, under **Authentication -> Providers / Auth Providers**:

- **Email:** enabled
- **Anonymous Sign-Ins:** enabled
- **Confirm email:** off for the simplest initial setup
- **Secure password change:** off is fine for this project
- CAPTCHA: leave off while testing

The site uses anonymous sessions for guests. When a guest chooses **Create account**, the site upgrades that same anonymous Supabase user with an email/password. This means an existing guest checklist can remain attached to the same user ID instead of being lost.

### 2. Database

Open **SQL Editor**, paste the entire `supabase.sql` file, and run it.

The SQL creates/updates the tables, RLS policies, checklist functions, and realtime configuration. It is written so it can also be run after the original anonymous-only SQL.

### 3. Project keys

Open `app.js` and check:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";
```

Use your Supabase Project URL and browser-safe publishable/anon key.

Never put a `service_role` or secret key in `app.js`.

## Local testing

Serve this folder with a static web server, for example:

```bash
python -m http.server 8000
```

Then open:

http://localhost:8000

Test this flow:

1. Create a checklist as a guest.
2. Add an activity.
3. Enter an email and password and choose **Create account**.
4. Confirm that the checklist remains available under **My checklists**.
5. Close/reopen the site and confirm the account session/checklist is still available.
6. Open the share link in another browser/device and confirm both users can see changes.
7. Log out and log back in with the email/password account.

## Deploying to Vercel

Vercel can host this static project. Supabase remains the database and authentication provider.

A simple deployment is:

1. Put the project in a GitHub repository.
2. Import the repository into Vercel.
3. Deploy it as a static site.
4. After deployment, add the Vercel site URL to Supabase's Authentication URL configuration / Site URL settings so authentication works correctly on the live domain.

For example, your live site may look like:

`https://your-project.vercel.app`

## Important

The publishable/anon key belongs in browser code. A Supabase secret/service-role key does not.

If you later turn on email confirmation, the account flow will need to account for the confirmation step.

## Delete a checklist

1. Run the updated `supabase.sql` in the Supabase SQL Editor **once** to install the creator-only `delete_list` function. The SQL is safe to rerun against the existing database and does not erase existing checklists.
2. Replace the site files with this version (or redeploy to Vercel).
3. Log in, open **My checklists**, and choose **Delete** beside a checklist you created.
4. Confirm the warning. The checklist, its activities, and its memberships will be permanently removed for everyone who shared it.

Only the original checklist creator sees the Delete button. Other members can still open and edit shared checklists. If an old checklist was created under a different anonymous account that was not upgraded, your current account will not be able to delete it.
