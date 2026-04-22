# Hostinger deployment (Node.js)

This project runs as a single Node.js web app (static HTML + API at `/api.php`).

It uses `sql.js` (SQLite compiled to WebAssembly) so it installs on Hostinger without `node-gyp` / build tools.

## Important (Hostinger plan)
- If your Hostinger plan is **Shared Hosting (PHP only)**, you **cannot** run a Node.js server process.
  - Use a **VPS** (recommended) or a Hostinger plan that explicitly supports **Node.js apps**.

## VPS method (recommended)
1. Create a VPS and point your domain DNS (A record) to the VPS IP.
2. Install Node.js (v18+), Git, and a process manager:
   - `sudo apt update`
   - `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -`
   - `sudo apt install -y nodejs git`
   - `sudo npm i -g pm2`
3. Clone your GitHub repo on the VPS:
   - `git clone <your-repo-url> school-ict-inventory`
   - `cd school-ict-inventory`
4. Install deps and set environment variables:
   - `npm install --omit=dev`
   - Create `.env` (or export vars in your service):
     - `PORT=8000`
     - `SESSION_SECRET=<long-random-secret>`
     - `SQLITE_PATH=/var/lib/school-ict-inventory/inventory.sqlite`
5. Start the app with PM2:
   - `pm2 start server.js --name school-ict-inventory`
   - `pm2 save`
6. Put Nginx in front (recommended for HTTPS and domain):
   - Proxy your domain to `http://127.0.0.1:8000`
   - Enable HTTPS via Certbot.

## Notes
- The SQLite file is the “database”.
- Recommended: set `SQLITE_PATH` to a persistent folder under your account home (writable), not `/tmp` / build folders.
- If `SQLITE_PATH` is not set, the app defaults to `~/.school-ict-inventory/inventory.sqlite`.
- If you want multiple admins, use Admin Combined page → Admin Account Management.
