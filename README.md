# School ICT Inventory

DepEd-style ICT inventory with separate Admin and School login, CSV upload per school, and central shared database.

## Tech stack
- Frontend: `index.html`, `styles.css`, `script.js`
- Backend API: `api.php`
- Database: SQLite at `data/inventory.sqlite` (auto-created)

## Run locally
1. Install PHP (must be available in PATH).
2. Double-click `start-local-server.bat` or `autorun.bat`.
3. Open `http://localhost:8000`.

## Deploy on Render (works on any network)
1. Push this project to GitHub.
2. In Render, click `New +` -> `Blueprint`.
3. Connect your GitHub repo and deploy (Render will use `render.yaml`).
4. Wait for build to finish, then open your Render URL:
   - `https://<your-service-name>.onrender.com`
5. Use the same login:
   - Admin: `ictadmin` / `marinduque123`

## Use on other devices (same Wi-Fi/LAN)
1. Start the server on this PC.
2. Get this PC IP (shown in `start-local-server.bat` output or run `ipconfig`).
3. On other device browser, open: `http://<PC-LAN-IP>:8000`
4. Example: `http://192.168.1.26:8000`

## Login
- Admin / ICT (combined all-schools view):
  - Username: `ictadmin`
  - Password: `marinduque123`
  - After login, combined view opens on `admin.html` (same website, different page).
- School login (upload only):
  - Must match registered school ID + school name exactly.
  - After login, school workspace opens on `school.html` (same website, different page).

## CSV format
- Use headers: `item_name,quantity,condition,remarks`
- Use `inventory_template.csv` as your guide.

## Behavior
- School uploads replace previous inventory for that same school.
- Previous school inventory is logged under Deleted Records.
- Admin can see combined inventory/import/deleted data from all schools.
- School can only view and manage its own records.
- Data is centralized in server database, so different schools can log in from different devices and upload to the same system.
- Admin can add new admin accounts and change own admin password in the Admin Account Management panel.
