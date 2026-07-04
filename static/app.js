const API = "/todos";
const WISH_CAT_API = "/wishlist/categories";
const WISH_ITEM_API = "/wishlist/items";

// ── State ─────────────────────────────────────────────────────────────────
let currentSort = "newest";
let detailedView = false;
let todoCache = new Map();
let wishCategories = [];
let wishItems = [];

// ── DOM refs ──────────────────────────────────────────────────────────────
const upcomingList    = document.getElementById("upcoming-list");
const upcomingSection = document.getElementById("upcoming-section");
const upcomingCount   = document.getElementById("upcoming-count");
const highList    = document.getElementById("high-list");
const mediumList  = document.getElementById("medium-list");
const lowList     = document.getElementById("low-list");
const highSection = document.getElementById("high-section");
const mediumSection = document.getElementById("medium-section");
const lowSection  = document.getElementById("low-section");
const highCount   = document.getElementById("high-count");
const mediumCount = document.getElementById("medium-count");
const lowCount    = document.getElementById("low-count");

const doneList    = document.getElementById("done-list");
const doneSection = document.getElementById("done-section");
const doneCount   = document.getElementById("done-count");
const emptyState  = document.getElementById("empty-state");

const addForm    = document.getElementById("add-form");
const titleInput = document.getElementById("title-input");

const editModal    = document.getElementById("edit-modal");
const editForm     = document.getElementById("edit-form");
const editId       = document.getElementById("edit-id");
const editTitle    = document.getElementById("edit-title");
const editDesc     = document.getElementById("edit-desc");
const editPriority = document.getElementById("edit-priority");
const editStatus   = document.getElementById("edit-status");
const editDue      = document.getElementById("edit-due");
const editDueTime  = document.getElementById("edit-due-time");
const editMdEditor = editModal.querySelector(".md-editor");

const wishModal    = document.getElementById("wish-modal");
const wishItemForm = document.getElementById("wish-item-form");

// ── API helpers ───────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  document.getElementById("tab-todos").hidden = name !== "todos";
  document.getElementById("tab-wishlist").hidden = name !== "wishlist";
  document.getElementById("page-title").textContent =
    name === "todos" ? "Todos" : "Wishlist";
  if (name === "wishlist") loadWishlist();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ── Todo: sort ────────────────────────────────────────────────────────────
function sortTodos(todos) {
  return [...todos].sort((a, b) =>
    currentSort === "oldest"
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at)
  );
}

// ── Todo: render ──────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

function isOverdue(todo) {
  if (!todo.due_date) return false;
  const time = todo.due_time ? todo.due_time.slice(0, 5) + ":00" : "23:59:59";
  return new Date(`${todo.due_date}T${time}`) < new Date();
}

function formatDueTime(t) {
  return t ? t.slice(0, 5) : "";
}

function renderTodo(todo) {
  const li = document.createElement("li");
  li.className = `todo-item${todo.status === "done" ? " done" : ""}`;
  li.dataset.id = todo.id;
  li.dataset.priority = todo.priority;
  if (todo.status !== "done") li.setAttribute("draggable", "true");

  const isDone  = todo.status === "done";
  const overdue = !isDone && isOverdue(todo);
  if (overdue) li.classList.add("overdue");

  let detailsHTML = "";
  if (todo.description) {
    detailsHTML += `<div class="todo-desc">${renderDesc(todo.description)}</div>`;
  }

  const hasDetails = detailsHTML.length > 0;

  let dueChip = "";
  if (todo.due_date) {
    const when = formatDate(todo.due_date) + (todo.due_time ? ` · ${formatDueTime(todo.due_time)}` : "");
    dueChip = `<span class="todo-due${overdue ? " overdue" : ""}">${overdue ? "Overdue · " : ""}${when}</span>`;
  }

  li.innerHTML = `
    <div class="todo-header">
      <div class="todo-content">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        ${dueChip}
        <button class="btn-icon btn-inline-edit" data-action="edit" title="Edit">✎</button>
      </div>
      <div class="todo-actions">
        <button class="btn-icon danger" data-action="delete" title="Delete">✕</button>
      </div>
      <div class="todo-checkbox${isDone ? " checked" : ""}" data-action="toggle"></div>
    </div>
    ${hasDetails ? `<div class="todo-details">${detailsHTML}</div>` : ""}
  `;

  // marked renders GFM task items as disabled checkboxes — make them live
  li.querySelectorAll('.todo-desc input[type="checkbox"]').forEach((cb, i) => {
    cb.disabled = false;
    cb.dataset.action = "check";
    cb.dataset.checkIndex = i;
  });

  return li;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const mdRenderer = new marked.Renderer();
mdRenderer.link = function ({ href, text }) {
  return `<a href="${href}" class="todo-link" target="_blank" rel="noopener" data-action="link">${text}</a>`;
};
marked.setOptions({ renderer: mdRenderer, breaks: true, gfm: true });

function renderDesc(raw) {
  return marked.parse(raw);
}

async function loadTodos() {
  const all = await api(API);
  todoCache = new Map(all.map((t) => [t.id, t]));

  const pending = all.filter((t) => t.status !== "done");
  const done    = sortTodos(all.filter((t) => t.status === "done"));

  // Dated items live in Upcoming (soonest first, so overdue floats to the top);
  // priority sections hold only undated items
  const upcoming = pending
    .filter((t) => t.due_date)
    .sort((a, b) =>
      `${a.due_date}T${a.due_time || ""}`.localeCompare(`${b.due_date}T${b.due_time || ""}`)
    );
  const undated = pending.filter((t) => !t.due_date);

  const high   = sortTodos(undated.filter((t) => t.priority === "high"));
  const medium = sortTodos(undated.filter((t) => t.priority === "medium"));
  const low    = sortTodos(undated.filter((t) => t.priority === "low"));

  upcomingList.innerHTML = highList.innerHTML = mediumList.innerHTML = lowList.innerHTML = doneList.innerHTML = "";

  const hasPending = pending.length > 0;
  document.getElementById("section-sort-bar").hidden = !hasPending;
  emptyState.hidden = hasPending || done.length > 0;

  // Priority sections
  function fillSection(section, list, count, items) {
    section.hidden = items.length === 0;
    count.textContent = items.length || "";
    for (const todo of items) list.appendChild(renderTodo(todo));
  }
  fillSection(upcomingSection, upcomingList, upcomingCount, upcoming);
  fillSection(highSection,   highList,   highCount,   high);
  fillSection(mediumSection, mediumList, mediumCount, medium);
  fillSection(lowSection,    lowList,    lowCount,    low);

  // Done section
  doneSection.hidden = done.length === 0;
  doneCount.textContent = done.length || "";
  for (const todo of done) doneList.appendChild(renderTodo(todo));
}

// ── Todo: actions ─────────────────────────────────────────────────────────
async function toggleDone(id, currentlyDone) {
  await api(`${API}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: currentlyDone ? "pending" : "done" }),
  });
  await loadTodos();
}

async function deleteTodo(id) {
  await api(`${API}/${id}`, { method: "DELETE" });
  await loadTodos();
}

// ── Interactive checklists ────────────────────────────────────────────────
// The Nth rendered checkbox corresponds to the Nth `[ ]`/`[x]` task marker
// in the markdown source, so we toggle by occurrence index.
function toggleTaskInMarkdown(md, index) {
  let i = -1;
  return md.replace(/^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/gm, (m, pre, mark, post) =>
    ++i === index ? pre + (mark === " " ? "x" : " ") + post : m
  );
}

async function toggleChecklistBox(itemEl, checkbox) {
  const id   = Number(itemEl.dataset.id);
  const todo = todoCache.get(id);
  if (!todo || !todo.description) return;

  const updatedDesc = toggleTaskInMarkdown(todo.description, Number(checkbox.dataset.checkIndex));
  if (updatedDesc === todo.description) return;

  const updated = await api(`${API}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ description: updatedDesc }),
  });
  todoCache.set(id, updated);

  // Re-render just this item so the expanded state survives
  const fresh = renderTodo(updated);
  if (itemEl.classList.contains("expanded")) fresh.classList.add("expanded");
  itemEl.replaceWith(fresh);
}

function openEdit(id) {
  api(`${API}/${id}`).then((todo) => {
    editId.value       = todo.id;
    editTitle.value    = todo.title;
    editDesc.value     = todo.description || "";
    editPriority.value = todo.priority;
    editStatus.value   = todo.status;
    editDue.value      = todo.due_date || "";
    editDueTime.value  = todo.due_time ? todo.due_time.slice(0, 5) : "";
    editMdEditor.resetTabs();
    editModal.classList.add("open");
  });
}

function closeModal() {
  editModal.classList.remove("open");
}

// ── Markdown editing helpers ─────────────────────────────────────────────
function getLineRange(value, start, end) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = value.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = value.length;
  return [lineStart, lineEnd];
}

function indentLines(textarea, outdent) {
  const { value, selectionStart, selectionEnd } = textarea;
  const [lineStart, lineEnd] = getLineRange(value, selectionStart, selectionEnd);
  const lines = value.slice(lineStart, lineEnd).split("\n");

  let startDelta = 0, totalDelta = 0;
  const newLines = lines.map((line, i) => {
    if (outdent) {
      const removed = line.match(/^( {1,2}|\t)/);
      const len = removed ? removed[0].length : 0;
      if (i === 0) startDelta = -len;
      totalDelta -= len;
      return line.slice(len);
    }
    if (i === 0) startDelta = 2;
    totalDelta += 2;
    return "  " + line;
  });

  textarea.setRangeText(newLines.join("\n"), lineStart, lineEnd, "select");
  textarea.selectionStart = Math.max(lineStart, selectionStart + startDelta);
  textarea.selectionEnd   = Math.max(textarea.selectionStart, selectionEnd + totalDelta);
}

function continueList(e, textarea) {
  const { value, selectionStart, selectionEnd } = textarea;
  if (selectionStart !== selectionEnd) return false;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const line  = value.slice(lineStart, selectionStart);
  const match = line.match(/^(\s*)([-*+]|\d+\.)( +)(\[[ xX]\] +)?(.*)$/);
  if (!match) return false;

  const [, indent, marker, , check, content] = match;
  e.preventDefault();

  if (content.trim() === "") {
    textarea.setRangeText("", lineStart, selectionStart, "end");
  } else {
    const nextMarker = /^\d+\.$/.test(marker) ? `${parseInt(marker, 10) + 1}.` : marker;
    textarea.setRangeText(`\n${indent}${nextMarker} ${check ? "[ ] " : ""}`, selectionStart, selectionEnd, "end");
  }
  return true;
}

function wrapSelection(textarea, wrapper) {
  const { value, selectionStart, selectionEnd } = textarea;
  const selected = value.slice(selectionStart, selectionEnd);
  const before   = value.slice(selectionStart - wrapper.length, selectionStart);
  const after    = value.slice(selectionEnd, selectionEnd + wrapper.length);

  if (selected && before === wrapper && after === wrapper) {
    textarea.setRangeText(selected, selectionStart - wrapper.length, selectionEnd + wrapper.length, "select");
    textarea.selectionStart = selectionStart - wrapper.length;
    textarea.selectionEnd   = textarea.selectionStart + selected.length;
  } else {
    textarea.setRangeText(`${wrapper}${selected}${wrapper}`, selectionStart, selectionEnd, "end");
    textarea.selectionStart = selectionStart + wrapper.length;
    textarea.selectionEnd   = textarea.selectionStart + selected.length;
  }
}

function attachMarkdownEditing(textarea) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      indentLines(textarea, e.shiftKey);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (e.key === "Enter") {
      if (continueList(e, textarea)) {
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } else if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "b" || key === "i") {
        e.preventDefault();
        wrapSelection(textarea, key === "b" ? "**" : "*");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  });
}

function setupMdEditor(editor) {
  const textarea = editor.querySelector(".md-textarea");
  const preview  = editor.querySelector(".md-preview");
  const tabs     = editor.querySelectorAll(".md-tab");

  function showTab(name) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    const isPreview = name === "preview";
    if (isPreview) preview.innerHTML = renderDesc(textarea.value);
    textarea.hidden = isPreview;
    preview.hidden  = !isPreview;
    if (!isPreview) textarea.focus();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
  textarea.addEventListener("input", () => {
    if (!preview.hidden) preview.innerHTML = renderDesc(textarea.value);
  });
  attachMarkdownEditing(textarea);
  editor.resetTabs = () => showTab("write");
}

// ── Todo: event listeners ─────────────────────────────────────────────────

titleInput.addEventListener("focus", () => addForm.classList.add("open"));

document.addEventListener("click", (e) => {
  if (!addForm.contains(e.target)) addForm.classList.remove("open");
});

document.getElementById("priority-picker").addEventListener("click", (e) => {
  const btn = e.target.closest(".prio-dot-btn");
  if (!btn) return;
  document.querySelectorAll(".prio-dot-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  document.getElementById("priority-input").value = btn.dataset.prio;
});

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    titleInput.focus();
    return;
  }

  const body = { title };
  const desc = document.getElementById("desc-input").value.trim();
  if (desc) body.description = desc;
  const priority = document.getElementById("priority-input").value;
  if (priority !== "medium") body.priority = priority;
  const due = document.getElementById("due-input").value;
  if (due) {
    body.due_date = due;
    const dueTime = document.getElementById("due-time-input").value;
    if (dueTime) body.due_time = dueTime;
  }

  await api(API, { method: "POST", body: JSON.stringify(body) });

  addForm.reset();
  document.getElementById("priority-input").value = "medium";
  document.querySelectorAll(".prio-dot-btn").forEach((b) => b.classList.remove("selected"));
  document.querySelector(".prio-dot-btn.medium").classList.add("selected");
  addForm.classList.remove("open");
  titleInput.focus();
  await loadTodos();
});

function handleListClick(e) {
  const item = e.target.closest(".todo-item");
  if (!item) return;

  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    const id     = item.dataset.id;
    const action = actionEl.dataset.action;
    if (action === "link")   return;
    if (action === "check")  toggleChecklistBox(item, actionEl);
    else if (action === "toggle") toggleDone(id, actionEl.classList.contains("checked"));
    else if (action === "delete") deleteTodo(id);
    else if (action === "edit")   openEdit(id);
    return;
  }

  item.classList.toggle("expanded");
}

[upcomingList, highList, mediumList, lowList, doneList].forEach((list) =>
  list.addEventListener("click", handleListClick)
);

// View toggle
const viewToggle = document.getElementById("view-toggle");
viewToggle.addEventListener("click", () => {
  detailedView = !detailedView;
  [upcomingList, highList, mediumList, lowList, doneList].forEach((list) =>
    list.classList.toggle("detailed", detailedView)
  );
  document.getElementById("wishlist-categories").classList.toggle("detailed", detailedView);
  viewToggle.classList.toggle("active", detailedView);
  document.getElementById("view-icon").textContent = detailedView ? "▤" : "☰";
});

// Sort dropdown
const sortDropdown = document.getElementById("sort-dropdown");
const sortTrigger  = document.getElementById("sort-trigger");
const sortMenu     = document.getElementById("sort-menu");
const sortLabel    = document.getElementById("sort-label");

const SORT_LABELS = { newest: "Newest", oldest: "Oldest" };

sortTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  sortDropdown.classList.toggle("open");
});

sortMenu.addEventListener("click", (e) => {
  const opt = e.target.closest(".sort-option");
  if (!opt) return;
  sortMenu.querySelectorAll(".sort-option").forEach((o) => o.classList.remove("active"));
  opt.classList.add("active");
  currentSort = opt.dataset.sort;
  sortLabel.textContent = SORT_LABELS[currentSort];
  sortDropdown.classList.remove("open");
  loadTodos();
});

document.addEventListener("click", () => sortDropdown.classList.remove("open"));

// Edit form
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editTitle.value.trim()) {
    editTitle.focus();
    return;
  }
  const id = editId.value;
  const body = {
    title:       editTitle.value.trim(),
    description: editDesc.value.trim() || null,
    priority:    editPriority.value,
    status:      editStatus.value,
    due_date:    editDue.value || null,
    due_time:    (editDue.value && editDueTime.value) ? editDueTime.value : null,
  };
  await api(`${API}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  closeModal();
  await loadTodos();
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
editModal.addEventListener("click", (e) => { if (e.target === editModal) closeModal(); });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (editModal.classList.contains("open")) closeModal();
    if (wishModal.classList.contains("open")) closeWishModal();
  }
});

// ── Wishlist: render ──────────────────────────────────────────────────────

async function loadWishlist() {
  [wishCategories, wishItems] = await Promise.all([
    api(WISH_CAT_API),
    api(WISH_ITEM_API),
  ]);
  renderWishlist();
}

function renderWishlist() {
  const container = document.getElementById("wishlist-categories");
  const empty     = document.getElementById("wishlist-empty");

  container.innerHTML = "";

  if (wishCategories.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  for (const cat of wishCategories) {
    const items = wishItems.filter((i) => i.category_id === cat.id);
    container.appendChild(renderCategory(cat, items));
  }
}

const priceFmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatPrice(price) {
  return priceFmt.format(price);
}

function renderCategory(cat, items) {
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
      ${total > 0 ? `<span class="section-total">${formatPrice(total)}</span>` : ""}
      <button class="category-add-btn" data-action="add-item" data-cat-id="${cat.id}">+ Add item</button>
      <button class="btn-icon danger" data-action="delete-category" data-cat-id="${cat.id}" title="Delete category">✕</button>
    </div>
    <ul class="wishlist-list" data-cat-id="${cat.id}"></ul>
    ${items.length === 0 ? '<p class="wishlist-section-empty">No items yet.</p>' : ""}
  `;

  const list = section.querySelector(".wishlist-list");
  for (const item of ordered) list.appendChild(renderWishItem(item));

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
        ${item.price != null ? `<span class="wishlist-price">${formatPrice(item.price)}</span>` : ""}
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

// ── Wishlist: event listeners ─────────────────────────────────────────────

document.getElementById("add-category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("category-input").value.trim();
  if (!name) return;
  await api(WISH_CAT_API, { method: "POST", body: JSON.stringify({ name }) });
  document.getElementById("category-input").value = "";
  await loadWishlist();
});

document.getElementById("wishlist-categories").addEventListener("click", async (e) => {
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
    await api(`${WISH_CAT_API}/${catId}`, { method: "DELETE" });
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
    await api(`${WISH_ITEM_API}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ purchased: !isPurchased }),
    });
    await loadWishlist();
    return;
  }

  if (action === "edit-item") {
    const itemData = wishItems.find((i) => i.id === id);
    if (itemData) openWishModal(itemData, itemData.category_id);
    return;
  }

  if (action === "delete-item") {
    await api(`${WISH_ITEM_API}/${id}`, { method: "DELETE" });
    await loadWishlist();
    return;
  }
});

// ── Wishlist item modal ───────────────────────────────────────────────────

function openWishModal(item, catId) {
  document.getElementById("wish-item-id").value    = item ? item.id : "";
  document.getElementById("wish-item-cat-id").value = catId;
  document.getElementById("wish-item-name").value  = item ? item.name : "";
  document.getElementById("wish-item-desc").value  = item ? (item.description || "") : "";
  document.getElementById("wish-item-url").value   = item ? (item.url || "") : "";
  document.getElementById("wish-item-price").value = item && item.price != null ? item.price : "";
  document.getElementById("wish-modal-title").textContent = item ? "Edit Item" : "Add Item";
  wishModal.classList.add("open");
  setTimeout(() => document.getElementById("wish-item-name").focus(), 50);
}

function closeWishModal() {
  wishModal.classList.remove("open");
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
    await api(`${WISH_ITEM_API}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  } else {
    await api(WISH_ITEM_API, {
      method: "POST",
      body: JSON.stringify({ ...body, category_id: parseInt(catId) }),
    });
  }

  closeWishModal();
  await loadWishlist();
});

document.getElementById("wish-modal-close").addEventListener("click", closeWishModal);
document.getElementById("wish-modal-cancel").addEventListener("click", closeWishModal);
wishModal.addEventListener("click", (e) => { if (e.target === wishModal) closeWishModal(); });

// ── Drag-and-drop: todos ──────────────────────────────────────────────────
let dragTodoId = null;

const todoTab = document.getElementById("tab-todos");

todoTab.addEventListener("dragstart", (e) => {
  const item = e.target.closest(".todo-item");
  if (!item || e.target.closest("[data-action]")) return;
  dragTodoId = item.dataset.id;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragTodoId);
  requestAnimationFrame(() => item.classList.add("dragging"));
});

todoTab.addEventListener("dragend", () => {
  todoTab.querySelectorAll(".todo-item.dragging").forEach(el => el.classList.remove("dragging"));
  todoTab.querySelectorAll(".todo-list.drag-over").forEach(el => el.classList.remove("drag-over"));
  dragTodoId = null;
});

[[highList, "high"], [mediumList, "medium"], [lowList, "low"]].forEach(([list, priority]) => {
  list.addEventListener("dragover", (e) => {
    if (!dragTodoId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!list.classList.contains("drag-over")) {
      todoTab.querySelectorAll(".todo-list.drag-over").forEach(el => el.classList.remove("drag-over"));
      list.classList.add("drag-over");
    }
  });

  list.addEventListener("dragleave", (e) => {
    if (!list.contains(e.relatedTarget)) list.classList.remove("drag-over");
  });

  list.addEventListener("drop", async (e) => {
    e.preventDefault();
    list.classList.remove("drag-over");
    if (!dragTodoId) return;
    const id = dragTodoId;
    dragTodoId = null;
    await api(`${API}/${id}`, { method: "PATCH", body: JSON.stringify({ priority }) });
    await loadTodos();
  });
});

// ── Drag-and-drop: wishlist ────────────────────────────────────────────────
let dragWishId  = null;
let dragWishCat = null;

const wishCatsContainer = document.getElementById("wishlist-categories");

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
  await api(`${WISH_ITEM_API}/${id}`, { method: "PATCH", body: JSON.stringify({ category_id: newCatId }) });
  await loadWishlist();
});

// ── Init ──────────────────────────────────────────────────────────────────
attachMarkdownEditing(document.getElementById("desc-input"));
setupMdEditor(editMdEditor);
loadTodos();
