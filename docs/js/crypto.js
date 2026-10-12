import { sb, db } from "./db.js";

// ── Client-side encryption ────────────────────────────────────────────────
// Each user has a random AES-GCM "data key" that encrypts what they type, in
// the browser, so the database only ever holds ciphertext. The data key is
// stored in user_keys twice, each copy "wrapped" (encrypted) with a key
// derived (PBKDF2) from a secret only the user has:
//   • their password: unwrapped at sign-in, when choosing a password, or unlock
//   • a random recovery code, shown once: restores access after a reset
//
// Once unwrapped, the data key is kept on the device in IndexedDB as a
// non-extractable CryptoKey (usable, but its bytes can't be read out), and
// cleared on sign-out.

const KDF_ITERATIONS = 600000; // OWASP's PBKDF2-SHA256 recommendation
// Every table with a `secret` column, in a safe order for deleting
const ENCRYPTED_TABLES = ["important_numbers", "todos", "wishlist_items", "wishlist_categories", "subscriptions"];
const AES = { name: "AES-GCM", length: 256 };

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (bytes) => {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const joinBytes = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };

// ── Wrapping the data key ─────────────────────────────────────────────────
async function secretKey(secret, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: KDF_ITERATIONS },
    base, AES, false, ["wrapKey", "unwrapKey"]
  );
}

// → { salt, wrapped } (base64), the data key locked with `secret`
async function wrap(dataKey, secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", dataKey, await secretKey(secret, salt), { name: "AES-GCM", iv });
  return { salt: toB64(salt), wrapped: toB64(joinBytes(iv, new Uint8Array(wrapped))) };
}

// Throws if `secret` is wrong (AES-GCM authentication fails). Extractable,
// so it can be re-wrapped; see deviceKey for the copy that's kept.
async function unwrap(secret, salt, wrapped) {
  const blob = fromB64(wrapped);
  return crypto.subtle.unwrapKey(
    "raw", blob.slice(12), await secretKey(secret, fromB64(salt)),
    { name: "AES-GCM", iv: blob.slice(0, 12) }, AES, true, ["encrypt", "decrypt"]
  );
}

// The non-extractable copy of the data key that's stored on the device
async function deviceKey(dataKey) {
  const raw = await crypto.subtle.exportKey("raw", dataKey);
  return crypto.subtle.importKey("raw", raw, AES, false, ["encrypt", "decrypt"]);
}

// ── Recovery codes ────────────────────────────────────────────────────────
// 32 random characters from an alphabet without look-alikes (no 0/O,
// 1/I/L) — about 158 bits — shown in groups of four: "7KQ2-…"
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return chars.match(/.{4}/g).join("-");
}
// Typed codes: case, spaces and dashes don't matter
const normaliseCode = (code) => code.toUpperCase().replace(/[^0-9A-Z]/g, "");

async function recoveryColumns(dataKey, code) {
  const { salt, wrapped } = await wrap(dataKey, normaliseCode(code));
  return { recovery_salt: salt, recovery_wrapped_key: wrapped };
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

// ── Rows: the helpers every tab uses ──────────────────────────────────────
// `fields` are a table's content columns (what's encrypted); everything else
// on the row stays readable.

// Values to save: the content sealed into `secret`, readable copies emptied
// (null, or `empty[field]` for columns that can't be null, e.g. [] for lists)
export async function seal(fields, values, empty = {}) {
  const key = await getDataKey();
  if (!key) throw new Error("Locked: sign in again to unlock your data.");
  const content = Object.fromEntries(fields.map((f) => [f, values[f] ?? null]));
  const emptied = Object.fromEntries(fields.map((f) => [f, f in empty ? empty[f] : null]));
  return { secret: await encryptJSON(key, content), ...emptied };
}

// Rows as loaded → rows with their content decrypted. Rows saved before
// encryption are shown as they are and encrypted in the background; rows
// sealed with a key this device doesn't have are left out.
export async function openRows(table, rows, fields, empty = {}) {
  const key = await getDataKey();
  const out = [];
  const plaintext = [];
  for (const row of rows) {
    if (!row.secret) { out.push(row); plaintext.push(row); continue; }
    try { out.push({ ...row, ...(await decryptJSON(key, row.secret)) }); }
    catch (_) { console.warn(`${table} ${row.id}: can't be decrypted with this key`); }
  }
  if (key && plaintext.length) {
    Promise.all(plaintext.map(async (row) =>
      db(sb.from(table).update(await seal(fields, row, empty)).eq("id", row.id))
    )).catch((err) => console.error("Encrypting older rows failed", err));
  }
  return out;
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

async function rememberKey(dataKey) {
  const key = await deviceKey(dataKey);
  const userId = await currentUserId();
  await keyStore("readwrite", (s) => s.put(key, userId));
  cachedKey = key;
}

export async function forgetDeviceKeys() {
  cachedKey = null;
  await keyStore("readwrite", (s) => s.clear());
}

// ── Key row ───────────────────────────────────────────────────────────────
const KEY_COLUMNS = "salt, wrapped_key, recovery_salt, recovery_wrapped_key";

// "none" (no key yet), "legacy" (no recovery code yet) or "ready"
export async function keyStatus() {
  const row = (await db(sb.from("user_keys").select(KEY_COLUMNS)))[0];
  return !row ? "none" : row.recovery_wrapped_key ? "ready" : "legacy";
}

// Call with the user's (known-correct) password. Unwraps their data key, or
// creates one the first time. Returns { recoveryCode } when a new recovery
// code was made (new key, or a key from before recovery codes) — the caller
// must show it. Throws if the password can't unwrap the key.
export async function unlockWithPassword(password) {
  let row = (await db(sb.from("user_keys").select(KEY_COLUMNS)))[0];

  if (!row) {
    const dataKey = await crypto.subtle.generateKey(AES, true, ["encrypt", "decrypt"]);
    const recoveryCode = newRecoveryCode();
    const pw = await wrap(dataKey, password);
    const { error } = await sb.from("user_keys").insert({
      salt: pw.salt, wrapped_key: pw.wrapped, ...(await recoveryColumns(dataKey, recoveryCode)),
    });
    if (!error) {
      await rememberKey(dataKey);
      return { recoveryCode };
    }
    // Another device created one a moment ago: use that
    row = (await db(sb.from("user_keys").select(KEY_COLUMNS)))[0];
  }

  const dataKey = await unwrap(password, row.salt, row.wrapped_key);
  await rememberKey(dataKey);
  if (row.recovery_wrapped_key) return {};

  const recoveryCode = newRecoveryCode();
  await db(sb.from("user_keys").update(await recoveryColumns(dataKey, recoveryCode)).not("user_id", "is", null));
  return { recoveryCode };
}

// After a password reset: open the data key with the recovery code, then lock
// it with the new password (the recovery code keeps working). Throws if the
// code is wrong.
export async function restoreWithRecoveryCode(code, newPassword) {
  const row = (await db(sb.from("user_keys").select(KEY_COLUMNS)))[0];
  const dataKey = await unwrap(normaliseCode(code), row.recovery_salt, row.recovery_wrapped_key);
  const pw = await wrap(dataKey, newPassword);
  await db(sb.from("user_keys").update({ salt: pw.salt, wrapped_key: pw.wrapped }).not("user_id", "is", null));
  await rememberKey(dataKey);
}

// No way back in: delete everything the old key encrypted, then start over
// with a new key (and recovery code) for `password`
export async function startFresh(password) {
  for (const table of ENCRYPTED_TABLES) {
    await db(sb.from(table).delete().not("secret", "is", null));
  }
  await db(sb.from("user_keys").delete().not("user_id", "is", null));
  await forgetDeviceKeys();
  return unlockWithPassword(password);
}
