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
