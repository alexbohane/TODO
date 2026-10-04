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
