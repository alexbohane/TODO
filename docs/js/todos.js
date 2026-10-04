import { sb, db } from "./db.js";
import { escapeHtml, openModal, closeModal as closeOverlay, newItemTracker } from "./ui.js";
import { renderDesc, attachMarkdownEditing } from "./markdown.js";

// ── State ─────────────────────────────────────────────────────────────────
let currentSort = "newest";
let todoCache = new Map();
const trackTodos = newItemTracker();

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

export const todoLists = [upcomingList, highList, mediumList, lowList, doneList];

// ── Sort ──────────────────────────────────────────────────────────────────
function sortTodos(todos) {
  return [...todos].sort((a, b) =>
    currentSort === "oldest"
      ? new Date(a.created_at) - new Date(b.created_at)
      : new Date(b.created_at) - new Date(a.created_at)
  );
}

// ── Render ────────────────────────────────────────────────────────────────
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

export async function loadTodos() {
  const all = await db(sb.from("todos").select("*"));
  todoCache = new Map(all.map((t) => [t.id, t]));
  renderTodos();
}

// Renders from todoCache, so edits can show immediately before the save lands
function renderTodos() {
  const all = [...todoCache.values()];
  const isNew = trackTodos(all.map((t) => t.id));

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
    for (const todo of items) {
      const li = renderTodo(todo);
      if (isNew(todo.id)) li.classList.add("entering");
      list.appendChild(li);
    }
  }
  fillSection(upcomingSection, upcomingList, upcomingCount, upcoming);
  fillSection(highSection,   highList,   highCount,   high);
  fillSection(mediumSection, mediumList, mediumCount, medium);
  fillSection(lowSection,    lowList,    lowCount,    low);

  fillSection(doneSection, doneList, doneCount, done);
}

// ── Actions ───────────────────────────────────────────────────────────────
async function toggleDone(id, currentlyDone) {
  await db(sb.from("todos").update({ status: currentlyDone ? "pending" : "done" }).eq("id", id));
  await loadTodos();
}

async function deleteTodo(id) {
  await db(sb.from("todos").delete().eq("id", id));
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

  const updated = await db(
    sb.from("todos").update({ description: updatedDesc }).eq("id", id).select().single()
  );
  todoCache.set(id, updated);

  // Re-render just this item so the expanded state survives
  const fresh = renderTodo(updated);
  if (itemEl.classList.contains("expanded")) fresh.classList.add("expanded");
  itemEl.replaceWith(fresh);
}

// ── Edit modal ────────────────────────────────────────────────────────────
function openEdit(id) {
  const todo = todoCache.get(Number(id));
  if (!todo) return;
  editId.value       = todo.id;
  editTitle.value    = todo.title;
  editDesc.value     = todo.description || "";
  editPriority.value = todo.priority;
  editStatus.value   = todo.status;
  editDue.value      = todo.due_date || "";
  editDueTime.value  = todo.due_time ? todo.due_time.slice(0, 5) : "";
  openModal(editModal);
}

function closeModal() {
  closeOverlay(editModal);
}

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editTitle.value.trim()) {
    editTitle.focus();
    return;
  }
  const id = Number(editId.value);
  const body = {
    title:       editTitle.value.trim(),
    description: editDesc.value.trim() || null,
    priority:    editPriority.value,
    status:      editStatus.value,
    due_date:    editDue.value || null,
    due_time:    (editDue.value && editDueTime.value) ? editDueTime.value : null,
  };

  // Close and show the edit straight away; the save finishes in the
  // background. If it fails, reload the real data (the error toast shows).
  closeModal();
  todoCache.set(id, { ...todoCache.get(id), ...body });
  renderTodos();
  try {
    await db(sb.from("todos").update(body).eq("id", id));
  } catch (err) {
    await loadTodos();
    throw err;
  }
});

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
editModal.addEventListener("click", (e) => { if (e.target === editModal) closeModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editModal.classList.contains("open")) closeModal();
});

// ── Add form ──────────────────────────────────────────────────────────────
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

  await db(sb.from("todos").insert(body));

  addForm.reset();
  document.getElementById("priority-input").value = "medium";
  document.querySelectorAll(".prio-dot-btn").forEach((b) => b.classList.remove("selected"));
  document.querySelector(".prio-dot-btn.medium").classList.add("selected");
  addForm.classList.remove("open");
  titleInput.focus();
  await loadTodos();
});

// ── List clicks ───────────────────────────────────────────────────────────
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

todoLists.forEach((list) => list.addEventListener("click", handleListClick));

// ── Sort dropdown ─────────────────────────────────────────────────────────
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

// ── Drag-and-drop: change priority ────────────────────────────────────────
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
    await db(sb.from("todos").update({ priority }).eq("id", id));
    await loadTodos();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────
attachMarkdownEditing(document.getElementById("desc-input"));
attachMarkdownEditing(editDesc);

// Keep the caret in view while typing at the end of a long description
editDesc.addEventListener("input", () => {
  if (editDesc.selectionEnd === editDesc.value.length) editDesc.scrollTop = editDesc.scrollHeight;
});
