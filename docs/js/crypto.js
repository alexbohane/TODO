import { sb, db } from "./db.js";

// ── Client-side encryption ────────────────────────────────────────────────
// Each user has a random AES-GCM "data key" that encrypts their entries in
// the browser, so the database only ever holds ciphertext. The data key is
// stored in user_keys "wrapped" (encrypted) with a key derived from the
// user's password (PBKDF2), which only exists in the browser at the moments
// the password is typed: sign-in, choosing a password, or unlocking.
//
// Once unwrapped, the data key is kept on the device in IndexedDB as a
// non-extractable CryptoKey (usable, but its bytes can't be read out), and
// cleared on sign-out. There's no recovery: a reset password can't unwrap the
// old data key, so encrypted entries are cleared and a new key is made.

const KDF_ITERATIONS = 600000; // OWASP's PBKDF2-SHA256 recommendation
// Tables whose rows hold a `secret` column (see resetDataKey)
const ENCRYPTED_TABLES = ["important_numbers"];

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (bytes) => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const joinBytes = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };

async function passwordKey(password, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: KDF_ITERATIONS },
    base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]
  );
}

// Throws if the password is wrong (AES-GCM authentication fails)
async function unwrapDataKey(password, row) {
  const kek = await passwordKey(password, fromB64(row.salt));
  const blob = fromB64(row.wrapped_key);
  return crypto.subtle.unwrapKey(
    "raw", blob.slice(12), kek, { name: "AES-GCM", iv: blob.slice(0, 12) },
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}

async function newWrappedKey(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await passwordKey(password, salt);
  const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv });
  return { salt: toB64(salt), wrapped_key: toB64(joinBytes(iv, new Uint8Array(wrapped))) };
}

// ── Encrypt / decrypt values ──────────────────────────────────────────────
// Stored as base64(12-byte IV + ciphertext of the JSON)
export async function encryptJSON(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value)));
  return toB64(joinBytes(iv, new Uint8Array(ct)));
}

export async function decryptJSON(key, b64) {
  const blob = fromB64(b64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, key, blob.slice(12));
  return JSON.parse(dec.decode(pt));
}

// ── Device key store (IndexedDB, keyed by user id) ────────────────────────
function keyStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("todo-app-keys", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("keys", mode);
      const req = fn(tx.objectStore("keys"));
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

let cachedKey = null;

async function currentUserId() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.user.id ?? null;
}

// The signed-in user's data key, or null if this device hasn't unlocked yet
export async function getDataKey() {
  if (cachedKey) return cachedKey;
  const userId = await currentUserId();
  if (!userId) return null;
  cachedKey = (await keyStore("readonly", (s) => s.get(userId))) ?? null;
  return cachedKey;
}

async function rememberKey(key) {
  const userId = await currentUserId();
  await keyStore("readwrite", (s) => s.put(key, userId));
  cachedKey = key;
}

export async function forgetDeviceKeys() {
  cachedKey = null;
  await keyStore("readwrite", (s) => s.clear());
}

// ── Unlock / create / reset ───────────────────────────────────────────────
// Call with the user's (known-correct) password. Unwraps their data key, or
// creates one the first time. Throws if the password can't unwrap it.
export async function unlockWithPassword(password) {
  let row = (await db(sb.from("user_keys").select("salt, wrapped_key")))[0];
  if (!row) {
    const fresh = await newWrappedKey(password);
    const { error } = await sb.from("user_keys").insert(fresh);
    // Another device may have created it a moment ago: use theirs
    row = error ? (await db(sb.from("user_keys").select("salt, wrapped_key")))[0] : fresh;
  }
  await rememberKey(await unwrapDataKey(password, row));
}

// After a password reset the old data key is unreachable: drop it and every
// entry it encrypted, then start over with a key for the new password
export async function resetDataKey(password) {
  for (const table of ENCRYPTED_TABLES) {
    await db(sb.from(table).delete().not("secret", "is", null));
  }
  await db(sb.from("user_keys").delete().not("user_id", "is", null));
  await forgetDeviceKeys();
  await unlockWithPassword(password);
}
