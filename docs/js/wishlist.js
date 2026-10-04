import { sb, db } from "./db.js";
import { escapeHtml, priceFmt, openModal, closeModal, newItemTracker } from "./ui.js";

// ── State ─────────────────────────────────────────────────────────────────
let wishCategories = [];
let wishItems = [];
const trackItems = newItemTracker();

const wishModal         = document.getElementById("wish-modal");
const wishItemForm      = document.getElementById("wish-item-form");
const wishCatsContainer = document.getElementById("wishlist-categories");

// ── Render ────────────────────────────────────────────────────────────────
export async function loadWishlist() {
  [wishCategories, wishItems] = await Promise.all([
    db(sb.from("wishlist_categories").select("*").order("created_at")),
    db(sb.from("wishlist_items").select("*").order("created_at")),
  ]);
  renderWishlist();
}

function renderWishlist() {
  const empty = document.getElementById("wishlist-empty");

  wishCatsContainer.innerHTML = "";

  if (wishCategories.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const isNew = trackItems(wishItems.map((i) => i.id));
  for (const cat of wishCategories) {
    const items = wishItems.filter((i) => i.category_id === cat.id);
    wishCatsContainer.appendChild(renderCategory(cat, items, isNew));
  }
}

function renderCategory(cat, items, isNew) {
  const section = document.createElement("section");
  section.className = "wishlist-section";
  section.dataset.categoryId = cat.id;

  // Unpurchased first; purchased sink to the bottom
  const ordered = [...items.filter((i) => !i.purchased), ...items.filter((i) => i.purchased)];
  const total = items
    .filter((i) => !i.purchased && i.price != null)
    .reduce((sum, i) => sum + i.price, 0);

  section.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${escapeHtml(cat.name)}</h2>
      <span class="section-count">${items.length || ""}</span>
      ${total > 0 ? `<span class="section-total">${priceFmt.format(total)}</span>` : ""}
      <button class="category-add-btn" data-action="add-item" data-cat-id="${cat.id}">+ Add</button>
      <button class="btn-icon danger" data-action="delete-category" data-cat-id="${cat.id}" title="Delete category">✕</button>
    </div>
    <ul class="wishlist-list" data-cat-id="${cat.id}"></ul>
    ${items.length === 0 ? '<p class="wishlist-section-empty">Nothing yet.</p>' : ""}
  `;

  const list = section.querySelector(".wishlist-list");
  for (const item of ordered) {
    const li = renderWishItem(item);
    if (isNew(item.id)) li.classList.add("entering");
    list.appendChild(li);
  }

  return section;
}

function renderWishItem(item) {
  const li = document.createElement("li");
  li.className = `wishlist-item${item.purchased ? " purchased" : ""}`;
  li.dataset.id = item.id;
  li.dataset.catId = item.category_id;
  li.setAttribute("draggable", "true");

  let detailsHTML = "";
  if (item.description) {
    detailsHTML += `<div class="wishlist-desc">${escapeHtml(item.description)}</div>`;
  }
  if (item.url) {
    const href = /^https?:\/\//i.test(item.url) ? item.url : `https://${item.url}`;
    detailsHTML += `<a href="${escapeHtml(href)}" class="wishlist-url-link" target="_blank" rel="noopener" data-action="link">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8M8 1h3m0 0v3m0-3L5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      View product
    </a>`;
  }

  li.innerHTML = `
    <div class="wishlist-header">
      <div class="wishlist-content">
        <div class="wishlist-name">${escapeHtml(item.name)}</div>
        ${item.price != null ? `<span class="wishlist-price">${priceFmt.format(item.price)}</span>` : ""}
        <button class="btn-icon btn-inline-edit" data-action="edit-item" title="Edit">✎</button>
      </div>
      <div class="wishlist-actions">
        <button class="btn-icon danger" data-action="delete-item" title="Delete">✕</button>
      </div>
      <div class="wish-check${item.purchased ? " checked" : ""}" data-action="toggle-purchased"></div>
    </div>
    ${detailsHTML ? `<div class="wishlist-details">${detailsHTML}</div>` : ""}
  `;

  return li;
}

// ── Events ────────────────────────────────────────────────────────────────
document.getElementById("add-category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("category-input").value.trim();
  if (!name) return;
  await db(sb.from("wishlist_categories").insert({ name }));
  document.getElementById("category-input").value = "";
  await loadWishlist();
});

wishCatsContainer.addEventListener("click", async (e) => {
  const actionEl = e.target.closest("[data-action]");

  if (!actionEl) {
    const item = e.target.closest(".wishlist-item");
    if (item) item.classList.toggle("expanded");
    return;
  }

  const action = actionEl.dataset.action;
  if (action === "link") return;

  if (action === "delete-category") {
    const catId     = actionEl.dataset.catId;
    const cat       = wishCategories.find((c) => c.id == catId);
    const itemCount = wishItems.filter((i) => i.category_id == catId).length;
    const msg = itemCount > 0
      ? `Delete "${cat.name}" and its ${itemCount} item${itemCount > 1 ? "s" : ""}?`
      : `Delete category "${cat.name}"?`;
    if (!confirm(msg)) return;
    // items go with it via ON DELETE CASCADE
    await db(sb.from("wishlist_categories").delete().eq("id", catId));
    await loadWishlist();
    return;
  }

  if (action === "add-item") {
    openWishModal(null, parseInt(actionEl.dataset.catId));
    return;
  }

  const item = e.target.closest(".wishlist-item");
  if (!item) return;
  const id = parseInt(item.dataset.id);

  if (action === "toggle-purchased") {
    const isPurchased = actionEl.classList.contains("checked");
    await db(sb.from("wishlist_items").update({ purchased: !isPurchased }).eq("id", id));
    await loadWishlist();
    return;
  }

  if (action === "edit-item") {
    const itemData = wishItems.find((i) => i.id === id);
    if (itemData) openWishModal(itemData, itemData.category_id);
    return;
  }

  if (action === "delete-item") {
    await db(sb.from("wishlist_items").delete().eq("id", id));
    await loadWishlist();
    return;
  }
});

// ── Item modal ────────────────────────────────────────────────────────────
function openWishModal(item, catId) {
  document.getElementById("wish-item-id").value    = item ? item.id : "";
  document.getElementById("wish-item-cat-id").value = catId;
  document.getElementById("wish-item-name").value  = item ? item.name : "";
  document.getElementById("wish-item-desc").value  = item ? (item.description || "") : "";
  document.getElementById("wish-item-url").value   = item ? (item.url || "") : "";
  document.getElementById("wish-item-price").value = item && item.price != null ? item.price : "";
  document.getElementById("wish-modal-title").textContent = item ? "Edit Item" : "Add Item";
  openModal(wishModal);
  setTimeout(() => document.getElementById("wish-item-name").focus(), 50);
}

function closeWishModal() {
  closeModal(wishModal);
}

wishItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id    = document.getElementById("wish-item-id").value;
  const catId = document.getElementById("wish-item-cat-id").value;
  const rawPrice = document.getElementById("wish-item-price").value.trim();
  const body  = {
    name:        document.getElementById("wish-item-name").value.trim(),
    description: document.getElementById("wish-item-desc").value.trim() || null,
    url:         document.getElementById("wish-item-url").value.trim() || null,
    price:       rawPrice === "" || isNaN(parseFloat(rawPrice)) ? null : parseFloat(rawPrice),
  };

  if (id) {
    await db(sb.from("wishlist_items").update(body).eq("id", id));
  } else {
    await db(sb.from("wishlist_items").insert({ ...body, category_id: parseInt(catId) }));
  }

  closeWishModal();
  await loadWishlist();
});

document.getElementById("wish-modal-close").addEventListener("click", closeWishModal);
document.getElementById("wish-modal-cancel").addEventListener("click", closeWishModal);
wishModal.addEventListener("click", (e) => { if (e.target === wishModal) closeWishModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && wishModal.classList.contains("open")) closeWishModal();
});

// ── Drag-and-drop: move between categories ────────────────────────────────
let dragWishId  = null;
let dragWishCat = null;

wishCatsContainer.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".wishlist-item");
  if (!item || e.target.closest("[data-action]")) return;
  dragWishId  = item.dataset.id;
  dragWishCat = item.dataset.catId;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragWishId);
  requestAnimationFrame(() => item.classList.add("dragging"));
});

wishCatsContainer.addEventListener("dragend", () => {
  wishCatsContainer.querySelectorAll(".wishlist-item.dragging").forEach(el => el.classList.remove("dragging"));
  wishCatsContainer.querySelectorAll(".wishlist-section.drag-over").forEach(el => el.classList.remove("drag-over"));
  dragWishId  = null;
  dragWishCat = null;
});

wishCatsContainer.addEventListener("dragover", (e) => {
  if (!dragWishId) return;
  const section = e.target.closest(".wishlist-section");
  if (!section) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  if (!section.classList.contains("drag-over")) {
    wishCatsContainer.querySelectorAll(".wishlist-section.drag-over").forEach(el => el.classList.remove("drag-over"));
    section.classList.add("drag-over");
  }
});

wishCatsContainer.addEventListener("dragleave", (e) => {
  const section = e.target.closest(".wishlist-section");
  if (section && !section.contains(e.relatedTarget)) section.classList.remove("drag-over");
});

wishCatsContainer.addEventListener("drop", async (e) => {
  const section = e.target.closest(".wishlist-section");
  if (!section || !dragWishId) return;
  e.preventDefault();
  section.classList.remove("drag-over");
  const newCatId = parseInt(section.dataset.categoryId);
  if (newCatId === parseInt(dragWishCat)) return;
  const id = dragWishId;
  dragWishId = null;
  await db(sb.from("wishlist_items").update({ category_id: newCatId }).eq("id", id));
  await loadWishlist();
});
