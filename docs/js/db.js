// ── Supabase client ───────────────────────────────────────────────────────
// Invite and password-reset email links land on the app with details after
// the "#": type=invite|recovery (plus the session), or an error such as an
// expired link. Read it now, before the client below consumes and clears it.
const linkParams = new URLSearchParams(location.hash.slice(1));
export const authLink = {
  type:  linkParams.get("type"),
  error: linkParams.get("error_description"),
};

// `supabase` and `SUPABASE_CONFIG` are globals from the classic scripts
// supabase.min.js and config.js, loaded before this module.
export const sb = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

// Unwraps a supabase-js query; throws on error so failures surface in the
// global error toast (see main.js). `status` lets callers spot 401s.
export async function db(query) {
  const { data, error, status } = await query;
  if (error) {
    const err = new Error(error.message);
    err.status = status;
    throw err;
  }
  return data;
}
