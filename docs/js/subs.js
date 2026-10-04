import { sb, db } from "./db.js";
import { escapeHtml, priceFmt } from "./ui.js";

// ── State ─────────────────────────────────────────────────────────────────
let subs = [];

const subModal = document.getElementById("sub-modal");
const subForm  = document.getElementById("sub-form");

const CURRENCY_SYMBOLS = { EUR: "€", GBP: "£", USD: "$" };

// ── Currency ──────────────────────────────────────────────────────────────
// EUR-based rates; refreshed daily from the ECB via frankfurter.app,
// these values are only the offline fallback
let fxRates = { GBP: 0.85, USD: 1.10 };

async function loadFx() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = JSON.parse(localStorage.getItem("fxRates") || "null");
    if (cached && cached.date === today) {
      fxRates = cached.rates;
      return;
    }
    const res = await fetch("https://api.frankfurter.dev/v1/latest?to=GBP,USD");
    if (!res.ok) return;
    const data = await res.json();
    fxRates = data.rates;
    localStorage.setItem("fxRates", JSON.stringify({ date: today, rates: fxRates }));
  } catch (_) {
    // offline — fallback rates are close enough for a summary line
  }
}

function toEUR(amount, currency) {
  return currency === "EUR" ? amount : amount / fxRates[currency];
}

function monthlyCost(sub) {
  return sub.cycle === "yearly" ? sub.price / 12 : sub.price;
}

function myMonthlyEUR(sub) {
  return sub.paid_by_me ? toEUR(monthlyCost(sub), sub.currency) : 0;
}

// ── Render ────────────────────────────────────────────────────────────────
export async function loadSubs() {
  [subs] = await Promise.all([
    db(sb.from("subscriptions").select("*").order("created_at")),
    loadFx(),
  ]);
  renderSubs();
}

function renderSub(sub) {
  const li = document.createElement("li");
  li.className = `wishlist-item${sub.paid_by_me ? "" : " covered"}`;
  li.dataset.id = sub.id;

  const sym = CURRENCY_SYMBOLS[sub.currency];
  let priceText = `${sym}${sub.price}/${sub.cycle === "yearly" ? "yr" : "mo"}`;
  if (sub.cycle === "yearly" || sub.currency !== "EUR") {
    priceText += ` · ≈ ${priceFmt.format(toEUR(monthlyCost(sub), sub.currency))}/mo`;
  }

  li.innerHTML = `
    <div class="wishlist-header">
      <div class="wishlist-content">
        <div class="wishlist-name">${escapeHtml(sub.name)}</div>
        ${sub.cycle === "yearly" ? '<span class="sub-badge">yearly</span>' : ""}
        ${sub.paid_by_me ? "" : '<span class="sub-badge covered-badge">covered</span>'}
        <span class="wishlist-price">${priceText}</span>
        <button class="btn-icon btn-inline-edit" data-action="edit-sub" title="Edit">✎</button>
      </div>
      <div class="wishlist-actions">
        <button class="btn-icon danger" data-action="delete-sub" title="Delete">✕</button>
      </div>
    </div>
    ${sub.notes ? `<div class="wishlist-details"><div class="wishlist-desc">${escapeHtml(sub.notes)}</div></div>` : ""}
  `;
  return li;
}

function renderSubs() {
  const totals = { necessary: 0, optional: 0 };
  let coveredCount = 0;

  for (const category of ["necessary", "optional"]) {
    const list  = document.getElementById(`subs-${category}-list`);
    const empty = document.getElementById(`subs-${category}-empty`);
    const items = subs
      .filter((s) => s.category === category)
      .sort((a, b) => myMonthlyEUR(b) - myMonthlyEUR(a));

    list.innerHTML = "";
    for (const sub of items) list.appendChild(renderSub(sub));
    empty.hidden = items.length > 0;

    document.getElementById(`subs-${category}-count`).textContent = items.length || "";
    totals[category] = items.reduce((sum, s) => sum + myMonthlyEUR(s), 0);
    coveredCount += items.filter((s) => !s.paid_by_me).length;
    document.getElementById(`subs-${category}-total`).textContent =
      totals[category] > 0 ? `≈ ${priceFmt.format(totals[category])}/mo` : "";
  }

  const total = totals.necessary + totals.optional;
  const summary = document.getElementById("subs-summary");
  summary.hidden = subs.length === 0;
  document.getElementById("subs-total").innerHTML =
    `≈ ${priceFmt.format(total)}<span class="per"> /month</span>` +
    `<span class="per"> · ${priceFmt.format(total * 12)} /year</span>`;
  const parts = [
    `Necessary ${priceFmt.format(totals.necessary)}`,
    `Optional ${priceFmt.format(totals.optional)}`,
  ];
  if (coveredCount) parts.push(`${coveredCount} covered by others`);
  document.getElementById("subs-breakdown").textContent = parts.join(" · ");
}

// ── Modal ─────────────────────────────────────────────────────────────────
function openSubModal(sub, category) {
  document.getElementById("sub-id").value       = sub ? sub.id : "";
  document.getElementById("sub-name").value     = sub ? sub.name : "";
  document.getElementById("sub-price").value    = sub ? sub.price : "";
  document.getElementById("sub-currency").value = sub ? sub.currency : "EUR";
  document.getElementById("sub-cycle").value    = sub ? sub.cycle : "monthly";
  document.getElementById("sub-category").value = sub ? sub.category : category;
  document.getElementById("sub-covered").checked = sub ? !sub.paid_by_me : false;
  document.getElementById("sub-notes").value    = sub ? (sub.notes || "") : "";
  document.getElementById("sub-modal-title").textContent = sub ? "Edit Subscription" : "Add Subscription";
  subModal.classList.add("open");
  setTimeout(() => document.getElementById("sub-name").focus(), 50);
}

function closeSubModal() {
  subModal.classList.remove("open");
}

// ── Events ────────────────────────────────────────────────────────────────
document.getElementById("tab-subs").addEventListener("click", async (e) => {
  const actionEl = e.target.closest("[data-action]");

  if (!actionEl) {
    const item = e.target.closest(".wishlist-item");
    if (item) item.classList.toggle("expanded");
    return;
  }

  const action = actionEl.dataset.action;

  if (action === "add-sub") {
    openSubModal(null, actionEl.dataset.category);
    return;
  }

  const item = e.target.closest(".wishlist-item");
  if (!item) return;
  const id = Number(item.dataset.id);

  if (action === "edit-sub") {
    const sub = subs.find((s) => s.id === id);
    if (sub) openSubModal(sub, sub.category);
  } else if (action === "delete-sub") {
    await db(sb.from("subscriptions").delete().eq("id", id));
    await loadSubs();
  }
});

subForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("sub-name").value.trim();
  const price = parseFloat(document.getElementById("sub-price").value);
  if (!name) return document.getElementById("sub-name").focus();
  if (isNaN(price) || price < 0) return document.getElementById("sub-price").focus();

  const body = {
    name,
    price,
    currency:   document.getElementById("sub-currency").value,
    cycle:      document.getElementById("sub-cycle").value,
    category:   document.getElementById("sub-category").value,
    paid_by_me: !document.getElementById("sub-covered").checked,
    notes:      document.getElementById("sub-notes").value.trim() || null,
  };

  const id = document.getElementById("sub-id").value;
  if (id) {
    await db(sb.from("subscriptions").update(body).eq("id", id));
  } else {
    await db(sb.from("subscriptions").insert(body));
  }

  closeSubModal();
  await loadSubs();
});

document.getElementById("sub-modal-close").addEventListener("click", closeSubModal);
document.getElementById("sub-modal-cancel").addEventListener("click", closeSubModal);
subModal.addEventListener("click", (e) => { if (e.target === subModal) closeSubModal(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && subModal.classList.contains("open")) closeSubModal();
});
