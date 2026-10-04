import { sb, db } from "./db.js";
import {
  escapeHtml, priceFmt, openModal, closeModal, newItemTracker, autoGrow, makeGrowing,
  expandOnFocus, openItemMenu, MENU_ICON, flagInvalid,
} from "./ui.js";
import { loadFx, toEUR, formatAmount, parseAmount } from "./money.js";

// ── State ─────────────────────────────────────────────────────────────────
let wishCategories = [];
let wishItems = [];
const trackItems = newItemTracker();

const wishModal         = document.getElementById("wish-modal");
const wishItemForm      = document.getElementById("wish-item-form");
const wishCatsContainer = document.getElementById("wishlist-categories");
const wishItemDesc      = document.getElementById("wish-item-desc");

makeGrowing(wishItemDesc);

// ── Render ────────────────────────────────────────────────────────────────
export async function loadWishlist() {
  [wishCategories, wishItems] = await Promise.all([
    db(sb.from("wishlist_categories").select("*").order("created_at")),
    db(sb.from("wishlist_items").select("*").order("created_at")),
    loadFx(),
  ]);
  renderWishlist();
}

function renderWishlist() {
  const empty = document.getElementById("wishlist-empty");

  renderCategoryPicker();
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
  // Still to buy, in EUR; "≈" when other currencies were converted
  const toBuy = items.filter((i) => !i.purchased && i.price != null);
  const total = toBuy.reduce((sum, i) => sum + toEUR(i.price, i.currency), 0);
  const converted = toBuy.some((i) => (i.currency || "EUR") !== "EUR");

  section.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${escapeHtml(cat.name)}</h2>
      <span class="section-count">${items.length || ""}</span>
      ${total > 0 ? `<span class="section-total">${converted ? "≈ " : ""}${priceFmt.format(total)}</span>` : ""}
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
        ${item.price != null ? `<span class="wishlist-price">${formatAmount(item.price, item.currency)}</span>` : ""}
      </div>
      <button class="btn-icon item-menu-btn" data-action="menu" title="More" aria-haspopup="menu" aria-expanded="false">${MENU_ICON}</button>
      <div class="wish-check${item.purchased ? " checked" : ""}" data-action="toggle-purchased"></div>
    </div>
    ${detailsHTML ? `<div class="wishlist-details">${detailsHTML}</div>` : ""}
  `;

  return li;
}

// Optional price: blank is fine, anything else must be a valid amount
function readPrice(field) {
  const price = parseAmount(field.value);
  if (Number.isNaN(price)) {
    flagInvalid(field, "Enter a price as a number, e.g. 12.50");
    return undefined;
  }
  return price;
}

// ── Add form ──────────────────────────────────────────────────────────────
const wishAddForm      = document.getElementById("wish-add-form");
const wishNameInput    = document.getElementById("wish-name-input");
const wishDescInput    = document.getElementById("wish-desc-input");
const wishPriceInput   = document.getElementById("wish-price-input");
const wishCurrencyInput = document.getElementById("wish-currency-input");
const wishUrlInput     = document.getElementById("wish-url-input");
const categoryPicker   = document.getElementById("category-picker");
const newCategoryInput = document.getElementById("new-category-input");

// The category new items go into: a category id, or "new" to create one
let pickedCategory = null;

function renderCategoryPicker() {
  // Keep the pick while it exists; otherwise the first category, or "new"
  // when there are none yet
  if (pickedCategory !== "new" && !wishCategories.some((c) => c.id === pickedCategory)) {
    pickedCategory = wishCategories[0]?.id ?? "new";
  }
  const chip = (id, label) =>
    `<button type="button" class="cat-chip${id === pickedCategory ? " selected" : ""}" data-cat-id="${id}">${label}</button>`;
  categoryPicker.innerHTML =
    wishCategories.map((c) => chip(c.id, escapeHtml(c.name))).join("") + chip("new", "+ New");
  newCategoryInput.hidden = pickedCategory !== "new";
}

categoryPicker.addEventListener("click", (e) => {
  const chip = e.target.closest(".cat-chip");
  if (!chip) return;
  pickedCategory = chip.dataset.catId === "new" ? "new" : Number(chip.dataset.catId);
  renderCategoryPicker();
  if (pickedCategory === "new") newCategoryInput.focus();
});

wishAddForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = wishNameInput.value.trim();
  if (!name) return wishNameInput.focus();
  const price = readPrice(wishPriceInput);
  if (price === undefined) return;

  if (pickedCategory === "new") {
    const catName = newCategoryInput.value.trim();
    if (!catName) return newCategoryInput.focus();
    const cat = await db(sb.from("wishlist_categories").insert({ name: catName }).select().single());
    pickedCategory = cat.id; // also where the next item goes
  }

  await db(sb.from("wishlist_items").insert({
    name,
    description: wishDescInput.value.trim() || null,
    url:         wishUrlInput.value.trim() || null,
    price,
    currency:    wishCurrencyInput.value,
    category_id: pickedCategory,
  }));

  wishAddForm.reset();
  autoGrow(wishDescInput);
  wishAddForm.classList.remove("open");
  wishNameInput.focus();
  await loadWishlist();
});

expandOnFocus(wishAddForm, wishNameInput);
makeGrowing(wishDescInput);

// ── List clicks ───────────────────────────────────────────────────────────

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

  if (action === "menu") {
    openItemMenu(actionEl, {
      onEdit: () => {
        const itemData = wishItems.find((i) => i.id === id);
        if (itemData) openWishModal(itemData, itemData.category_id);
      },
      onDelete: async () => {
        await db(sb.from("wishlist_items").delete().eq("id", id));
        await loadWishlist();
      },
    });
  }
});

// ── Item modal ────────────────────────────────────────────────────────────
function openWishModal(item, catId) {
  document.getElementById("wish-item-id").value    = item ? item.id : "";
  document.getElementById("wish-item-cat-id").value = catId;
  document.getElementById("wish-item-name").value  = item ? item.name : "";
  wishItemDesc.value = item ? (item.description || "") : "";
  document.getElementById("wish-item-url").value   = item ? (item.url || "") : "";
  document.getElementById("wish-item-price").value = item && item.price != null ? item.price : "";
  document.getElementById("wish-item-currency").value = item?.currency || "EUR";
  document.getElementById("wish-modal-title").textContent = item ? "Edit Item" : "Add Item";
  openModal(wishModal);
  autoGrow(wishItemDesc);
  wishItemDesc.scrollTop = 0;
  setTimeout(() => document.getElementById("wish-item-name").focus(), 50);
}

function closeWishModal() {
  closeModal(wishModal);
}

wishItemForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id    = document.getElementById("wish-item-id").value;
  const catId = document.getElementById("wish-item-cat-id").value;
  const price = readPrice(document.getElementById("wish-item-price"));
  if (price === undefined) return;
  const body  = {
    name:        document.getElementById("wish-item-name").value.trim(),
    description: wishItemDesc.value.trim() || null,
    url:         document.getElementById("wish-item-url").value.trim() || null,
    price,
    currency:    document.getElementById("wish-item-currency").value,
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
