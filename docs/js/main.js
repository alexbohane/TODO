// Entry point: wires tabs, the view toggle and global error handling, then
// starts auth. Each feature module registers its own listeners on import.
import { initAuth, showLogin } from "./auth.js";
import { showToast } from "./ui.js";
import { loadTodos, todoLists } from "./todos.js";
import { loadWishlist } from "./wishlist.js";
import { loadSubs } from "./subs.js";

// ── Errors ────────────────────────────────────────────────────────────────
// Any failed db() call ends up here, so failures are visible instead of
// silently leaving stale data on screen.
window.addEventListener("unhandledrejection", (e) => {
  const err = e.reason;
  if (err?.status === 401) {
    showLogin();
    showToast("Session expired. Please sign in again.");
    return;
  }
  showToast(`Something went wrong: ${err?.message || err}`);
});

// ── Tabs ──────────────────────────────────────────────────────────────────
const TAB_TITLES = { todos: "Todos", wishlist: "Wishlist", subs: "Subscriptions" };

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  for (const tab of Object.keys(TAB_TITLES)) {
    document.getElementById(`tab-${tab}`).hidden = tab !== name;
  }
  document.getElementById("page-title").textContent = TAB_TITLES[name];
  if (name === "wishlist") loadWishlist();
  if (name === "subs") loadSubs();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ── View toggle (compact / detailed, across all tabs) ─────────────────────
let detailedView = false;
const viewToggle = document.getElementById("view-toggle");

viewToggle.addEventListener("click", () => {
  detailedView = !detailedView;
  todoLists.forEach((list) => list.classList.toggle("detailed", detailedView));
  document.getElementById("wishlist-categories").classList.toggle("detailed", detailedView);
  document.getElementById("tab-subs").classList.toggle("detailed", detailedView);
  viewToggle.classList.toggle("active", detailedView);
  document.getElementById("view-icon").textContent = detailedView ? "▤" : "☰";
});

// ── Init ──────────────────────────────────────────────────────────────────
initAuth(loadTodos);
