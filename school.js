const logoutBtn = document.getElementById("logoutBtn");
const activeSchoolBadge = document.getElementById("activeSchoolBadge");
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

const API_URL = "api.php";

let searchTerm = "";
let activeSession = null;
let inventoryRows = [];
let importRows = [];
let deletedRows = [];

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
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

function switchView(view) {
  const views = {
    inventory: document.getElementById("inventoryView"),
    imports: document.getElementById("importsView"),
    deleted: document.getElementById("deletedView"),
  };

  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle("hidden", name !== view);
  });

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("primary", btn.dataset.view === view);
    btn.classList.toggle("ghost", btn.dataset.view !== view);
  });
}

function renderInventory() {
  const filtered = inventoryRows.filter((row) => {
    const blob = `${row.school_id} ${row.school_name} ${row.item_name} ${row.quantity} ${row.item_condition} ${row.remarks}`.toLowerCase();
    return blob.includes(searchTerm);
  });

  const totalQty = filtered.reduce((sum, row) => sum + (parseInt(row.quantity, 10) || 0), 0);
  summaryEl.textContent = `School: ${activeSession.schoolName} (${activeSession.schoolId}) | Items: ${filtered.length} | Quantity: ${totalQty}`;

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

  importsBody.innerHTML = importRows.map((row) => `
    <tr>
      <td>${row.file_name}</td>
      <td>${row.row_count}</td>
      <td>${new Date(row.imported_at).toLocaleString()}</td>
    </tr>
  `).join("");
}

function renderDeleted() {
  if (!deletedRows.length) {
    deletedBody.innerHTML = '<tr><td colspan="3" class="empty">No deleted records.</td></tr>';
    return;
  }

  deletedBody.innerHTML = deletedRows.map((row) => `
    <tr>
      <td>${row.file_name}</td>
      <td>${row.row_count}</td>
      <td>${new Date(row.deleted_at).toLocaleString()}</td>
    </tr>
  `).join("");
}

async function refreshData() {
  const [inventory, imports, deleted] = await Promise.all([
    api("inventory"),
    api("imports"),
    api("deleted"),
  ]);

  inventoryRows = inventory.rows || [];
  importRows = imports.rows || [];
  deletedRows = deleted.rows || [];

  renderInventory();
  renderImports();
  renderDeleted();
}

async function init() {
  try {
    const data = await api("session");
    activeSession = data.session || null;
    if (!activeSession || activeSession.role !== "school") {
      window.location.href = "index.html";
      return;
    }
    activeSchoolBadge.textContent = `${activeSession.schoolName} (${activeSession.schoolId})`;
    setMessage("School mode ready.");
    await refreshData();
    switchView("inventory");
  } catch (error) {
    setMessage(error.message, true);
  }
}

pickCsvBtn.addEventListener("click", () => csvFileInput.click());

csvFileInput.addEventListener("change", () => {
  const file = csvFileInput.files[0];
  if (file) setMessage(`Selected file: ${file.name}`);
});

uploadBtn.addEventListener("click", async () => {
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
  try {
    await api("clear_deleted", { method: "POST" });
    await refreshData();
    setMessage("Deleted logs cleared.");
  } catch (error) {
    setMessage(error.message, true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("logout", { method: "POST" });
    window.location.href = "index.html";
  } catch (error) {
    setMessage(error.message, true);
  }
});

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

init();
