// ── Supabase client ───────────────────────────────────────────────────────
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
