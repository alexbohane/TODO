import { sb, db } from "./db.js";
import {
  escapeHtml, openModal, closeModal, newItemTracker, autoGrow, makeGrowing,
  expandOnFocus, openItemMenu, MENU_ICON, showToast, flagInvalid,
} from "./ui.js";

// ── State ─────────────────────────────────────────────────────────────────
// Each entry: { id, name, notes, fields: [{ label, value }, ...] }
let entries = [];
const trackEntries = newItemTracker();

const list  = document.getElementById("numbers-list");
const empty = document.getElementById("numbers-empty");

const COPY_ICON = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"/></svg>`;

// ── Render ────────────────────────────────────────────────────────────────
export async function loadNumbers() {
  entries = await db(sb.from("important_numbers").select("*"));
  renderNumbers();
}

function renderNumbers() {
  const sorted = [...entries].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  const isNew = trackEntries(sorted.map((e) => e.id));

  list.innerHTML = "";
  for (const entry of sorted) {
    const li = renderEntry(entry);
    if (isNew(entry.id)) li.classList.add("entering");
    list.appendChild(li);
  }
  empty.hidden = sorted.length > 0;
}

const copyButton = (index) =>
  `<button class="btn-icon copy-btn" data-action="copy" data-index="${index}" title="Copy">${COPY_ICON}</button>`;
const menuButton =
  `<button class="btn-icon item-menu-btn" data-action="menu" title="More" aria-haspopup="menu" aria-expanded="false">${MENU_ICON}</button>`;

// One value: a single row (name, value, ⋯, copy). Several: name + ⋯ on top,
// then a row per field with its own copy button, aligned with the ⋯ column.
function renderEntry(entry) {
  const li = document.createElement("li");
  li.className = "wishlist-item number-item";
  li.dataset.id = entry.id;

  const fields = entry.fields || [];
  const single = fields.length <= 1;
  const notes = entry.notes
    ? `<div class="wishlist-details"><div class="wishlist-desc">${escapeHtml(entry.notes)}</div></div>`
    : "";

  if (single) {
    li.innerHTML = `
      <div class="wishlist-header">
        <div class="wishlist-content">
          <div class="wishlist-name">${escapeHtml(entry.name)}</div>
          <span class="number-value">${escapeHtml(fields[0]?.value || "")}</span>
        </div>
        ${menuButton}
        ${copyButton(0)}
      </div>
      ${notes}`;
  } else {
    li.innerHTML = `
      <div class="wishlist-header">
        <div class="wishlist-content">
          <div class="wishlist-name">${escapeHtml(entry.name)}</div>
        </div>
        ${menuButton}
        <span class="copy-btn-spacer"></span>
      </div>
      <div class="number-fields">
        ${fields.map((f, i) => `
          <div class="number-field">
            <span class="number-label">${escapeHtml(f.label)}</span>
            <span class="number-value">${escapeHtml(f.value)}</span>
            ${copyButton(i)}
          </div>`).join("")}
      </div>
      ${notes}`;
  }
  return li;
}

// ── Copy ──────────────────────────────────────────────────────────────────
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    // Older iOS / non-secure contexts: fall back to a hidden textarea
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// ── Field editor (add form + edit modal) ──────────────────────────────────
// Rows of [label][value][✕] plus "+ Add field". Labels are optional; the ✕
// only shows once there's more than one row.
function fieldEditor(container) {
  container.innerHTML = `<div class="field-rows"></div>
    <button type="button" class="add-field-btn">+ Add field</button>`;
  const rows = container.querySelector(".field-rows");

  function addRow(label = "", value = "") {
    const row = document.createElement("div");
    row.className = "field-row";
    row.innerHTML = `
      <input type="text" class="field-label" placeholder="Label" aria-label="Label">
      <input type="text" class="field-value" placeholder="Value" aria-label="Value"
             autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button type="button" class="btn-icon field-remove" title="Remove field">✕</button>`;
    row.querySelector(".field-label").value = label;
    row.querySelector(".field-value").value = value;
    rows.appendChild(row);
    refresh();
    return row;
  }

  function refresh() {
    const all = rows.querySelectorAll(".field-row");
    all.forEach((r) => { r.querySelector(".field-remove").hidden = all.length === 1; });
  }

  container.querySelector(".add-field-btn").addEventListener("click", () => {
    addRow().querySelector(".field-label").focus();
  });
  rows.addEventListener("click", (e) => {
    if (!e.target.closest(".field-remove")) return;
    e.target.closest(".field-row").remove();
    refresh();
  });

  return {
    set(fields) {
      rows.innerHTML = "";
      (fields.length ? fields : [{ label: "", value: "" }]).forEach((f) => addRow(f.label, f.value));
    },
    // Rows with no value are dropped; returns null (and flags the first
    // value box) when nothing is left
    read() {
      const fields = [...rows.querySelectorAll(".field-row")]
        .map((r) => ({
          label: r.querySelector(".field-label").value.trim(),
          value: r.querySelector(".field-value").value.trim(),
        }))
        .filter((f) => f.value);
      if (fields.length) return fields;
      flagInvalid(rows.querySelector(".field-value"), "Add a value");
      return null;
    },
  };
}

// ── Add form ──────────────────────────────────────────────────────────────
const addForm    = document.getElementById("num-add-form");
const nameInput  = document.getElementById("num-name-input");
const notesInput = document.getElementById("num-notes-input");
const addFields  = fieldEditor(document.getElementById("num-add-fields"));
addFields.set([]);

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  const fields = addFields.read();
  if (!fields) return;

  await db(sb.from("important_numbers").insert({
    name,
    fields,
    notes: notesInput.value.trim() || null,
  }));

  addForm.reset();
  addFields.set([]);
  autoGrow(notesInput);
  addForm.classList.remove("open");
  nameInput.focus();
  await loadNumbers();
});

expandOnFocus(addForm, nameInput);
makeGrowing(notesInput);

// ── List clicks ───────────────────────────────────────────────────────────
list.addEventListener("click", async (e) => {
  const item = e.target.closest(".number-item");
  if (!item) return;
  const actionEl = e.target.closest("[data-action]");

  // Tapping a value selects it all, so it can also be copied by hand
  if (!actionEl) {
    if (!e.target.closest(".number-value")) item.classList.toggle("expanded");
    return;
  }

  const id = Number(item.dataset.id);
  const entry = entries.find((x) => x.id === id);
  if (!entry) return;

  if (actionEl.dataset.action === "copy") {
    await copyText(entry.fields[Number(actionEl.dataset.index)].value);
    actionEl.classList.add("copied");
    setTimeout(() => actionEl.classList.remove("copied"), 1200);
    showToast("Copied", { info: true });
  } else if (actionEl.dataset.action === "menu") {
    openItemMenu(actionEl, {
      onEdit: () => openNumModal(entry),
      onDelete: async () => {
        await db(sb.from("important_numbers").delete().eq("id", id));
        await loadNumbers();
      },
    });
  }
});

// ── Edit modal ────────────────────────────────────────────────────────────
const numModal   = document.getElementById("num-modal");
const numForm    = document.getElementById("num-form");
const numName    = document.getElementById("num-name");
const numNotes   = document.getElementById("num-notes");
const editFields = fieldEditor(document.getElementById("num-edit-fields"));

makeGrowing(numNotes);

function openNumModal(entry) {
  document.getElementById("num-id").value = entry.id;
  numName.value  = entry.name;
  numNotes.value = entry.notes || "";
  editFields.set(entry.fields || []);
  openModal(numModal);
  autoGrow(numNotes);
  numNotes.scrollTop = 0;
}

function closeNumModal() {
  closeModal(numModal);
}

numForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = numName.value.trim();
  if (!name) return numName.focus();
  const fields = editFields.read();
  if (!fields) return;

  const id = Number(document.getElementById("num-id").value);
  await db(sb.from("important_numbers").update({
    name,
    fields,
    notes: numNotes.value.trim() || null,
  }).eq("id", id));

  closeNumModal();
  await loadNumbers();
});

document.getElementById("num-modal-close").addEventListener("click", closeNumModal);
document.getElementById("num-modal-cancel").addEventListener("click", closeNumModal);
numModal.addEventListener("click", (e) => { if (e.target === numModal) closeNumModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && numModal.classList.contains("open")) closeNumModal();
});
