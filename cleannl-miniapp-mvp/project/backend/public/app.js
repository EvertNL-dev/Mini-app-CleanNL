const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Zelfde origin als de backend (server.js serveert deze map), dus relatief pad
const API_BASE = "/api";

let allProducts = [];
let activeCategory = "Alle";
let currentProduct = null;

const grid = document.getElementById("productGrid");
const categoryFilter = document.getElementById("categoryFilter");
const modal = document.getElementById("productModal");
const modalMedia = document.getElementById("modalMedia");
const modalName = document.getElementById("modalName");
const modalDescription = document.getElementById("modalDescription");
const modalQuantities = document.getElementById("modalQuantities");

function formatPrice(price, currency) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: currency || "EUR" }).format(price);
}

async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/products`);
    allProducts = await res.json();
    renderCategories();
    renderGrid();
  } catch (err) {
    grid.innerHTML = `<div class="loading">Kon producten niet laden.</div>`;
    console.error(err);
  }
}

function renderCategories() {
  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
  const cats = ["Alle", ...categories];
  categoryFilter.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "category-chip" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => {
      activeCategory = cat;
      renderCategories();
      renderGrid();
    };
    categoryFilter.appendChild(btn);
  });
}

function renderGrid() {
  const filtered = activeCategory === "Alle"
    ? allProducts
    : allProducts.filter(p => p.category === activeCategory);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="loading">Geen producten in deze categorie.</div>`;
    return;
  }

  grid.innerHTML = "";
  filtered.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";
    const thumb = product.media?.find(m => m.type === "image")?.url || "";
    card.innerHTML = `
      <img class="thumb" src="${thumb}" alt="${product.name}" loading="lazy">
      <div class="info">
        <p class="name">${product.name}</p>
        <div class="meta">
          <span class="price">${formatPrice(product.price, product.currency)}</span>
          <span class="unit">${product.unit}</span>
        </div>
      </div>
    `;
    card.onclick = () => openProduct(product);
    grid.appendChild(card);
  });
}

function openProduct(product) {
  currentProduct = product;
  modalName.textContent = product.name;
  modalDescription.textContent = product.description || "";

  modalMedia.innerHTML = "";
  (product.media || []).forEach(m => {
    if (m.type === "video") {
      const video = document.createElement("video");
      video.src = m.url;
      video.controls = true;
      video.playsInline = true;
      modalMedia.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = m.url;
      img.alt = product.name;
      modalMedia.appendChild(img);
    }
  });

  modalQuantities.innerHTML = "";
  const quantities = product.quantities?.length
    ? product.quantities
    : [{ label: `1 ${product.unit}`, amount: 1, price: product.price }];

  quantities.forEach(q => {
    const row = document.createElement("div");
    row.className = "quantity-row";
    row.innerHTML = `<span>${q.label}</span><span class="qty-price">${formatPrice(q.price, product.currency)}</span>`;
    modalQuantities.appendChild(row);
  });

  modal.classList.remove("hidden");
}

document.getElementById("closeModal").onclick = () => modal.classList.add("hidden");
modal.onclick = (e) => { if (e.target === modal) modal.classList.add("hidden"); };

// Contact/bestel-knop: stuurt de gebruiker terug naar de bot-chat met een deeplink.
// Zet hieronder je eigen bot-username (zonder @) — de bot vangt dit op via /start contact_<id>
const BOT_USERNAME = "CleanNL_bot"; // TODO: pas aan naar je echte bot-username

document.getElementById("contactBtn").onclick = () => {
  if (!currentProduct) return;
  const deepLink = `https://t.me/${BOT_USERNAME}?start=contact_${currentProduct.id}`;
  if (tg) {
    tg.openTelegramLink(deepLink);
    tg.close();
  } else {
    window.open(deepLink, "_blank");
  }
};

loadProducts();
