# Connect to your GitHub

## First-time push (manual)
1. Open PowerShell in this folder and run:
   - `git init`
   - `git add -A`
   - `git commit -m "initial"`
2. Add your GitHub remote (replace with your repo URL):
   - `git remote add origin <YOUR_GITHUB_REPO_URL>`
3. Push:
   - `git push -u origin main`

## Auto-sync (like the DepEd Marinduque setup)
1. Make sure your git remote is set and you can push (GitHub credentials saved).
2. Run `start-github-autosync.bat`.
3. Edit files normally; it will auto-commit + push after a few seconds.

