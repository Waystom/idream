export function resolveImageConfig(env: Record<string, string | undefined>) {
  const base = env.GEMINI_IMAGE_ENDPOINT || env.GEMINI_IMAGE_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const url = new URL(base);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid image service URL");
  const complete = Boolean(env.GEMINI_IMAGE_ENDPOINT) || /\/images\/generations\/?$/.test(url.pathname) || url.pathname.endsWith(":generateContent");
  const openai = env.GEMINI_IMAGE_API_STYLE === "openai" || /\/images\/generations\/?$/.test(url.pathname) || (env.GEMINI_IMAGE_API_STYLE !== "gemini" && /\/v1\/?$/.test(url.pathname));
  const model = env.GEMINI_IMAGE_MODEL || (openai ? "gpt-image-2" : "gemini-2.5-flash-image-preview");
  if (!complete) url.pathname = `${url.pathname.replace(/\/$/, "")}/${openai ? "images/generations" : `models/${model}:generateContent`}`;
  return { endpoint: url.toString(), model, openai, authHeader: env.GEMINI_IMAGE_AUTH_HEADER || (openai ? "authorization" : "x-goog-api-key") };
}
