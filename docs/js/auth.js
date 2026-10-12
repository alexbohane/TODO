import { sb } from "./db.js";

// ── Auth ──────────────────────────────────────────────────────────────────
// Invite-only: accounts are created in the Supabase dashboard (signups are
// disabled), and row-level security limits each user to their own rows.
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

  // Fires on sign-out, or if the refresh token is rejected while the page is
  // open. Reloading (rather than just showing the login screen) drops every
  // bit of the previous user's data from memory and the page.
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
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
  // Start from a fresh page so nothing from an earlier session on this
  // device (another user's lists, picked category, …) can show through
  location.reload();
});

document.getElementById("signout-btn").addEventListener("click", async () => {
  await sb.auth.signOut(); // triggers SIGNED_OUT → reload
});
