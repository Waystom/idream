export function resolveSupabaseConfig(url?: string, key?: string) {
  if (!url || !key || /your[-_]|placeholder/i.test(`${url} ${key}`)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

export function getSupabaseConfig() {
  return resolveSupabaseConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
