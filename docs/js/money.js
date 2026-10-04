// ── Money: currencies, EUR conversion, price input parsing ────────────────
// Shared by Wishlist and Subscriptions, which offer the same currencies.

export const CURRENCY_SYMBOLS = { EUR: "€", GBP: "£", USD: "$" };

// EUR-based rates; refreshed daily from the ECB via frankfurter.app,
// these values are only the offline fallback
let fxRates = { GBP: 0.85, USD: 1.10 };

export async function loadFx() {
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

// Items saved before wishlist currencies existed have none: treat as EUR
export function toEUR(amount, currency) {
  return !currency || currency === "EUR" ? amount : amount / fxRates[currency];
}

// "€12", "£9.99" — symbol + amount, no trailing zeros for whole numbers
export function formatAmount(amount, currency) {
  return `${CURRENCY_SYMBOLS[currency || "EUR"]}${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

// Price fields are plain text (no +/- spinners). Accepts "12", "12.5" and
// "12,50". Returns null when blank, NaN when it isn't a valid amount.
export function parseAmount(raw) {
  const value = raw.replace(/\s/g, "");
  if (value === "") return null;
  if (!/^\d+([.,]\d{1,2})?$/.test(value)) return NaN;
  return Number(value.replace(",", "."));
}
