import { sb, authLink } from "./db.js";

// ── Auth ──────────────────────────────────────────────────────────────────
// Invite-only: accounts are created in the Supabase dashboard (signups are
// disabled), and row-level security limits each user to their own rows.
// New users arrive from an invite email and choose their own password here;
// it goes straight to Supabase, so the owner never sees it.
const loginScreen    = document.getElementById("login-screen");
const passwordScreen = document.getElementById("password-screen");
const appContainer   = document.querySelector(".container");

let onSignedIn = async () => {};

export function showLogin() {
  loginScreen.hidden = false;
  passwordScreen.hidden = true;
  appContainer.hidden = true;
}

function showMessage(id, text) {
  for (const el of loginScreen.querySelectorAll(".login-error, .login-info")) el.hidden = true;
  const el = document.getElementById(id);
  el.textContent = text;
  el.hidden = false;
}

// Invite links ("Set your password") and reset links ("Reset your password")
function showPasswordScreen(email, isReset) {
  document.getElementById("password-title").textContent = isReset ? "Reset your password" : "Set your password";
  document.getElementById("password-email").value = email;
  loginScreen.hidden = true;
  appContainer.hidden = true;
  passwordScreen.hidden = false;
  document.getElementById("new-password").focus();
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

  // getSession waits for the client to finish reading any email link
  const { data: { session } } = await sb.auth.getSession();

  if (session && (authLink.type === "invite" || authLink.type === "recovery")) {
    showPasswordScreen(session.user.email, authLink.type === "recovery");
  } else if (session) {
    await showApp();
  } else {
    showLogin();
    // e.g. an invite link that was already used or has expired
    if (authLink.error) {
      showMessage("login-error", `${authLink.error}. Use "Forgot password?" below to get a new link.`);
      history.replaceState(null, "", location.pathname);
    }
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById("login-email").value.trim(),
    password: document.getElementById("login-password").value,
  });
  if (error) return showMessage("login-error", error.message);
  // Start from a fresh page so nothing from an earlier session on this
  // device (another user's lists, picked category, …) can show through
  location.reload();
});

// Emails a reset link that comes back to this page (see initAuth). The reply
// is the same whether or not the address has an account.
document.getElementById("forgot-btn").addEventListener("click", async () => {
  const emailInput = document.getElementById("login-email");
  const email = emailInput.value.trim();
  if (!email) {
    emailInput.focus();
    return showMessage("login-error", "Enter your email above first.");
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  if (error) return showMessage("login-error", error.message);
  showMessage("login-info", "If that email has an account, a link to reset your password is on its way.");
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("password-error");
  const password = document.getElementById("new-password").value;
  const fail = (text) => { errEl.textContent = text; errEl.hidden = false; };

  if (password.length < 8) return fail("Use at least 8 characters.");
  if (password !== document.getElementById("confirm-password").value) return fail("The passwords don't match.");

  const { error } = await sb.auth.updateUser({ password });
  if (error) return fail(error.message);
  // Into the app, without the email link's "#…" in the address
  location.replace(location.pathname);
});

document.getElementById("signout-btn").addEventListener("click", async () => {
  await sb.auth.signOut(); // triggers SIGNED_OUT → reload
});
