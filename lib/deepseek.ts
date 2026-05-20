import OpenAI from "openai";

let client: OpenAI | null = null;

export function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY");
  }

  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
    });
  }

  return client;
}

export function getDeepSeekModel() {
  return process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
}

export function getDeepSeekProModel() {
  return process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro";
}

export function safeJsonParse<T>(content: string | null | undefined): T {
  if (!content) {
    throw new Error("The model returned an empty response.");
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("The model did not return JSON.");
    }

    return JSON.parse(match[0]) as T;
  }
}
