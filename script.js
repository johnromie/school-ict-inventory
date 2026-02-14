const adminUsernameInput = document.getElementById("adminUsername");
const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLoginMessageEl = document.getElementById("adminLoginMessage");

const schoolIdInput = document.getElementById("schoolId");
const schoolNameInput = document.getElementById("schoolName");
const schoolLoginBtn = document.getElementById("schoolLoginBtn");
const schoolLoginMessageEl = document.getElementById("schoolLoginMessage");

const logoutBtn = document.getElementById("logoutBtn");
const activeSchoolBadge = document.getElementById("activeSchoolBadge");
const topActions = document.getElementById("topActions");
const toolsPanel = document.getElementById("toolsPanel");

const workspace = document.getElementById("workspace");
const loginSection = document.getElementById("loginSection");

const pickCsvBtn = document.getElementById("pickCsvBtn");
const uploadBtn = document.getElementById("uploadBtn");
const csvFileInput = document.getElementById("csvFile");
const messageEl = document.getElementById("message");
const summaryEl = document.getElementById("summary");
const searchInput = document.getElementById("searchInput");

const inventoryBody = document.getElementById("inventoryBody");
const importsBody = document.getElementById("importsBody");
const deletedBody = document.getElementById("deletedBody");
const clearDeletedBtn = document.getElementById("clearDeletedBtn");

const adminAccountsPanel = document.getElementById("adminAccountsPanel");
const adminUsersBody = document.getElementById("adminUsersBody");
const newAdminUsernameInput = document.getElementById("newAdminUsername");
const newAdminPasswordInput = document.getElementById("newAdminPassword");
const addAdminBtn = document.getElementById("addAdminBtn");
const currentAdminPasswordInput = document.getElementById("currentAdminPassword");
const changeAdminPasswordInput = document.getElementById("changeAdminPassword");
const changeAdminPasswordBtn = document.getElementById("changeAdminPasswordBtn");
const adminManageMessageEl = document.getElementById("adminManageMessage");

const API_URL = "api.php";
const currentPage = document.body?.dataset?.page || "login";

let searchTerm = "";
let activeSession = null;
let inventoryRows = [];
let importRows = [];
let deletedRows = [];
let adminUsersRows = [];

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

function setSchoolLoginMessage(text, isError = false) {
  schoolLoginMessageEl.textContent = text;
  schoolLoginMessageEl.style.color = isError ? "#991b1b" : "#0b5d4a";
}

function setAdminLoginMessage(text, isError = false) {
  adminLoginMessageEl.textContent = text;
  adminLoginMessageEl.style.color = isError ? "#991b1b" : "#0b5d4a";
}

function setAdminManageMessage(text, isError = false) {
  adminManageMessageEl.textContent = text;
  adminManageMessageEl.style.color = isError ? "#991b1b" : "#0b5d4a";
}

async function api(action, options = {}) {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const fetchOptions = { method, headers, credentials: "same-origin" };
  if (options.body !== undefined) fetchOptions.body = options.body;

  const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, fetchOptions);
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function configureRoleUI(session) {
  const isAdmin = session && session.role === "admin";
  toolsPanel.classList.toggle("hidden", isAdmin);
  clearDeletedBtn.classList.toggle("hidden", isAdmin);
  adminAccountsPanel.classList.toggle("hidden", !isAdmin);
}

function setWorkspaceState(isLoggedIn) {
  workspace.classList.toggle("hidden", !isLoggedIn);
  loginSection.classList.remove("hidden");
  topActions.classList.toggle("hidden", !isLoggedIn);

  if (!isLoggedIn || !activeSession) {
    activeSchoolBadge.textContent = "No active school";
    configureRoleUI(null);
    summaryEl.textContent = "No active session.";
    return;
  }

  if (activeSession.role === "admin") {
    activeSchoolBadge.textContent = "ICT Admin";
    setSchoolLoginMessage("School Login stays available for school uploads.");
  } else {
    activeSchoolBadge.textContent = `${activeSession.schoolName} (${activeSession.schoolId})`;
  }

  configureRoleUI(activeSession);
}

function switchView(view) {
  const views = {
    inventory: document.getElementById("inventoryView"),
    imports: document.getElementById("importsView"),
    deleted: document.getElementById("deletedView"),
  };
  Object.entries(views).forEach(([name, el]) => el.classList.toggle("hidden", name !== view));
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("primary", btn.dataset.view === view);
    btn.classList.toggle("ghost", btn.dataset.view !== view);
  });
}

function renderInventory() {
  if (!activeSession) {
    inventoryBody.innerHTML = '<tr><td colspan="6" class="empty">No records found.</td></tr>';
    summaryEl.textContent = "No active session.";
    return;
  }

  const filtered = inventoryRows.filter((row) => {
    const blob = `${row.school_id} ${row.school_name} ${row.item_name} ${row.quantity} ${row.item_condition} ${row.remarks}`.toLowerCase();
    return blob.includes(searchTerm);
  });

  const totalQty = filtered.reduce((sum, row) => sum + (parseInt(row.quantity, 10) || 0), 0);
  if (activeSession.role === "admin") {
    const schoolCount = new Set(filtered.map((row) => `${row.school_id}__${row.school_name.toLowerCase()}`)).size;
    summaryEl.textContent = `Admin combined view | Schools: ${schoolCount} | Items: ${filtered.length} | Quantity: ${totalQty}`;
  } else {
    summaryEl.textContent = `School: ${activeSession.schoolName} (${activeSession.schoolId}) | Items: ${filtered.length} | Quantity: ${totalQty}`;
  }

  if (!filtered.length) {
    inventoryBody.innerHTML = '<tr><td colspan="6" class="empty">No records found.</td></tr>';
    return;
  }

  inventoryBody.innerHTML = filtered.map((row) => `
    <tr>
      <td>${row.school_id}</td>
      <td>${row.school_name}</td>
      <td>${row.item_name}</td>
      <td>${row.quantity}</td>
      <td>${row.item_condition}</td>
      <td>${row.remarks}</td>
    </tr>
  `).join("");
}

function renderImports() {
  if (!importRows.length) {
    importsBody.innerHTML = '<tr><td colspan="3" class="empty">No imported CSV yet.</td></tr>';
    return;
  }
  importsBody.innerHTML = importRows.map((row) => {
    const fileName = activeSession.role === "admin" ? `${row.school_name} (${row.school_id}) - ${row.file_name}` : row.file_name;
    return `<tr><td>${fileName}</td><td>${row.row_count}</td><td>${new Date(row.imported_at).toLocaleString()}</td></tr>`;
  }).join("");
}

function renderDeleted() {
  if (!deletedRows.length) {
    deletedBody.innerHTML = '<tr><td colspan="3" class="empty">No deleted records.</td></tr>';
    return;
  }
  deletedBody.innerHTML = deletedRows.map((row) => {
    const fileName = activeSession.role === "admin" ? `${row.school_name} (${row.school_id}) - ${row.file_name}` : row.file_name;
    return `<tr><td>${fileName}</td><td>${row.row_count}</td><td>${new Date(row.deleted_at).toLocaleString()}</td></tr>`;
  }).join("");
}

function renderAdminUsers() {
  if (!activeSession || activeSession.role !== "admin" || !adminUsersRows.length) {
    adminUsersBody.innerHTML = '<tr><td colspan="2" class="empty">No admin users.</td></tr>';
    return;
  }
  adminUsersBody.innerHTML = adminUsersRows.map((row) => `
    <tr>
      <td>${row.username}</td>
      <td>${new Date(row.created_at).toLocaleString()}</td>
    </tr>
  `).join("");
}

async function refreshData() {
  if (!activeSession) {
    inventoryRows = [];
    importRows = [];
    deletedRows = [];
    adminUsersRows = [];
    renderInventory();
    renderImports();
    renderDeleted();
    renderAdminUsers();
    return;
  }

  const requests = [api("inventory"), api("imports"), api("deleted")];
  if (activeSession.role === "admin") requests.push(api("admin_users"));
  const [inventory, imports, deleted, adminUsers] = await Promise.all(requests);

  inventoryRows = inventory.rows || [];
  importRows = imports.rows || [];
  deletedRows = deleted.rows || [];
  adminUsersRows = activeSession.role === "admin" ? (adminUsers?.rows || []) : [];

  renderInventory();
  renderImports();
  renderDeleted();
  renderAdminUsers();
}

async function syncSession() {
  try {
    const data = await api("session");
    activeSession = data.session || null;

    if (currentPage === "login" && activeSession) {
      if (activeSession.role === "admin") {
        window.location.href = "admin.html";
        return;
      }
      if (activeSession.role === "school") {
        window.location.href = "school.html";
        return;
      }
      return;
    }

    setWorkspaceState(Boolean(activeSession));
    await refreshData();
    switchView("inventory");
  } catch (error) {
    activeSession = null;
    setWorkspaceState(false);
    setMessage(error.message, true);
  }
}

adminLoginBtn.addEventListener("click", async () => {
  const username = adminUsernameInput.value.trim();
  const password = adminPasswordInput.value.trim();
  if (!username || !password) {
    setAdminLoginMessage("Enter admin username and password.", true);
    return;
  }
  try {
    await api("login_admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setAdminLoginMessage("Admin logged in. Opening combined view page...");
    setSchoolLoginMessage("");
    setWorkspaceState(false);
    setMessage("Opening Admin Combined page...");
    adminPasswordInput.value = "";
    window.location.href = "admin.html";
  } catch (error) {
    setAdminLoginMessage(error.message, true);
  }
});

schoolLoginBtn.addEventListener("click", async () => {
  const schoolId = schoolIdInput.value.trim();
  const schoolName = schoolNameInput.value.trim();
  if (!schoolId || !schoolName) {
    setSchoolLoginMessage("Enter both School ID and School Name.", true);
    return;
  }
  try {
    const data = await api("login_school", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schoolId, schoolName }),
    });
    activeSession = data.session;
    setSchoolLoginMessage("School login successful. Opening upload page...");
    setAdminLoginMessage("");
    window.location.href = "school.html";
  } catch (error) {
    setSchoolLoginMessage(error.message, true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("logout", { method: "POST" });
    activeSession = null;
    setWorkspaceState(false);
    inventoryRows = [];
    importRows = [];
    deletedRows = [];
    adminUsersRows = [];
    renderInventory();
    renderImports();
    renderDeleted();
    renderAdminUsers();
    setSchoolLoginMessage("Logged out.");
    setAdminLoginMessage("");
    setAdminManageMessage("");
    setMessage("Ready.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

pickCsvBtn.addEventListener("click", () => csvFileInput.click());

csvFileInput.addEventListener("change", () => {
  const file = csvFileInput.files[0];
  if (file) setMessage(`Selected file: ${file.name}`);
});

uploadBtn.addEventListener("click", async () => {
  if (!activeSession || activeSession.role !== "school") {
    setMessage("Only school accounts can upload CSV.", true);
    return;
  }
  const file = csvFileInput.files[0];
  if (!file) {
    setMessage("Choose CSV file first.", true);
    return;
  }
  try {
    const formData = new FormData();
    formData.append("csv", file);
    const data = await api("upload_csv", { method: "POST", body: formData });
    csvFileInput.value = "";
    setMessage(`Uploaded ${data.rows} row(s) for ${activeSession.schoolName} (${activeSession.schoolId}).`);
    await refreshData();
  } catch (error) {
    setMessage(error.message, true);
  }
});

searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderInventory();
});

clearDeletedBtn.addEventListener("click", async () => {
  if (!activeSession || activeSession.role !== "school") return;
  try {
    await api("clear_deleted", { method: "POST" });
    await refreshData();
    setMessage("Deleted logs cleared.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

addAdminBtn.addEventListener("click", async () => {
  if (!activeSession || activeSession.role !== "admin") return;
  const username = newAdminUsernameInput.value.trim();
  const password = newAdminPasswordInput.value.trim();
  if (!username || !password) {
    setAdminManageMessage("Enter new admin username and password.", true);
    return;
  }
  try {
    await api("admin_add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    newAdminUsernameInput.value = "";
    newAdminPasswordInput.value = "";
    setAdminManageMessage("Admin account added.");
    await refreshData();
  } catch (error) {
    setAdminManageMessage(error.message, true);
  }
});

changeAdminPasswordBtn.addEventListener("click", async () => {
  if (!activeSession || activeSession.role !== "admin") return;
  const currentPassword = currentAdminPasswordInput.value.trim();
  const newPassword = changeAdminPasswordInput.value.trim();
  if (!currentPassword || !newPassword) {
    setAdminManageMessage("Enter current and new password.", true);
    return;
  }
  try {
    await api("admin_change_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    currentAdminPasswordInput.value = "";
    changeAdminPasswordInput.value = "";
    setAdminManageMessage("Admin password changed successfully.");
  } catch (error) {
    setAdminManageMessage(error.message, true);
  }
});

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

syncSession();
