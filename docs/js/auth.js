import { sb } from "./db.js";

// ── Auth ──────────────────────────────────────────────────────────────────
// Single user; signups are disabled server-side.
const loginScreen  = document.getElementById("login-screen");
const appContainer = document.querySelector(".container");

let onSignedIn = async () => {};

export function showLogin() {
  loginScreen.hidden = false;
  appContainer.hidden = true;
}

async function showApp() {
  loginScreen.hidden = true;
  appContainer.hidden = false;
  await onSignedIn();
}

// `onReady` runs whenever the app becomes visible (page load or sign-in).
export async function initAuth(onReady) {
  onSignedIn = onReady;

  // Fires if the refresh token is rejected while the page is open, so an
  // expired session lands back on the login screen instead of failing silently
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showLogin();
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) await showApp();
  else showLogin();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("login-error");
  errEl.hidden = true;
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
  });
  if (error) {
    errEl.textContent = error.message;
    errEl.hidden = false;
    return;
  }
  document.getElementById("login-form").reset();
  await showApp();
});

document.getElementById("signout-btn").addEventListener("click", async () => {
  await sb.auth.signOut();
  showLogin();
});
