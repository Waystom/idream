import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { hasServiceKey, ServiceError } from "./service-errors";

let client: OpenAI | null = null;

export type DeepSeekChatCompletionParams = ChatCompletionCreateParamsNonStreaming & {
  thinking?: {
    type: "enabled" | "disabled";
  };
};

type DeepSeekRequestOptions = {
  timeoutMs?: number;
  maxRetries?: number;
};

export function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!hasServiceKey(apiKey)) {
    throw new ServiceError("梦境解析服务暂未就绪，请稍后再试。", 503);
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
  return process.env.DEEPSEEK_MODEL || "deepseek-flash";
}

export function getDeepSeekProModel() {
  return process.env.DEEPSEEK_PRO_MODEL || "deepseek-v4-pro";
}

export function createDeepSeekChatCompletion(params: DeepSeekChatCompletionParams, options: DeepSeekRequestOptions = {}): Promise<ChatCompletion> {
  return getDeepSeekClient().chat.completions.create(params, {
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries ?? 0
  });
}

export function isDeepSeekTimeoutError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  return /timeout|timed out|abort|aborted|deadline|504|FUNCTION_INVOCATION_TIMEOUT/i.test(`${name} ${message}`);
}

export function safeJsonParse<T>(content: string | null | undefined): T {
  if (!content) {
    throw new Error("The model returned an empty response.");
  }

  try {
    const value = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The model did not return an object.");
    return value as T;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("The model did not return JSON.");
    }

    return JSON.parse(match[0]) as T;
  }
}
