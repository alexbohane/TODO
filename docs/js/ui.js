// ── Shared UI helpers ─────────────────────────────────────────────────────

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export const priceFmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// ── Error toast ───────────────────────────────────────────────────────────
const toast = document.getElementById("toast");
let toastTimer = null;

export function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

toast.addEventListener("click", () => { toast.hidden = true; });

// Marks a field as wrong (red outline + message) and focuses it; the outline
// clears as soon as the field is edited
export function flagInvalid(field, message) {
  field.classList.add("invalid");
  field.addEventListener("input", () => field.classList.remove("invalid"), { once: true });
  field.focus();
  showToast(message);
}

// ── Modals ────────────────────────────────────────────────────────────────
// While a modal is open the page behind it is pinned in place, so touch
// scrolling only ever moves the modal (iOS ignores overflow:hidden on body).
let lockedScrollY = 0;

export function openModal(overlay) {
  if (!document.body.classList.contains("modal-open")) {
    lockedScrollY = window.scrollY;
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.classList.add("modal-open");
  }
  overlay.classList.add("open");
  overlay.querySelector(".modal").scrollTop = 0;
}

export function closeModal(overlay) {
  overlay.classList.remove("open");
  if (document.querySelector(".modal-overlay.open")) return;
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, lockedScrollY);
}

// iOS doesn't shrink fixed overlays when the keyboard opens, so modals were
// partly hidden behind it. Expose the visible area as CSS vars instead, and
// keep the focused field on screen when that area changes.
const vv = window.visualViewport;

function syncViewport() {
  const root = document.documentElement.style;
  root.setProperty("--vvh", `${vv.height}px`);
  root.setProperty("--vv-top", `${vv.offsetTop}px`);

  const field = document.activeElement;
  if (field?.closest(".modal-overlay.open")) field.scrollIntoView({ block: "nearest" });
}

if (vv) {
  vv.addEventListener("resize", syncViewport);
  vv.addEventListener("scroll", syncViewport);
  syncViewport();
}

// ── Date/time hints ───────────────────────────────────────────────────────
// iOS shows an empty date/time field as a blank box, where desktop browsers
// show "dd/mm/yyyy". Each field sits in a .date-field wrapper that shows the
// same hint (CSS, iOS only) while it's empty. Call syncDateFields() after
// setting values from code, which fires no input events.
const DATE_HINT = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })
  .format(new Date(2033, 10, 22))
  .replace("22", "dd").replace("11", "mm").replace("2033", "yyyy");

const dateFields = [...document.querySelectorAll(".date-field")];

export function syncDateFields() {
  for (const wrap of dateFields) wrap.classList.toggle("empty", !wrap.firstElementChild.value);
}

for (const wrap of dateFields) {
  const input = wrap.firstElementChild;
  wrap.dataset.placeholder = input.type === "date" ? DATE_HINT : "--:--";
  input.addEventListener("input", syncDateFields);
  input.addEventListener("change", syncDateFields);
}
syncDateFields();

// ── Growing text boxes ────────────────────────────────────────────────────
// Description/notes boxes grow a line at a time to fit their text; a
// max-height in CSS caps them (.add-desc 4 lines, .modal-desc 10), after
// which they scroll and keep the line being typed in view.
export function autoGrow(textarea) {
  const borders = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight + borders}px`;
}

export function makeGrowing(textarea) {
  textarea.addEventListener("input", () => {
    autoGrow(textarea);
    if (textarea.selectionEnd === textarea.value.length) textarea.scrollTop = textarea.scrollHeight;
  });
}

// ── Add forms ─────────────────────────────────────────────────────────────
// Collapsed to a single input; the extras expand while you're using the form
export function expandOnFocus(form, input) {
  input.addEventListener("focus", () => form.classList.add("open"));
  // composedPath is fixed when the click starts, so a tap on something the
  // form re-renders (e.g. a category chip) still counts as inside it
  document.addEventListener("click", (e) => {
    if (!e.composedPath().includes(form)) form.classList.remove("open");
  });
}

// ── Item ⋯ menu ───────────────────────────────────────────────────────────
// One shared popover for every list item. Fixed-positioned so it's never
// clipped by, or stacked under, neighbouring cards.
export const MENU_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/></svg>`;

const menu = document.getElementById("item-menu");
let menuAnchor = null;
let menuHandlers = null;

export function openItemMenu(anchor, handlers) {
  if (menuAnchor === anchor) return closeItemMenu(); // second tap toggles it shut
  closeItemMenu();
  menuAnchor = anchor;
  menuHandlers = handlers;
  anchor.classList.add("active");
  anchor.setAttribute("aria-expanded", "true");
  menu.hidden = false;
  positionMenu();
}

// Below the button, right edges aligned; flips above near the screen bottom
function positionMenu() {
  const r = menuAnchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = menu;
  const below = r.bottom + 4 + h <= window.innerHeight - 8;
  menu.style.top  = `${below ? r.bottom + 4 : r.top - 4 - h}px`;
  menu.style.left = `${Math.max(8, r.right - w)}px`;
}

export function closeItemMenu() {
  if (!menuAnchor) return;
  menu.hidden = true;
  menuAnchor.classList.remove("active");
  menuAnchor.setAttribute("aria-expanded", "false");
  menuAnchor = null;
  menuHandlers = null;
}

menu.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-choice]");
  if (!choice) return;
  const handlers = menuHandlers;
  closeItemMenu();
  if (choice.dataset.choice === "edit") handlers.onEdit();
  else handlers.onDelete();
});

document.addEventListener("pointerdown", (e) => {
  if (menuAnchor && !menu.contains(e.target) && !menuAnchor.contains(e.target)) closeItemMenu();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeItemMenu(); });
// Follows its button while the page scrolls (a scroll can land just after the
// tap that opened it, e.g. iOS momentum); closes once the button is off-screen
function followAnchor() {
  if (!menuAnchor) return;
  const r = menuAnchor.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) closeItemMenu();
  else positionMenu();
}
window.addEventListener("scroll", followAnchor, true);
window.addEventListener("resize", followAnchor);

// ── List item entry animation ─────────────────────────────────────────────
// Only items that weren't in the previous render slide in. Animating every
// item on each re-render or tab switch made done/ticked items flash.
export function newItemTracker() {
  let shown = null;
  return (ids) => {
    const prev = shown;
    shown = new Set(ids);
    return (id) => prev !== null && !prev.has(id);
  };
}

document.addEventListener("animationend", (e) => {
  if (e.animationName === "slideIn") e.target.classList.remove("entering");
});
