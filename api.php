<?php
declare(strict_types=1);

session_start();

header("Content-Type: application/json");

const DEFAULT_ADMIN_USERNAME = "ictadmin";
const DEFAULT_ADMIN_PASSWORD = "marinduque123";

const REGISTERED_SCHOOLS = [
  ["school_id" => "100001", "school_name" => "Boac Central School"],
  ["school_id" => "100002", "school_name" => "Mogpog Central School"],
  ["school_id" => "100003", "school_name" => "Gasan Central School"],
  ["school_id" => "100004", "school_name" => "Buenavista Central School"],
  ["school_id" => "100005", "school_name" => "Santa Cruz Central School"],
  ["school_id" => "100006", "school_name" => "Torrijos Central School"],
];

function json_response(array $payload, int $code = 200): void {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

function db(): PDO {
  $sqlitePath = getenv("SQLITE_PATH");
  if (!is_string($sqlitePath) || trim($sqlitePath) === "") {
    $dataDir = __DIR__ . DIRECTORY_SEPARATOR . "data";
    if (!is_dir($dataDir)) {
      mkdir($dataDir, 0777, true);
    }
    $sqlitePath = $dataDir . DIRECTORY_SEPARATOR . "inventory.sqlite";
  }

  $sqliteDir = dirname($sqlitePath);
  if (!is_dir($sqliteDir)) {
    mkdir($sqliteDir, 0777, true);
  }

  $pdo = new PDO("sqlite:" . $sqlitePath);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

  $pdo->exec("
    CREATE TABLE IF NOT EXISTS schools (
      school_id TEXT PRIMARY KEY,
      school_name TEXT NOT NULL
    );
  ");

  $pdo->exec("
    CREATE TABLE IF NOT EXISTS admin_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  ");

  $pdo->exec("
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      item_condition TEXT NOT NULL,
      remarks TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  ");

  $pdo->exec("
    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL
    );
  ");

  $pdo->exec("
    CREATE TABLE IF NOT EXISTS deleted_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL
    );
  ");

  $upsertSchool = $pdo->prepare("
    INSERT INTO schools (school_id, school_name)
    VALUES (:school_id, :school_name)
    ON CONFLICT(school_id) DO UPDATE SET school_name = excluded.school_name;
  ");
  foreach (REGISTERED_SCHOOLS as $school) {
    $upsertSchool->execute([
      ":school_id" => $school["school_id"],
      ":school_name" => $school["school_name"],
    ]);
  }

  $adminExistsStmt = $pdo->prepare("SELECT COUNT(*) as total FROM admin_users WHERE username = :username");
  $adminExistsStmt->execute([":username" => DEFAULT_ADMIN_USERNAME]);
  $adminExists = (int)($adminExistsStmt->fetch()["total"] ?? 0);
  if ($adminExists === 0) {
    $seedAdminStmt = $pdo->prepare("
      INSERT INTO admin_users (username, password_hash, created_at)
      VALUES (:username, :password_hash, :created_at)
    ");
    $seedAdminStmt->execute([
      ":username" => DEFAULT_ADMIN_USERNAME,
      ":password_hash" => password_hash(DEFAULT_ADMIN_PASSWORD, PASSWORD_DEFAULT),
      ":created_at" => (new DateTimeImmutable("now"))->format(DateTimeInterface::ATOM),
    ]);
  }

  return $pdo;
}

function school_from_registry(string $schoolId, string $schoolName): ?array {
  foreach (REGISTERED_SCHOOLS as $school) {
    if ($school["school_id"] === $schoolId && strcasecmp($school["school_name"], $schoolName) === 0) {
      return $school;
    }
  }
  return null;
}

function current_session(): ?array {
  if (!isset($_SESSION["user"]) || !is_array($_SESSION["user"])) {
    return null;
  }
  return $_SESSION["user"];
}

function require_login(): array {
  $user = current_session();
  if (!$user) {
    json_response(["ok" => false, "message" => "Not logged in."], 401);
  }
  return $user;
}

function read_json_input(): array {
  $raw = file_get_contents("php://input");
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function parse_csv_upload(string $content): array {
  $lines = preg_split('/\r\n|\r|\n/', trim($content));
  if (!$lines || count($lines) < 2) {
    throw new RuntimeException("CSV must have headers and at least one data row.");
  }

  $headers = array_map(static fn($h) => strtolower(trim((string)$h)), str_getcsv((string)$lines[0]));
  $required = ["item_name", "quantity", "condition", "remarks"];
  foreach ($required as $header) {
    if (!in_array($header, $headers, true)) {
      throw new RuntimeException("Missing required header: " . $header);
    }
  }

  $indexMap = [];
  foreach ($headers as $i => $h) {
    $indexMap[$h] = $i;
  }

  $rows = [];
  for ($i = 1; $i < count($lines); $i++) {
    if (trim((string)$lines[$i]) === "") continue;
    $values = str_getcsv((string)$lines[$i]);
    $row = [
      "item_name" => trim((string)($values[$indexMap["item_name"]] ?? "")),
      "quantity" => (int)trim((string)($values[$indexMap["quantity"]] ?? "0")),
      "condition" => trim((string)($values[$indexMap["condition"]] ?? "")),
      "remarks" => trim((string)($values[$indexMap["remarks"]] ?? "")),
    ];
    if ($row["item_name"] === "") continue;
    $rows[] = $row;
  }

  if (count($rows) === 0) {
    throw new RuntimeException("CSV has no valid item rows.");
  }
  return $rows;
}

$action = $_GET["action"] ?? $_POST["action"] ?? "";
$pdo = db();

try {
  if ($action === "session") {
    $user = current_session();
    json_response(["ok" => true, "session" => $user]);
  }

  if ($action === "login_admin") {
    $data = read_json_input();
    $username = trim((string)($data["username"] ?? ""));
    $password = trim((string)($data["password"] ?? ""));

    if ($username === "" || $password === "") {
      json_response(["ok" => false, "message" => "Enter admin username and password."], 400);
    }

    $adminStmt = $pdo->prepare("SELECT username, password_hash FROM admin_users WHERE username = :username");
    $adminStmt->execute([":username" => $username]);
    $admin = $adminStmt->fetch();

    if (!$admin || !password_verify($password, (string)$admin["password_hash"])) {
      json_response(["ok" => false, "message" => "Invalid admin credentials."], 401);
    }

    $_SESSION["user"] = ["role" => "admin", "display" => "ICT Admin", "username" => $username];
    json_response(["ok" => true, "session" => $_SESSION["user"]]);
  }

  if ($action === "login_school") {
    $data = read_json_input();
    $schoolId = trim((string)($data["schoolId"] ?? ""));
    $schoolName = trim((string)($data["schoolName"] ?? ""));

    if ($schoolId === "" || $schoolName === "") {
      json_response(["ok" => false, "message" => "Enter both School ID and School Name."], 400);
    }

    $school = school_from_registry($schoolId, $schoolName);
    if (!$school) {
      json_response(["ok" => false, "message" => "Access denied: school is not registered in Schools Division of Marinduque."], 403);
    }

    $_SESSION["user"] = [
      "role" => "school",
      "schoolId" => $school["school_id"],
      "schoolName" => $school["school_name"],
      "display" => $school["school_name"] . " (" . $school["school_id"] . ")",
    ];
    json_response(["ok" => true, "session" => $_SESSION["user"]]);
  }

  if ($action === "logout") {
    $_SESSION = [];
    if (ini_get("session.use_cookies")) {
      $params = session_get_cookie_params();
      setcookie(session_name(), "", time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
    }
    session_destroy();
    json_response(["ok" => true]);
  }

  if ($action === "upload_csv") {
    $user = require_login();
    if (($user["role"] ?? "") !== "school") {
      json_response(["ok" => false, "message" => "Only school accounts can upload CSV."], 403);
    }

    if (!isset($_FILES["csv"]) || !is_uploaded_file($_FILES["csv"]["tmp_name"])) {
      json_response(["ok" => false, "message" => "Choose CSV file first."], 400);
    }

    $content = file_get_contents($_FILES["csv"]["tmp_name"]);
    if ($content === false) {
      json_response(["ok" => false, "message" => "Cannot read uploaded file."], 400);
    }

    $rows = parse_csv_upload($content);
    $schoolId = (string)$user["schoolId"];
    $now = (new DateTimeImmutable("now"))->format(DateTimeInterface::ATOM);

    $pdo->beginTransaction();

    $countStmt = $pdo->prepare("SELECT COUNT(*) as total FROM inventory_items WHERE school_id = :school_id");
    $countStmt->execute([":school_id" => $schoolId]);
    $previousCount = (int)($countStmt->fetch()["total"] ?? 0);

    if ($previousCount > 0) {
      $deletedStmt = $pdo->prepare("
        INSERT INTO deleted_logs (school_id, file_name, row_count, deleted_at)
        VALUES (:school_id, :file_name, :row_count, :deleted_at);
      ");
      $deletedStmt->execute([
        ":school_id" => $schoolId,
        ":file_name" => "previous_inventory.csv",
        ":row_count" => $previousCount,
        ":deleted_at" => $now,
      ]);
    }

    $pdo->prepare("DELETE FROM inventory_items WHERE school_id = :school_id")
      ->execute([":school_id" => $schoolId]);

    $insertItem = $pdo->prepare("
      INSERT INTO inventory_items (school_id, item_name, quantity, item_condition, remarks, updated_at)
      VALUES (:school_id, :item_name, :quantity, :item_condition, :remarks, :updated_at);
    ");

    foreach ($rows as $row) {
      $insertItem->execute([
        ":school_id" => $schoolId,
        ":item_name" => $row["item_name"],
        ":quantity" => $row["quantity"],
        ":item_condition" => $row["condition"],
        ":remarks" => $row["remarks"],
        ":updated_at" => $now,
      ]);
    }

    $importStmt = $pdo->prepare("
      INSERT INTO import_logs (school_id, file_name, row_count, imported_at)
      VALUES (:school_id, :file_name, :row_count, :imported_at);
    ");
    $importStmt->execute([
      ":school_id" => $schoolId,
      ":file_name" => (string)$_FILES["csv"]["name"],
      ":row_count" => count($rows),
      ":imported_at" => $now,
    ]);

    $pdo->commit();
    json_response(["ok" => true, "message" => "CSV uploaded successfully.", "rows" => count($rows)]);
  }

  if ($action === "inventory") {
    $user = require_login();
    if (($user["role"] ?? "") === "admin") {
      $stmt = $pdo->query("
        SELECT i.school_id, s.school_name, i.item_name, i.quantity, i.item_condition, i.remarks
        FROM inventory_items i
        JOIN schools s ON s.school_id = i.school_id
        ORDER BY s.school_name ASC, i.item_name ASC;
      ");
      $rows = $stmt->fetchAll();
    } else {
      $stmt = $pdo->prepare("
        SELECT i.school_id, s.school_name, i.item_name, i.quantity, i.item_condition, i.remarks
        FROM inventory_items i
        JOIN schools s ON s.school_id = i.school_id
        WHERE i.school_id = :school_id
        ORDER BY i.item_name ASC;
      ");
      $stmt->execute([":school_id" => (string)$user["schoolId"]]);
      $rows = $stmt->fetchAll();
    }
    json_response(["ok" => true, "rows" => $rows]);
  }

  if ($action === "imports") {
    $user = require_login();
    if (($user["role"] ?? "") === "admin") {
      $stmt = $pdo->query("
        SELECT l.file_name, l.row_count, l.imported_at, s.school_id, s.school_name
        FROM import_logs l
        JOIN schools s ON s.school_id = l.school_id
        ORDER BY l.imported_at DESC;
      ");
      $rows = $stmt->fetchAll();
    } else {
      $stmt = $pdo->prepare("
        SELECT l.file_name, l.row_count, l.imported_at, s.school_id, s.school_name
        FROM import_logs l
        JOIN schools s ON s.school_id = l.school_id
        WHERE l.school_id = :school_id
        ORDER BY l.imported_at DESC;
      ");
      $stmt->execute([":school_id" => (string)$user["schoolId"]]);
      $rows = $stmt->fetchAll();
    }
    json_response(["ok" => true, "rows" => $rows]);
  }

  if ($action === "deleted") {
    $user = require_login();
    if (($user["role"] ?? "") === "admin") {
      $stmt = $pdo->query("
        SELECT l.file_name, l.row_count, l.deleted_at, s.school_id, s.school_name
        FROM deleted_logs l
        JOIN schools s ON s.school_id = l.school_id
        ORDER BY l.deleted_at DESC;
      ");
      $rows = $stmt->fetchAll();
    } else {
      $stmt = $pdo->prepare("
        SELECT l.file_name, l.row_count, l.deleted_at, s.school_id, s.school_name
        FROM deleted_logs l
        JOIN schools s ON s.school_id = l.school_id
        WHERE l.school_id = :school_id
        ORDER BY l.deleted_at DESC;
      ");
      $stmt->execute([":school_id" => (string)$user["schoolId"]]);
      $rows = $stmt->fetchAll();
    }
    json_response(["ok" => true, "rows" => $rows]);
  }

  if ($action === "clear_deleted") {
    $user = require_login();
    if (($user["role"] ?? "") !== "school") {
      json_response(["ok" => false, "message" => "Only school accounts can clear deleted logs."], 403);
    }
    $stmt = $pdo->prepare("DELETE FROM deleted_logs WHERE school_id = :school_id");
    $stmt->execute([":school_id" => (string)$user["schoolId"]]);
    json_response(["ok" => true, "message" => "Deleted logs cleared."]);
  }

  if ($action === "admin_users") {
    $user = require_login();
    if (($user["role"] ?? "") !== "admin") {
      json_response(["ok" => false, "message" => "Only admin can view admin accounts."], 403);
    }
    $stmt = $pdo->query("SELECT username, created_at FROM admin_users ORDER BY username ASC");
    json_response(["ok" => true, "rows" => $stmt->fetchAll()]);
  }

  if ($action === "admin_add") {
    $user = require_login();
    if (($user["role"] ?? "") !== "admin") {
      json_response(["ok" => false, "message" => "Only admin can add admin accounts."], 403);
    }
    $data = read_json_input();
    $username = strtolower(trim((string)($data["username"] ?? "")));
    $password = trim((string)($data["password"] ?? ""));
    if ($username === "" || $password === "") {
      json_response(["ok" => false, "message" => "Enter new admin username and password."], 400);
    }
    if (!preg_match('/^[a-z0-9_]{3,30}$/', $username)) {
      json_response(["ok" => false, "message" => "Username must be 3-30 chars: a-z, 0-9, underscore."], 400);
    }
    if (strlen($password) < 6) {
      json_response(["ok" => false, "message" => "Password must be at least 6 characters."], 400);
    }
    $existsStmt = $pdo->prepare("SELECT COUNT(*) as total FROM admin_users WHERE username = :username");
    $existsStmt->execute([":username" => $username]);
    $exists = (int)($existsStmt->fetch()["total"] ?? 0);
    if ($exists > 0) {
      json_response(["ok" => false, "message" => "Admin username already exists."], 409);
    }

    $stmt = $pdo->prepare("
      INSERT INTO admin_users (username, password_hash, created_at)
      VALUES (:username, :password_hash, :created_at)
    ");
    $stmt->execute([
      ":username" => $username,
      ":password_hash" => password_hash($password, PASSWORD_DEFAULT),
      ":created_at" => (new DateTimeImmutable("now"))->format(DateTimeInterface::ATOM),
    ]);
    json_response(["ok" => true, "message" => "Admin account added."]);
  }

  if ($action === "admin_change_password") {
    $user = require_login();
    if (($user["role"] ?? "") !== "admin") {
      json_response(["ok" => false, "message" => "Only admin can change password."], 403);
    }
    $data = read_json_input();
    $currentPassword = trim((string)($data["currentPassword"] ?? ""));
    $newPassword = trim((string)($data["newPassword"] ?? ""));

    if ($currentPassword === "" || $newPassword === "") {
      json_response(["ok" => false, "message" => "Enter current and new password."], 400);
    }
    if (strlen($newPassword) < 6) {
      json_response(["ok" => false, "message" => "New password must be at least 6 characters."], 400);
    }

    $username = (string)($user["username"] ?? "");
    $stmt = $pdo->prepare("SELECT password_hash FROM admin_users WHERE username = :username");
    $stmt->execute([":username" => $username]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($currentPassword, (string)$row["password_hash"])) {
      json_response(["ok" => false, "message" => "Current password is incorrect."], 401);
    }

    $updateStmt = $pdo->prepare("UPDATE admin_users SET password_hash = :password_hash WHERE username = :username");
    $updateStmt->execute([
      ":password_hash" => password_hash($newPassword, PASSWORD_DEFAULT),
      ":username" => $username,
    ]);
    json_response(["ok" => true, "message" => "Admin password changed successfully."]);
  }

  json_response(["ok" => false, "message" => "Unknown action."], 404);
} catch (Throwable $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  json_response(["ok" => false, "message" => $e->getMessage()], 500);
}
