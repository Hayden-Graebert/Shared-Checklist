# Deploy with GitHub to the existing Vercel site

1. Create a GitHub repository (private recommended). Upload the *contents* of `together-checklist`, with `index.html` at the repository root. You can omit `supabase.sql` and `README.md` if you prefer; never upload secret/service-role keys.
2. Open your **existing** Vercel project (not New Project), then **Settings → Git** and connect that repository. Authorize the Vercel GitHub app if asked. Choose the `main` branch as the production branch.
3. Verify **Settings → General → Root Directory** is `./` if `index.html` is at the repo root. Use Framework Preset `Other`, with no build command for this static site.
4. Open **Deployments** and check that the Git-based deployment succeeds. If a deployment is not triggered automatically, push a small commit or use **Create Deployment** from the Git branch.
5. Open the original production domain in **Settings → Domains** and verify it still points to this project. Test the checklist and share link.
6. For future updates, replace changed files in GitHub and commit to `main`. Vercel should automatically deploy changes to the same project/domain.

No new Supabase SQL is required for the activity filters, sorting or moon image.
