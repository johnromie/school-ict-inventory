const logoutBtn = document.getElementById("logoutBtn");
const activeSchoolBadge = document.getElementById("activeSchoolBadge");
const summaryEl = document.getElementById("summary");
const messageEl = document.getElementById("message");
const searchInput = document.getElementById("searchInput");
const inventoryTableWrap = document.getElementById("inventoryTableWrap");
const inventoryBottomBar = document.getElementById("inventoryBottomBar");
const inventoryBottomBarInner = document.getElementById("inventoryBottomBarInner");
const inventoryHead = document.getElementById("inventoryHead");

const inventoryBody = document.getElementById("inventoryBody");
const importsBody = document.getElementById("importsBody");
const deletedBody = document.getElementById("deletedBody");

const adminUsersBody = document.getElementById("adminUsersBody");
const newAdminUsernameInput = document.getElementById("newAdminUsername");
const newAdminPasswordInput = document.getElementById("newAdminPassword");
const addAdminBtn = document.getElementById("addAdminBtn");
const currentAdminPasswordInput = document.getElementById("currentAdminPassword");
const changeAdminPasswordInput = document.getElementById("changeAdminPassword");
const changeAdminPasswordBtn = document.getElementById("changeAdminPasswordBtn");
const adminManageMessageEl = document.getElementById("adminManageMessage");

const API_URL = "api.php";

let searchTerm = "";
let activeSession = null;
let inventoryRows = [];
let importRows = [];
let deletedRows = [];
let adminUsersRows = [];

const INVENTORY_COLUMNS = [
  { key: "school_id", label: "School ID" },
  { key: "school_name", label: "School Name" },
  { key: "property_no", label: "Property No." },
  { key: "old_previous_property_no", label: "Old / Previous Property No." },
  { key: "serial_number", label: "Serial Number" },
  { key: "item", label: "Item" },
  { key: "uom", label: "Unit of Measure" },
  { key: "brand_manufacturer", label: "Brand / Manufacturer" },
  { key: "model", label: "Model" },
  { key: "specifications", label: "Specification(s)" },
  { key: "non_dcp", label: "Non-DCP" },
  { key: "dcp_package", label: "DCP Package" },
  { key: "dcp_year", label: "DCP Year Package" },
  { key: "category", label: "Category" },
  { key: "classification", label: "Classification" },
  { key: "gl_sl_code", label: "GL-SL Code" },
  { key: "uacs", label: "UACS" },
  { key: "acquisition_cost", label: "Acquisition Cost" },
  { key: "received_date", label: "Received Date" },
  { key: "estimated_useful_life", label: "Estimated Useful Life" },
  { key: "mode_acquisition", label: "Mode of Acquisition" },
  { key: "source_acquisition", label: "Source of Acquisition" },
  { key: "donor", label: "Donor" },
  { key: "source_fund", label: "Source of Fund" },
  { key: "allotment_class", label: "Allotment Class" },
  { key: "pmp_plan", label: "PMP Reference Item Number" },
  { key: "supporting_documents1", label: "Supporting Documents (Reference Item)" },
  { key: "or_si_dr_iar_no", label: "OR / SI / DR / IAR No." },
  { key: "transaction_type", label: "Transaction Type" },
  { key: "accountable_officer", label: "Accountable Officer" },
  { key: "date_assigned_accountable_officer", label: "Date Assigned to Accountable Officer" },
  { key: "end_user", label: "Custodian / End User" },
  { key: "date_assigned_end_user", label: "Date Assigned to End User" },
  { key: "received_by", label: "Received by" },
  { key: "date_received_new_accountable", label: "Date Received by New Accountable" },
  { key: "supporting_documents2", label: "Supporting Documents (Transaction)" },
  { key: "par_ics_rrsp_rs_wmr_no", label: "PAR / ICS / RRSP / RS / WMR No." },
  { key: "supplier", label: "Supplier / Distributor" },
  { key: "under_warranty", label: "Under Warranty" },
  { key: "end_warranty_date", label: "End of Warranty Date" },
  { key: "equipment_location", label: "Equipment Location" },
  { key: "non_functional", label: "Non-Functional" },
  { key: "erquipment_condition", label: "Equipment Condition" },
  { key: "disposition_status", label: "Accountability / Disposition Status" },
  { key: "remarks", label: "Remarks" },
  { key: "qr_code", label: "QR Code / Reference" },
];

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
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
  const tableEl = inventoryTableWrap?.querySelector(".inventoryTable");
  const forcedMinWidth = INVENTORY_COLUMNS.length * 170;
  if (tableEl) {
    tableEl.style.minWidth = `${forcedMinWidth}px`;
  }

  inventoryHead.innerHTML = `<tr>${INVENTORY_COLUMNS.map((c) => `<th>${c.label}</th>`).join("")}</tr>`;

  const filtered = inventoryRows.filter((row) => {
    const dynamic = INVENTORY_COLUMNS.map((c) => String(row.row_data?.[c.key] ?? row[c.key] ?? "")).join(" ");
    const blob = `${dynamic} ${row.item_name} ${row.quantity} ${row.item_condition} ${row.remarks}`.toLowerCase();
    return blob.includes(searchTerm);
  });

  const totalQty = filtered.reduce((sum, row) => sum + (parseInt(row.quantity, 10) || 0), 0);
  const schoolCount = new Set(filtered.map((row) => `${row.school_id}__${row.school_name.toLowerCase()}`)).size;
  summaryEl.textContent = `Admin combined view | Schools: ${schoolCount} | Items: ${filtered.length} | Quantity: ${totalQty}`;

  if (!filtered.length) {
    inventoryBody.innerHTML = `<tr><td colspan="${INVENTORY_COLUMNS.length}" class="empty">No records found.</td></tr>`;
    refreshInventorySlider();
    return;
  }

  inventoryBody.innerHTML = filtered.map((row) => `
    <tr>
      ${INVENTORY_COLUMNS.map((c) => {
        if (c.key === "school_id") return `<td>${row.school_id ?? ""}</td>`;
        if (c.key === "school_name") return `<td>${row.school_name ?? ""}</td>`;
        const fromRaw = row.row_data?.[c.key];
        if (fromRaw !== undefined && fromRaw !== null && String(fromRaw).trim() !== "") {
          return `<td>${fromRaw}</td>`;
        }
        if (c.key === "item") return `<td>${row.item_name ?? ""}</td>`;
        if (c.key === "remarks") return `<td>${row.remarks ?? ""}</td>`;
        if (c.key === "erquipment_condition") return `<td>${row.item_condition ?? ""}</td>`;
        return `<td></td>`;
      }).join("")}
    </tr>
  `).join("");

  refreshInventorySlider();
}

function refreshInventorySlider() {
  if (!inventoryTableWrap || !inventoryBottomBar || !inventoryBottomBarInner) return;
  const table = inventoryTableWrap.querySelector(".inventoryTable");
  const forcedMinWidth = INVENTORY_COLUMNS.length * 170;
  const measureWidth = () => {
    if (!table) return inventoryTableWrap.clientWidth;
    const baseWidth = Math.max(table.scrollWidth, table.offsetWidth);
    const headerCells = table.querySelectorAll("thead th");
    if (!headerCells.length) return baseWidth;
    const headerWidth = Array.from(headerCells).reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0);
    return Math.max(baseWidth, Math.ceil(headerWidth));
  };

  requestAnimationFrame(() => {
    const tableWidth = Math.max(measureWidth(), forcedMinWidth);
    const maxScroll = Math.max(0, tableWidth - inventoryTableWrap.clientWidth);
    inventoryBottomBarInner.style.width = `${Math.max(tableWidth, inventoryTableWrap.clientWidth + 1)}px`;
    inventoryTableWrap.scrollLeft = Math.min(inventoryTableWrap.scrollLeft, maxScroll);
    inventoryBottomBar.scrollLeft = inventoryTableWrap.scrollLeft;
  });
}

function renderImports() {
  if (!importRows.length) {
    importsBody.innerHTML = '<tr><td colspan="3" class="empty">No imported CSV yet.</td></tr>';
    return;
  }
  importsBody.innerHTML = importRows.map((row) => `
    <tr>
      <td>${row.school_name} (${row.school_id}) - ${row.file_name}</td>
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
      <td>${row.school_name} (${row.school_id}) - ${row.file_name}</td>
      <td>${row.row_count}</td>
      <td>${new Date(row.deleted_at).toLocaleString()}</td>
    </tr>
  `).join("");
}

function renderAdminUsers() {
  if (!adminUsersRows.length) {
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
  const [inventory, imports, deleted, admins] = await Promise.all([
    api("inventory"),
    api("imports"),
    api("deleted"),
    api("admin_users"),
  ]);

  inventoryRows = inventory.rows || [];
  importRows = imports.rows || [];
  deletedRows = deleted.rows || [];
  adminUsersRows = admins.rows || [];

  renderInventory();
  renderImports();
  renderDeleted();
  renderAdminUsers();
}

async function init() {
  try {
    const data = await api("session");
    activeSession = data.session || null;
    if (!activeSession || activeSession.role !== "admin") {
      window.location.href = "index.html";
      return;
    }
    activeSchoolBadge.textContent = activeSession.display || "ICT Admin";
    setMessage("Admin mode ready.");
    await refreshData();
    switchView("inventory");
  } catch (error) {
    setMessage(error.message, true);
  }
}

searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value.trim().toLowerCase();
  renderInventory();
});

inventoryTableWrap.addEventListener("scroll", () => {
  if (!inventoryBottomBar) return;
  inventoryBottomBar.scrollLeft = inventoryTableWrap.scrollLeft;
});

inventoryBottomBar.addEventListener("scroll", () => {
  inventoryTableWrap.scrollLeft = inventoryBottomBar.scrollLeft;
});

window.addEventListener("resize", refreshInventorySlider);

logoutBtn.addEventListener("click", async () => {
  try {
    await api("logout", { method: "POST" });
    window.location.href = "index.html";
  } catch (error) {
    setMessage(error.message, true);
  }
});

addAdminBtn.addEventListener("click", async () => {
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

init();
