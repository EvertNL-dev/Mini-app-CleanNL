const API_BASE = "/api";

let token = localStorage.getItem("cleannl_admin_token");
let allProducts = [];
let editingProductId = null;
let editingMedia = []; // media van het product dat nu open staat

const loginScreen = document.getElementById("loginScreen");
const adminScreen = document.getElementById("adminScreen");
const statusMsg = document.getElementById("statusMsg");
const editModal = document.getElementById("editModal");
const quantityRowsEl = document.getElementById("quantityRows");
const mediaGrid = document.getElementById("mediaGrid");
const uploadStatus = document.getElementById("uploadStatus");

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function showStatus(text, isError = false) {
  statusMsg.textContent = text;
  statusMsg.classList.remove("hidden", "error");
  if (isError) statusMsg.classList.add("error");
  setTimeout(() => statusMsg.classList.add("hidden"), 4000);
}

// ---- Login ----
document.getElementById("loginBtn").onclick = async () => {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Inloggen mislukt.");

    token = data.token;
    localStorage.setItem("cleannl_admin_token", token);
    errorEl.classList.add("hidden");
    await enterAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
};

document.getElementById("logoutBtn").onclick = () => {
  localStorage.removeItem("cleannl_admin_token");
  token = null;
  location.reload();
};

async function enterAdmin() {
  await loadProducts();
  loginScreen.classList.add("hidden");
  adminScreen.classList.remove("hidden");
}

// ---- Tabbladen ----
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.dataset.tab;
    document.getElementById("tab-products").classList.toggle("hidden", tab !== "products");
    document.getElementById("tab-bot").classList.toggle("hidden", tab !== "bot");
    document.getElementById("addProductBtn").classList.toggle("hidden", tab !== "products");
    document.getElementById("pageTitle").textContent = tab === "products" ? "Producten" : "Bot";

    if (tab === "bot") loadBotTab();
  };
});

async function loadBotTab() {
  await Promise.all([loadBotSettings(), loadBotUsers()]);
}

// ---- Bot-instellingen ----
async function loadBotSettings() {
  const res = await fetch(`${API_BASE}/admin/bot-settings`, { headers: authHeaders() });
  const settings = await res.json();
  document.getElementById("bot_welcomeText").value = settings.welcomeText || "";
  document.getElementById("bot_logoUrl").value = settings.logoUrl || "";
  document.getElementById("bot_contactTelegramUrl").value = settings.contactTelegramUrl || "";
  document.getElementById("bot_contactSignalUrl").value = settings.contactSignalUrl || "";
  document.getElementById("bot_contactThreemaUrl").value = settings.contactThreemaUrl || "";
  document.getElementById("bot_socialInstagramUrl").value = settings.socialInstagramUrl || "";
}

document.getElementById("saveBotSettingsBtn").onclick = async () => {
  const body = {
    welcomeText: document.getElementById("bot_welcomeText").value.trim(),
    logoUrl: document.getElementById("bot_logoUrl").value.trim(),
    contactTelegramUrl: document.getElementById("bot_contactTelegramUrl").value.trim(),
    contactSignalUrl: document.getElementById("bot_contactSignalUrl").value.trim(),
    contactThreemaUrl: document.getElementById("bot_contactThreemaUrl").value.trim(),
    socialInstagramUrl: document.getElementById("bot_socialInstagramUrl").value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/admin/bot-settings`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error((await res.json()).error || "Opslaan mislukt.");
    showStatus("Bot-instellingen opgeslagen.");
  } catch (err) {
    showStatus(err.message, true);
  }
};

// ---- Bot-gebruikers ----
async function loadBotUsers() {
  const res = await fetch(`${API_BASE}/admin/bot-users`, { headers: authHeaders() });
  const users = await res.json();

  document.getElementById("userCount").textContent = `(${users.length})`;

  const tbody = document.getElementById("botUserTableBody");
  tbody.innerHTML = "";
  users.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.firstName || "-"}</td>
      <td>${u.username ? "@" + u.username : "-"}</td>
      <td>${u.chatId}</td>
      <td>${new Date(u.createdAt).toLocaleDateString("nl-NL")}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---- Broadcast ----
document.getElementById("sendBroadcastBtn").onclick = async () => {
  const message = document.getElementById("broadcastMessage").value.trim();
  if (!message) { alert("Typ eerst een bericht."); return; }
  if (!confirm("Weet je zeker dat je dit bericht naar alle gebruikers wilt sturen?")) return;

  const broadcastStatus = document.getElementById("broadcastStatus");
  broadcastStatus.classList.remove("hidden");
  broadcastStatus.textContent = "Bezig met versturen...";

  try {
    const res = await fetch(`${API_BASE}/admin/broadcast`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Versturen mislukt.");

    broadcastStatus.textContent = `Verstuurd: ${result.success}. Mislukt: ${result.failed}. (van ${result.total} gebruikers)`;
    document.getElementById("broadcastMessage").value = "";
  } catch (err) {
    broadcastStatus.textContent = "Fout: " + err.message;
  }
};

// ---- Producten laden ----
async function loadProducts() {
  const res = await fetch(`${API_BASE}/admin/products`, { headers: authHeaders() });
  if (res.status === 401) { token = null; localStorage.removeItem("cleannl_admin_token"); location.reload(); return; }
  allProducts = await res.json();
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("productTableBody");
  tbody.innerHTML = "";
  allProducts.forEach(p => {
    const thumb = p.media?.find(m => m.type === "image")?.url || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img src="${thumb}" alt=""></td>
      <td>${p.name}</td>
      <td>${p.category || "-"}</td>
      <td>${p.price?.toFixed ? p.price.toFixed(2) : p.price} ${p.currency}</td>
      <td>${p.active !== false ? "Ja" : "Nee"}</td>
      <td><button class="btn-secondary small" data-id="${p.id}">Bewerken</button></td>
    `;
    tr.querySelector("button").onclick = () => openEdit(p);
    tbody.appendChild(tr);
  });
}

// ---- Hoeveelheden in het formulier ----
function addQuantityRow(label = "", amount = "", price = "") {
  const row = document.createElement("div");
  row.className = "quantity-row-item";
  row.innerHTML = `
    <input placeholder="Label (bv. 2 stuks)" class="q_label" value="${label}">
    <input placeholder="Aantal" type="number" class="q_amount" value="${amount}" style="width:70px">
    <input placeholder="Prijs" type="number" step="0.01" class="q_price" value="${price}" style="width:80px">
    <button class="btn-secondary small remove-qty" type="button">×</button>
  `;
  row.querySelector(".remove-qty").onclick = () => row.remove();
  quantityRowsEl.appendChild(row);
}
document.getElementById("addQuantityBtn").onclick = () => addQuantityRow();

// ---- Media renderen ----
function renderMediaGrid() {
  mediaGrid.innerHTML = "";
  editingMedia.forEach(m => {
    const item = document.createElement("div");
    item.className = "media-item";
    item.innerHTML = m.type === "video"
      ? `<video src="${m.url}" muted></video>`
      : `<img src="${m.url}">`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-media";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => removeMedia(m.id);
    item.appendChild(removeBtn);
    mediaGrid.appendChild(item);
  });
}

async function removeMedia(mediaId) {
  if (!confirm("Deze foto/video verwijderen?")) return;
  await fetch(`${API_BASE}/admin/media/${mediaId}`, { method: "DELETE", headers: authHeaders() });
  editingMedia = editingMedia.filter(m => m.id !== mediaId);
  renderMediaGrid();
}

// ---- Directe upload naar Cloudinary ----
document.getElementById("mediaUploadBtn").onclick = () => {
  if (!editingProductId) {
    alert("Sla het product eerst op (met naam en prijs) voordat je media kunt uploaden.");
    return;
  }
  document.getElementById("mediaUploadInput").click();
};

document.getElementById("mediaUploadInput").onchange = async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  uploadStatus.classList.remove("hidden");

  for (const file of files) {
    uploadStatus.textContent = `Uploaden: ${file.name}...`;
    try {
      const media = await uploadFileToCloudinary(file, editingProductId);
      editingMedia.push(media);
      renderMediaGrid();
    } catch (err) {
      console.error(err);
      showStatus(`Upload van ${file.name} mislukt: ${err.message}`, true);
    }
  }

  uploadStatus.classList.add("hidden");
  e.target.value = "";
};

async function uploadFileToCloudinary(file, productId) {
  // 1. Vraag de backend om een ondertekende upload-aanvraag
  const sigRes = await fetch(`${API_BASE}/admin/cloudinary-signature`, {
    method: "POST",
    headers: authHeaders()
  });
  const sig = await sigRes.json();

  // 2. Upload het bestand RECHTSTREEKS naar Cloudinary (gaat niet via onze server)
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", sig.apiKey);
  formData.append("timestamp", sig.timestamp);
  formData.append("signature", sig.signature);
  formData.append("folder", sig.folder);

  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`,
    { method: "POST", body: formData }
  );
  const uploaded = await uploadRes.json();
  if (uploaded.error) throw new Error(uploaded.error.message);

  // 3. Sla de referentie op in onze eigen database
  const saveRes = await fetch(`${API_BASE}/admin/products/${productId}/media`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      url: uploaded.secure_url,
      cloudinaryId: uploaded.public_id,
      type: resourceType
    })
  });
  return saveRes.json();
}

// ---- Product bewerken/aanmaken ----
function openEdit(product) {
  editingProductId = product?.id || null;
  editingMedia = product?.media ? [...product.media] : [];

  document.getElementById("editTitle").textContent = product ? "Product bewerken" : "Nieuw product";
  document.getElementById("f_name").value = product?.name || "";
  document.getElementById("f_category").value = product?.category || "";
  document.getElementById("f_price").value = product?.price ?? "";
  document.getElementById("f_currency").value = product?.currency || "EUR";
  document.getElementById("f_unit").value = product?.unit || "stuk";
  document.getElementById("f_description").value = product?.description || "";
  document.getElementById("f_active").checked = product?.active !== false;

  quantityRowsEl.innerHTML = "";
  (product?.quantities || []).forEach(q => addQuantityRow(q.label, q.amount, q.price));

  renderMediaGrid();
  document.getElementById("deleteProductBtn").classList.toggle("hidden", !product);
  editModal.classList.remove("hidden");
}

document.getElementById("addProductBtn").onclick = () => openEdit(null);
document.getElementById("cancelEditBtn").onclick = () => { editModal.classList.add("hidden"); loadProducts(); };

document.getElementById("saveProductBtn").onclick = async () => {
  const name = document.getElementById("f_name").value.trim();
  const price = document.getElementById("f_price").value;
  if (!name || price === "") { alert("Naam en prijs zijn verplicht."); return; }

  const quantities = [...quantityRowsEl.querySelectorAll(".quantity-row-item")].map(row => ({
    label: row.querySelector(".q_label").value.trim(),
    amount: Number(row.querySelector(".q_amount").value) || 1,
    price: Number(row.querySelector(".q_price").value) || 0
  })).filter(q => q.label);

  const body = {
    name,
    category: document.getElementById("f_category").value.trim(),
    price: Number(price),
    currency: document.getElementById("f_currency").value.trim() || "EUR",
    unit: document.getElementById("f_unit").value.trim() || "stuk",
    description: document.getElementById("f_description").value.trim(),
    active: document.getElementById("f_active").checked,
    quantities
  };

  try {
    let saved;
    if (editingProductId) {
      const res = await fetch(`${API_BASE}/admin/products/${editingProductId}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      saved = await res.json();
    } else {
      const res = await fetch(`${API_BASE}/admin/products`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body)
      });
      saved = await res.json();
      // Product is nu net aangemaakt: modal openhouden zodat je meteen media kunt uploaden
      editingProductId = saved.id;
      document.getElementById("editTitle").textContent = "Product bewerken";
      document.getElementById("deleteProductBtn").classList.remove("hidden");
      showStatus("Product aangemaakt — je kunt nu foto's/video's uploaden.");
      await loadProducts();
      return;
    }

    await loadProducts();
    editModal.classList.add("hidden");
    showStatus("Opgeslagen.");
  } catch (err) {
    showStatus(err.message, true);
  }
};

document.getElementById("deleteProductBtn").onclick = async () => {
  if (!confirm("Weet je zeker dat je dit product wilt verwijderen? Media wordt ook bij Cloudinary verwijderd.")) return;
  await fetch(`${API_BASE}/admin/products/${editingProductId}`, { method: "DELETE", headers: authHeaders() });
  editModal.classList.add("hidden");
  await loadProducts();
  showStatus("Product verwijderd.");
};

// ---- Init ----
if (token) {
  enterAdmin().catch(() => { localStorage.removeItem("cleannl_admin_token"); location.reload(); });
}
