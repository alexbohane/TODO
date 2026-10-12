import { sb, authLink } from "./db.js";
import {
  getDataKey, keyStatus, unlockWithPassword, restoreWithRecoveryCode, startFresh, forgetDeviceKeys,
} from "./crypto.js";
import { copyText } from "./ui.js";

// ── Auth ──────────────────────────────────────────────────────────────────
// Invite-only: accounts are created in the Supabase dashboard (signups are
// disabled), and row-level security limits each user to their own rows.
// New users arrive from an invite email and choose their own password here;
// it goes straight to Supabase, so the owner never sees it.
//
// Data is encrypted in the browser (crypto.js), so being signed in isn't
// enough to show the app: this device also needs the user's data key, which
// only the password (or, after a reset, the recovery code) can unlock.

const SCREENS = ["login-screen", "password-screen", "unlock-screen", "recovery-screen", "restore-screen"];
const appContainer = document.querySelector(".container");

let onSignedIn = async () => {};

// Shows one of the full-page screens, or the app when `id` is null
function showScreen(id) {
  for (const screen of SCREENS) document.getElementById(screen).hidden = screen !== id;
  appContainer.hidden = id !== null;
}

export function showLogin() {
  showScreen("login-screen");
}

// Shows a message in a screen, hiding that screen's other messages
function showMessage(id, text) {
  const card = document.getElementById(id).closest(".login-card");
  for (const el of card.querySelectorAll(".login-error, #login-info")) el.hidden = true;
  const el = document.getElementById(id);
  el.textContent = text;
  el.hidden = false;
}

// Disables a form's submit button (and says so) while `work` runs
async function busy(form, label, work) {
  const btn = form.querySelector("[type=submit]");
  const text = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await work(); } finally { btn.disabled = false; btn.textContent = text; }
}

// `onReady` runs whenever the app becomes visible (page load or sign-in).
export async function initAuth(onReady) {
  onSignedIn = onReady;

  // Fires on sign-out, or if the refresh token is rejected while the page is
  // open. Reloading (rather than just showing the login screen) drops every
  // bit of the previous user's data from memory and the page.
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") forgetDeviceKeys().finally(() => location.reload());
  });

  // getSession waits for the client to finish reading any email link
  const { data: { session } } = await sb.auth.getSession();

  if (session && (authLink.type === "invite" || authLink.type === "recovery")) {
    showPasswordScreen(session.user.email, authLink.type === "recovery");
  } else if (session) {
    await enterApp(session.user.email);
  } else {
    showLogin();
    // e.g. an invite link that was already used or has expired
    if (authLink.error) {
      showMessage("login-error", `${authLink.error}. Use "Forgot password?" below to get a new link.`);
      history.replaceState(null, "", location.pathname);
    }
  }
}

// Signed in: show the app if this device can decrypt; otherwise ask for the
// password (also used once to create a recovery code for older keys)
async function enterApp(email) {
  const [status, key] = await Promise.all([keyStatus(), getDataKey()]);
  if (key && status === "ready") {
    showScreen(null);
    return onSignedIn();
  }
  const forRecovery = Boolean(key) && status === "legacy";
  document.getElementById("unlock-title").textContent = forRecovery ? "Create your recovery code" : "Unlock";
  document.getElementById("unlock-text").textContent = forRecovery
    ? "Your data is now encrypted. Enter your password once to create a recovery code, in case you ever forget it."
    : "Your data is encrypted. Enter your password to unlock it on this device.";
  document.getElementById("unlock-email").value = email;
  showScreen("unlock-screen");
  document.getElementById("unlock-password").focus();
}

// After unlocking: show a new recovery code first if one was just made
function finishUnlock(recoveryCode, then) {
  if (recoveryCode) showRecoveryCode(recoveryCode, then);
  else then();
}

// ── Sign in ───────────────────────────────────────────────────────────────
document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.target, "Signing in…", signIn);
});

async function signIn() {
  const password = document.getElementById("login-password").value;
  const { error } = await sb.auth.signInWithPassword({
    email: document.getElementById("login-email").value.trim(),
    password,
  });
  if (error) return showMessage("login-error", error.message);
  // The password is only available now: use it to unlock (or, the first
  // time, create) the encryption key. If that fails, the unlock screen asks
  // again after the reload.
  let recoveryCode;
  try { ({ recoveryCode } = await unlockWithPassword(password)); } catch (err) { console.error(err); }
  // Start from a fresh page so nothing from an earlier session on this
  // device (another user's lists, picked category, …) can show through
  finishUnlock(recoveryCode, () => location.reload());
}

// ── Unlock (signed in, but this device has no key) ────────────────────────
document.getElementById("unlock-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.target, "Unlocking…", unlock);
});

async function unlock() {
  const email = document.getElementById("unlock-email").value;
  const password = document.getElementById("unlock-password").value;
  // Check the password with Supabase first, so a typo can never be used to
  // create a key
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return showMessage("unlock-error", error.message);
  try {
    const { recoveryCode } = await unlockWithPassword(password);
    finishUnlock(recoveryCode, () => location.reload());
  } catch (err) {
    console.error(err);
    showMessage("unlock-error", "That password couldn't unlock your data.");
  }
}

document.getElementById("unlock-signout").addEventListener("click", async () => {
  await forgetDeviceKeys();
  await sb.auth.signOut(); // triggers SIGNED_OUT → reload
});

// ── Recovery code (shown once) ────────────────────────────────────────────
function showRecoveryCode(code, then) {
  document.getElementById("recovery-code").textContent = code;
  showScreen("recovery-screen");
  document.getElementById("recovery-done").onclick = then;
}

document.getElementById("recovery-copy").addEventListener("click", async (e) => {
  await copyText(document.getElementById("recovery-code").textContent);
  e.target.textContent = "Copied";
  setTimeout(() => { e.target.textContent = "Copy code"; }, 1500);
});

// ── Forgot password ───────────────────────────────────────────────────────
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

// ── Choose a password (invite and reset links) ────────────────────────────
function showPasswordScreen(email, isReset) {
  document.getElementById("password-title").textContent = isReset ? "Reset your password" : "Set your password";
  document.getElementById("password-note").hidden = !isReset;
  document.getElementById("password-email").value = email;
  showScreen("password-screen");
  document.getElementById("new-password").focus();
}

// Into the app, without the email link's "#…" in the address
const continueToApp = () => location.replace(location.pathname);

document.getElementById("password-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.target, "Saving…", savePassword);
});

async function savePassword() {
  const password = document.getElementById("new-password").value;
  const fail = (text) => showMessage("password-error", text);

  if (password.length < 8) return fail("Use at least 8 characters.");
  if (password !== document.getElementById("confirm-password").value) return fail("The passwords don't match.");

  const { error } = await sb.auth.updateUser({ password });
  if (error) return fail(error.message);

  // A reset leaves the data key locked to the old password: bring it back
  // with the recovery code (or start fresh). Otherwise unlock or create it.
  const status = authLink.type === "recovery" ? await keyStatus() : "none";
  if (status !== "none") return showRestore(password, status === "ready");
  let recoveryCode;
  try { ({ recoveryCode } = await unlockWithPassword(password)); } catch (err) { console.error(err); }
  finishUnlock(recoveryCode, continueToApp);
}

// ── Restore after a reset ─────────────────────────────────────────────────
let newPassword = null;

function showRestore(password, hasRecoveryCode) {
  newPassword = password;
  document.getElementById("restore-code-group").hidden = !hasRecoveryCode;
  document.getElementById("restore-submit").hidden = !hasRecoveryCode;
  document.getElementById("restore-text").textContent = hasRecoveryCode
    ? "Enter your recovery code to unlock your data with your new password."
    : "Your data was encrypted before recovery codes existed, so it can't be unlocked with a new password.";
  document.getElementById("start-fresh").textContent = hasRecoveryCode ? "I don't have it: start fresh" : "Start fresh";
  showScreen("restore-screen");
  if (hasRecoveryCode) document.getElementById("restore-code").focus();
}

document.getElementById("restore-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.target, "Restoring…", async () => {
    try {
      await restoreWithRecoveryCode(document.getElementById("restore-code").value, newPassword);
      continueToApp();
    } catch (err) {
      console.error(err);
      showMessage("restore-error", "That recovery code doesn't match. Check it and try again.");
    }
  });
});

// Deleting everything needs a second tap
let freshArmed = false;
document.getElementById("start-fresh").addEventListener("click", async (e) => {
  if (!freshArmed) {
    freshArmed = true;
    e.target.textContent = "Tap again to delete your encrypted data and start fresh";
    e.target.classList.add("danger");
    return;
  }
  e.target.disabled = true;
  const { recoveryCode } = await startFresh(newPassword);
  finishUnlock(recoveryCode, continueToApp);
});

document.getElementById("signout-btn").addEventListener("click", async () => {
  await forgetDeviceKeys();
  await sb.auth.signOut(); // triggers SIGNED_OUT → reload
});
