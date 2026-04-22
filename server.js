/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const os = require("os");

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { parse: parseCsv } = require("csv-parse/sync");
const initSqlJs = require("sql.js");

const DEFAULT_ADMIN_USERNAME = "ictadmin";
const DEFAULT_ADMIN_PASSWORD = "marinduque123";

const REGISTERED_SCHOOLS = [
  { school_id: "100001", school_name: "Boac Central School" },
  { school_id: "100002", school_name: "Mogpog Central School" },
  { school_id: "100003", school_name: "Gasan Central School" },
  { school_id: "100004", school_name: "Buenavista Central School" },
  { school_id: "100005", school_name: "Santa Cruz Central School" },
  { school_id: "100006", school_name: "Torrijos Central School" }
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeHeader(header, index) {
  const h = String(header ?? "").trim().toLowerCase();
  if (!h) return `col_${index + 1}`;
  const normalized = h.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized ? normalized : `col_${index + 1}`;
}

function parseCsvUpload(contentBuffer) {
  const content = Buffer.isBuffer(contentBuffer) ? contentBuffer.toString("utf8") : String(contentBuffer ?? "");
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("CSV must have headers and at least one data row.");
  }

  const records = parseCsv(trimmed, {
    columns: false,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false
  });

  if (!Array.isArray(records) || records.length < 2) {
    throw new Error("CSV must have headers and at least one data row.");
  }

  const rawHeaders = records[0] ?? [];
  const seen = new Set();
  const headers = rawHeaders.map((h, i) => {
    const base = normalizeHeader(h, i);
    let name = base;
    let suffix = 2;
    while (seen.has(name)) {
      name = `${base}_${suffix}`;
      suffix += 1;
    }
    seen.add(name);
    return name;
  });

  if (!headers.includes("item") && !headers.includes("item_name")) {
    throw new Error("Missing required header: item or item_name");
  }

  const rows = [];
  for (let i = 1; i < records.length; i += 1) {
    const row = records[i];
    if (!row || (Array.isArray(row) && row.every((v) => String(v ?? "").trim() === ""))) continue;

    const raw = {};
    for (let idx = 0; idx < headers.length; idx += 1) {
      raw[headers[idx]] = String(row[idx] ?? "").trim();
    }

    const itemName = String(raw.item ?? raw.item_name ?? "").trim();
    if (!itemName) continue;

    let quantity = 1;
    if (raw.quantity !== undefined && raw.quantity !== null && raw.quantity !== "" && !Number.isNaN(Number(raw.quantity))) {
      const q = parseInt(raw.quantity, 10);
      if (q > 0) quantity = q;
    }

    let condition = String(
      raw.erquipment_condition ?? raw.equipment_condition ?? raw.condition ?? ""
    ).trim();
    if (!condition) condition = "Unknown";

    const remarks = String(raw.remarks ?? "").trim();

    rows.push({
      item_name: itemName,
      quantity,
      condition,
      remarks,
      raw_json: JSON.stringify(raw)
    });
  }

  if (rows.length === 0) {
    throw new Error("CSV has no valid item rows.");
  }

  return rows;
}

function isPhpBcrypt(hash) {
  return typeof hash === "string" && hash.startsWith("$2y$");
}

function normalizeBcryptHash(hash) {
  if (!hash) return "";
  if (isPhpBcrypt(hash)) return `$2a$${hash.slice(4)}`;
  return hash;
}

function openDb() {
  let sqlitePath = process.env.SQLITE_PATH;
  if (!sqlitePath || !String(sqlitePath).trim()) {
    // Hosting providers sometimes deploy source to a read-only directory.
    // Default to the user's home directory (typically writable) unless SQLITE_PATH is explicitly set.
    sqlitePath = path.join(os.homedir(), ".school-ict-inventory", "inventory.sqlite");
  }

  const sqliteDir = path.dirname(sqlitePath);
  if (!fs.existsSync(sqliteDir)) {
    fs.mkdirSync(sqliteDir, { recursive: true });
  }

  const distDir = path.dirname(require.resolve("sql.js/dist/sql-wasm.js"));

  async function init() {
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(distDir, file)
    });

    let database;
    if (fs.existsSync(sqlitePath)) {
      const fileBuf = fs.readFileSync(sqlitePath);
      database = new SQL.Database(new Uint8Array(fileBuf));
    } else {
      database = new SQL.Database();
    }

    function persist() {
      const exported = database.export();
      fs.writeFileSync(sqlitePath, Buffer.from(exported));
    }

    function run(sql, params = []) {
      const stmt = database.prepare(sql);
      try {
        stmt.run(params);
      } finally {
        stmt.free();
      }
      return { changes: database.getRowsModified() };
    }

    function exec(sql) {
      database.exec(sql);
      return { changes: database.getRowsModified() };
    }

    function all(sql, params = []) {
      const stmt = database.prepare(sql);
      const rows = [];
      try {
        stmt.bind(params);
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
      } finally {
        stmt.free();
      }
      return rows;
    }

    function get(sql, params = []) {
      const rows = all(sql, params);
      return rows[0];
    }

    function transaction(fn) {
      run("BEGIN");
      try {
        const out = fn();
        run("COMMIT");
        persist();
        return out;
      } catch (e) {
        try {
          run("ROLLBACK");
        } catch (_ignored) {
        }
        throw e;
      }
    }

    // `sql.js` prepare/run executes only a single statement; use exec() for schema blocks.
    exec(`
    CREATE TABLE IF NOT EXISTS schools (
      school_id TEXT PRIMARY KEY,
      school_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      item_condition TEXT NOT NULL,
      remarks TEXT NOT NULL,
      raw_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL,
      restored_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deleted_inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deleted_log_id INTEGER NOT NULL,
      school_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      item_condition TEXT NOT NULL,
      remarks TEXT NOT NULL,
      raw_json TEXT,
      deleted_at TEXT NOT NULL
    );
  `);

    const requiredTables = [
      "schools",
      "admin_users",
      "inventory_items",
      "import_logs",
      "deleted_logs",
      "deleted_inventory_items"
    ];
    const missingTables = requiredTables.filter(
      (name) => !get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name])?.name
    );
    if (missingTables.length) {
      throw new Error(`SQLite schema init failed; missing tables: ${missingTables.join(", ")}`);
    }

    const upsertSchoolSql = `
    INSERT INTO schools (school_id, school_name)
    VALUES (@school_id, @school_name)
    ON CONFLICT(school_id) DO UPDATE SET school_name = excluded.school_name;
  `;
    transaction(() => {
      for (const school of REGISTERED_SCHOOLS) {
        // Named params supported via stmt.getAsObject binding by passing an object
        const stmt = database.prepare(upsertSchoolSql);
        try {
          stmt.run({
            "@school_id": school.school_id,
            "@school_name": school.school_name
          });
        } finally {
          stmt.free();
        }
      }

      const adminExists = get("SELECT COUNT(*) AS total FROM admin_users WHERE username = ?", [
        DEFAULT_ADMIN_USERNAME
      ]);
      if (Number(adminExists?.total ?? 0) === 0) {
        const password_hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
        run("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)", [
          DEFAULT_ADMIN_USERNAME,
          password_hash,
          nowIso()
        ]);
      }
    });

    // Serialize all DB ops because sql.js uses a single in-memory database instance.
    let chain = Promise.resolve();
    function withLock(fn) {
      const next = chain.then(fn, fn);
      chain = next.catch(() => {});
      return next;
    }

    return {
      sqlitePath,
      persist,
      run,
      exec,
      all,
      get,
      transaction,
      withLock,
      raw: database
    };
  }

  return init();
}

function schoolFromRegistry(schoolId, schoolName) {
  const id = String(schoolId ?? "").trim();
  const name = String(schoolName ?? "").trim();
  if (!id || !name) return null;
  const lname = name.toLowerCase();
  return (
    REGISTERED_SCHOOLS.find(
      (s) => s.school_id === id && String(s.school_name).toLowerCase() === lname
    ) || null
  );
}

function jsonResponse(res, payload, code = 200) {
  const effectiveCode = code >= 400 ? 200 : code;
  const out = { ...payload };
  if (code >= 400 && out.status_code === undefined) out.status_code = code;
  res.status(effectiveCode).json(out);
}

function requireLogin(req, res) {
  const user = req.session?.user;
  if (!user) {
    jsonResponse(res, { ok: false, message: "Not logged in." }, 401);
    return null;
  }
  return user;
}

function archiveCurrentInventory(dbx, schoolId, fileName, timestamp) {
  const total = dbx.get("SELECT COUNT(*) AS total FROM inventory_items WHERE school_id = ?", [schoolId])?.total;
  const rowCount = Number(total ?? 0);
  if (rowCount === 0) return 0;

  dbx.run("INSERT INTO deleted_logs (school_id, file_name, row_count, deleted_at) VALUES (?, ?, ?, ?)", [
    schoolId,
    fileName,
    rowCount,
    timestamp
  ]);
  const deletedLogId = Number(dbx.get("SELECT last_insert_rowid() AS id")?.id ?? 0);

  dbx.run(`
    INSERT INTO deleted_inventory_items (
      deleted_log_id, school_id, item_name, quantity, item_condition, remarks, raw_json, deleted_at
    )
    SELECT ?, school_id, item_name, quantity, item_condition, remarks, raw_json, ?
    FROM inventory_items
    WHERE school_id = ?;
  `, [deletedLogId, timestamp, schoolId]);

  return deletedLogId;
}

const app = express();
app.disable("x-powered-by");

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err && err.stack ? err.stack : err);
});

app.use(
  session({
    name: "schoolict.sid",
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

app.use(
  express.json({
    limit: "2mb"
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

async function handleApi(req, res) {
  const action = String(req.query.action ?? req.body?.action ?? "");

  try {
    const dbx = await req.app.locals.dbxPromise;

    if (action === "session") {
      jsonResponse(res, { ok: true, session: req.session?.user ?? null });
      return;
    }

    if (action === "login_admin") {
      const username = String(req.body?.username ?? "").trim();
      const password = String(req.body?.password ?? "").trim();
      if (!username || !password) {
        jsonResponse(res, { ok: false, message: "Enter admin username and password." }, 400);
        return;
      }

      const admin = await dbx.withLock(() =>
        dbx.get("SELECT username, password_hash FROM admin_users WHERE username = ?", [username])
      );
      const stored = normalizeBcryptHash(admin?.password_hash ?? "");
      if (!admin || !bcrypt.compareSync(password, stored)) {
        jsonResponse(res, { ok: false, message: "Invalid admin credentials." }, 401);
        return;
      }

      req.session.user = { role: "admin", display: "ICT Admin", username };
      jsonResponse(res, { ok: true, session: req.session.user });
      return;
    }

    if (action === "login_school") {
      const schoolId = String(req.body?.schoolId ?? "").trim();
      const schoolName = String(req.body?.schoolName ?? "").trim();

      if (!schoolId || !schoolName) {
        jsonResponse(res, { ok: false, message: "Enter both School ID and School Name." }, 400);
        return;
      }

      const school = schoolFromRegistry(schoolId, schoolName);
      if (!school) {
        jsonResponse(
          res,
          { ok: false, message: "Access denied: school is not registered in Schools Division of Marinduque." },
          403
        );
        return;
      }

      req.session.user = {
        role: "school",
        schoolId: school.school_id,
        schoolName: school.school_name,
        display: `${school.school_name} (${school.school_id})`
      };
      jsonResponse(res, { ok: true, session: req.session.user });
      return;
    }

    if (action === "logout") {
      req.session.user = null;
      req.session.destroy(() => {
        res.clearCookie("schoolict.sid");
        jsonResponse(res, { ok: true });
      });
      return;
    }

    if (action === "upload_csv") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "school") {
        jsonResponse(res, { ok: false, message: "Only school accounts can upload CSV." }, 403);
        return;
      }

      const file = req.file;
      if (!file || !file.buffer) {
        jsonResponse(res, { ok: false, message: "Choose CSV file first." }, 400);
        return;
      }

      const rows = parseCsvUpload(file.buffer);
      const schoolId = String(user.schoolId);
      const stamp = nowIso();

      await dbx.withLock(() =>
        dbx.transaction(() => {
          archiveCurrentInventory(dbx, schoolId, "previous_inventory.csv", stamp);
          dbx.run("DELETE FROM inventory_items WHERE school_id = ?", [schoolId]);

          for (const row of rows) {
            dbx.run(
              "INSERT INTO inventory_items (school_id, item_name, quantity, item_condition, remarks, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
              [
                schoolId,
                row.item_name,
                row.quantity,
                row.condition,
                row.remarks,
                row.raw_json ?? null,
                stamp
              ]
            );
          }

          dbx.run(
            "INSERT INTO import_logs (school_id, file_name, row_count, imported_at) VALUES (?, ?, ?, ?);",
            [schoolId, String(file.originalname ?? "upload.csv"), rows.length, stamp]
          );
        })
      );
      jsonResponse(res, { ok: true, message: "CSV uploaded successfully.", rows: rows.length });
      return;
    }

    if (action === "inventory") {
      const user = requireLogin(req, res);
      if (!user) return;
      let rows = [];
      if (user.role === "admin") {
        rows = await dbx.withLock(() =>
          dbx.all(`
            SELECT i.school_id, s.school_name, i.item_name, i.quantity, i.item_condition, i.remarks, i.raw_json
            FROM inventory_items i
            JOIN schools s ON s.school_id = i.school_id
            ORDER BY s.school_name ASC, i.item_name ASC;
          `)
        );
      } else {
        rows = await dbx.withLock(() =>
          dbx.all(
            `
              SELECT i.school_id, s.school_name, i.item_name, i.quantity, i.item_condition, i.remarks, i.raw_json
              FROM inventory_items i
              JOIN schools s ON s.school_id = i.school_id
              WHERE i.school_id = ?
              ORDER BY i.item_name ASC;
            `,
            [String(user.schoolId)]
          )
        );
      }

      const mapped = rows.map((row) => {
        let row_data = {};
        try {
          row_data = row.raw_json ? JSON.parse(String(row.raw_json)) : {};
        } catch (_e) {
          row_data = {};
        }
        return { ...row, row_data };
      });

      jsonResponse(res, { ok: true, rows: mapped });
      return;
    }

    if (action === "imports") {
      const user = requireLogin(req, res);
      if (!user) return;

      let rows = [];
      if (user.role === "admin") {
        rows = await dbx.withLock(() =>
          dbx.all(`
            SELECT l.file_name, l.row_count, l.imported_at, s.school_id, s.school_name
            FROM import_logs l
            JOIN schools s ON s.school_id = l.school_id
            ORDER BY l.imported_at DESC;
          `)
        );
      } else {
        rows = await dbx.withLock(() =>
          dbx.all(
            `
              SELECT l.file_name, l.row_count, l.imported_at, s.school_id, s.school_name
              FROM import_logs l
              JOIN schools s ON s.school_id = l.school_id
              WHERE l.school_id = ?
              ORDER BY l.imported_at DESC;
            `,
            [String(user.schoolId)]
          )
        );
      }

      jsonResponse(res, { ok: true, rows });
      return;
    }

    if (action === "deleted") {
      const user = requireLogin(req, res);
      if (!user) return;

      let rows = [];
      if (user.role === "admin") {
        rows = await dbx.withLock(() =>
          dbx.all(`
            SELECT l.id, l.file_name, l.row_count, l.deleted_at, l.restored_at, s.school_id, s.school_name,
                   CASE WHEN l.restored_at IS NULL AND EXISTS (
                     SELECT 1 FROM deleted_inventory_items di WHERE di.deleted_log_id = l.id
                   ) THEN 1 ELSE 0 END AS can_restore
            FROM deleted_logs l
            JOIN schools s ON s.school_id = l.school_id
            ORDER BY l.deleted_at DESC;
          `)
        );
      } else {
        rows = await dbx.withLock(() =>
          dbx.all(
            `
            SELECT l.id, l.file_name, l.row_count, l.deleted_at, l.restored_at, s.school_id, s.school_name,
                   CASE WHEN l.restored_at IS NULL AND EXISTS (
                     SELECT 1 FROM deleted_inventory_items di WHERE di.deleted_log_id = l.id
                   ) THEN 1 ELSE 0 END AS can_restore
            FROM deleted_logs l
            JOIN schools s ON s.school_id = l.school_id
            WHERE l.school_id = ?
            ORDER BY l.deleted_at DESC;
          `,
            [String(user.schoolId)]
          )
        );
      }

      jsonResponse(res, { ok: true, rows });
      return;
    }

    if (action === "clear_deleted") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "school") {
        jsonResponse(res, { ok: false, message: "Only school accounts can clear deleted logs." }, 403);
        return;
      }

      const schoolId = String(user.schoolId);
      await dbx.withLock(() =>
        dbx.transaction(() => {
          const ids = dbx
            .all("SELECT id FROM deleted_logs WHERE school_id = ?", [schoolId])
            .map((r) => Number(r.id));
          if (ids.length > 0) {
            const placeholders = ids.map(() => "?").join(",");
            dbx.run(`DELETE FROM deleted_inventory_items WHERE deleted_log_id IN (${placeholders})`, ids);
          }
          dbx.run("DELETE FROM deleted_logs WHERE school_id = ?", [schoolId]);
        })
      );
      jsonResponse(res, { ok: true, message: "Deleted logs cleared." });
      return;
    }

    if (action === "delete_all_inventory") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "school") {
        jsonResponse(res, { ok: false, message: "Only school accounts can delete inventory." }, 403);
        return;
      }

      const schoolId = String(user.schoolId);
      const stamp = nowIso();
      let deletedCount = 0;
      let archived = 0;
      await dbx.withLock(() =>
        dbx.transaction(() => {
          archived = archiveCurrentInventory(dbx, schoolId, "manual_delete_all.csv", stamp);
          const info = dbx.run("DELETE FROM inventory_items WHERE school_id = ?", [schoolId]);
          deletedCount = Number(info.changes ?? 0);
        })
      );

      if (deletedCount <= 0) {
        jsonResponse(res, { ok: true, message: "No inventory records to delete.", rows: 0, archived });
        return;
      }
      jsonResponse(res, { ok: true, message: "All inventory records deleted.", rows: deletedCount, archived });
      return;
    }

    if (action === "restore_deleted") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "school") {
        jsonResponse(res, { ok: false, message: "Only school accounts can restore deleted files." }, 403);
        return;
      }

      const deletedLogId = Number(req.body?.deletedLogId ?? 0);
      if (!Number.isFinite(deletedLogId) || deletedLogId <= 0) {
        jsonResponse(res, { ok: false, message: "Invalid deleted log id." }, 400);
        return;
      }

      const schoolId = String(user.schoolId);
      const log = await dbx.withLock(() =>
        dbx.get("SELECT id, school_id, file_name, restored_at FROM deleted_logs WHERE id = ? LIMIT 1", [deletedLogId])
      );

      if (!log || String(log.school_id) !== schoolId) {
        jsonResponse(res, { ok: false, message: "Deleted log not found." }, 404);
        return;
      }
      if (log.restored_at) {
        jsonResponse(res, { ok: false, message: "This deleted file is already restored." }, 409);
        return;
      }

      const snapshotRows = await dbx.withLock(() =>
        dbx.all(
          "SELECT item_name, quantity, item_condition, remarks, raw_json FROM deleted_inventory_items WHERE deleted_log_id = ? ORDER BY id ASC",
          [deletedLogId]
        )
      );
      if (!snapshotRows || snapshotRows.length === 0) {
        jsonResponse(res, { ok: false, message: "No snapshot data available for this deleted file." }, 409);
        return;
      }

      const stamp = nowIso();
      await dbx.withLock(() =>
        dbx.transaction(() => {
          archiveCurrentInventory(dbx, schoolId, "before_restore_inventory.csv", stamp);
          dbx.run("DELETE FROM inventory_items WHERE school_id = ?", [schoolId]);

          for (const row of snapshotRows) {
            dbx.run(
              "INSERT INTO inventory_items (school_id, item_name, quantity, item_condition, remarks, raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [
                schoolId,
                String(row.item_name),
                Number(row.quantity ?? 0),
                String(row.item_condition),
                String(row.remarks),
                row.raw_json ?? null,
                stamp
              ]
            );
          }

          dbx.run("INSERT INTO import_logs (school_id, file_name, row_count, imported_at) VALUES (?, ?, ?, ?)", [
            schoolId,
            `restored_${String(log.file_name)}`,
            snapshotRows.length,
            stamp
          ]);

          dbx.run("UPDATE deleted_logs SET restored_at = ? WHERE id = ?", [stamp, deletedLogId]);
        })
      );
      jsonResponse(res, { ok: true, message: "Deleted inventory restored.", rows: snapshotRows.length });
      return;
    }

    if (action === "admin_users") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "admin") {
        jsonResponse(res, { ok: false, message: "Only admin can view admin accounts." }, 403);
        return;
      }
      const rows = await dbx.withLock(() => dbx.all("SELECT username, created_at FROM admin_users ORDER BY username ASC"));
      jsonResponse(res, { ok: true, rows });
      return;
    }

    if (action === "admin_add") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "admin") {
        jsonResponse(res, { ok: false, message: "Only admin can add admin accounts." }, 403);
        return;
      }
      const username = String(req.body?.username ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "").trim();

      if (!username || !password) {
        jsonResponse(res, { ok: false, message: "Enter new admin username and password." }, 400);
        return;
      }
      if (!/^[a-z0-9_]{3,30}$/.test(username)) {
        jsonResponse(res, { ok: false, message: "Username must be 3-30 chars: a-z, 0-9, underscore." }, 400);
        return;
      }
      if (password.length < 6) {
        jsonResponse(res, { ok: false, message: "Password must be at least 6 characters." }, 400);
        return;
      }

      await dbx.withLock(() =>
        dbx.transaction(() => {
          const exists = dbx.get("SELECT COUNT(*) AS total FROM admin_users WHERE username = ?", [username])?.total;
          if (Number(exists ?? 0) > 0) {
            const err = new Error("Admin username already exists.");
            err.statusCode = 409;
            throw err;
          }
          dbx.run("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)", [
            username,
            bcrypt.hashSync(password, 10),
            nowIso()
          ]);
        })
      ).catch((e) => {
        if (e && e.statusCode === 409) {
          jsonResponse(res, { ok: false, message: e.message }, 409);
          return null;
        }
        throw e;
      });
      if (res.headersSent) return;
      jsonResponse(res, { ok: true, message: "Admin account added." });
      return;
    }

    if (action === "admin_change_password") {
      const user = requireLogin(req, res);
      if (!user) return;
      if (user.role !== "admin") {
        jsonResponse(res, { ok: false, message: "Only admin can change password." }, 403);
        return;
      }

      const currentPassword = String(req.body?.currentPassword ?? "").trim();
      const newPassword = String(req.body?.newPassword ?? "").trim();
      if (!currentPassword || !newPassword) {
        jsonResponse(res, { ok: false, message: "Enter current and new password." }, 400);
        return;
      }
      if (newPassword.length < 6) {
        jsonResponse(res, { ok: false, message: "New password must be at least 6 characters." }, 400);
        return;
      }

      const username = String(user.username ?? "");
      await dbx.withLock(() =>
        dbx.transaction(() => {
          const row = dbx.get("SELECT password_hash FROM admin_users WHERE username = ?", [username]);
          const stored = normalizeBcryptHash(row?.password_hash ?? "");
          if (!row || !bcrypt.compareSync(currentPassword, stored)) {
            const err = new Error("Current password is incorrect.");
            err.statusCode = 401;
            throw err;
          }
          dbx.run("UPDATE admin_users SET password_hash = ? WHERE username = ?", [
            bcrypt.hashSync(newPassword, 10),
            username
          ]);
        })
      ).catch((e) => {
        if (e && e.statusCode === 401) {
          jsonResponse(res, { ok: false, message: e.message }, 401);
          return null;
        }
        throw e;
      });
      if (res.headersSent) return;
      jsonResponse(res, { ok: true, message: "Admin password changed successfully." });
      return;
    }

    jsonResponse(res, { ok: false, message: "Unknown action." }, 404);
  } catch (e) {
    jsonResponse(res, { ok: false, message: e?.message || "Server error." }, 500);
  }
}

app.get("/api.php", handleApi);
app.post("/api.php", (req, res, next) => {
  const action = String(req.query.action ?? "");
  if (action === "upload_csv") {
    upload.single("csv")(req, res, (err) => {
      if (err) {
        jsonResponse(res, { ok: false, message: err.message || "Upload failed." }, 400);
        return;
      }
      next();
    });
    return;
  }
  next();
}, handleApi);

app.use(express.static(__dirname));

app.get("/healthz", (req, res) => {
  res.type("text/plain").send("ok");
});

app.use((err, req, res, next) => {
  if (!err) return next();
  const isJsonParse = err instanceof SyntaxError && String(err.message || "").toLowerCase().includes("json");
  if (isJsonParse) {
    jsonResponse(res, { ok: false, message: "Request failed. Please refresh and try again." }, 400);
    return;
  }
  jsonResponse(res, { ok: false, message: err.message || "Server error." }, 500);
});

// Most Node hosting platforms inject PORT. If not set, default to 3000 for hosting compatibility.
const port = Number(process.env.PORT || 3000);
app.locals.dbxPromise = openDb();

app.locals.dbxPromise
  .then((dbx) => {
    console.log(`SQLite DB path: ${dbx.sqlitePath}`);
    app.listen(port, "0.0.0.0", () => {
      console.log(`School ICT Inventory server running on http://localhost:${port}`);
    });
  })
  .catch((e) => {
    console.error("Failed to start server:", e);
    process.exitCode = 1;
  });
