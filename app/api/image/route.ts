import { NextResponse } from "next/server";
import { guardApiRequest, readJsonObject, trimText } from "@/lib/api-guard";
import type { GeneratedImage, ImageGenerationInput } from "@/lib/types";
import { resolveImageConfig } from "@/lib/image-config";
import { hasServiceKey, ServiceError, serviceErrorResponse } from "@/lib/service-errors";

export const runtime = "nodejs";
export const maxDuration = 60;

type GeminiPart = {
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  inline_data?: {
    mime_type?: string;
    data?: string;
  };
  fileData?: {
    mimeType?: string;
    fileUri?: string;
  };
  file_data?: {
    mime_type?: string;
    file_uri?: string;
  };
  text?: string;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  images?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  output?: Array<{
    type?: string;
    result?: string;
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

type OpenAiImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  images?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  output?: Array<{
    type?: string;
    result?: string;
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

type ImagePayload = {
  buffer?: Buffer;
  mimeType: string;
  url?: string;
};

function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.GEMINI_IMAGE_API_KEY;
  const headerMode = resolveImageConfig(process.env).authHeader;

  if (!apiKey) {
    throw new ServiceError("梦境意象暂未开放，请稍后再试。", 503);
  }

  if (headerMode.toLowerCase() === "authorization") {
    return {
      Authorization: `Bearer ${apiKey}`
    };
  }

  return {
    "x-goog-api-key": apiKey
  };
}

async function parseImageResponse(response: Response): Promise<GeminiImageResponse | OpenAiImageResponse> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as GeminiImageResponse | OpenAiImageResponse;
  } catch {
    return {
      error: {
        message: text.slice(0, 400) || "生图接口返回了无法解析的响应。"
      }
    };
  }
}

function buildPrompt(input: ImageGenerationInput) {
  return `
请生成一张安静、私密、严肃的梦境意象照片。

风格要求：
- 写实摄影感，不要卡通，不要赛博朋克，不要夸张奇幻。
- 灰蓝或暖灰底色，微弱暖金色光，像夜晚咨询室里的一束灯。
- 画面中不要出现真实名人、文字、水印、品牌标志。
- 不要直接描绘可识别的人脸或用户长相，表达梦境氛围和象征即可。
- 构图高级、克制、留白充足，适合放在心理咨询产品中。

梦名：
${input.title || "未命名的梦"}

梦境意象提示词：
${input.prompt}
`.trim();
}

async function fileUriToPayload(fileUri: string, fallbackMimeType: string): Promise<ImagePayload> {
  const sameService = new URL(fileUri).origin === new URL(resolveImageConfig(process.env).endpoint).origin;
  const response = await fetch(fileUri, {
    headers: sameService ? getAuthHeaders() : undefined,
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error("生图接口返回了图片文件地址，但读取图片失败。");
  }

  const contentType = response.headers.get("content-type") || fallbackMimeType;
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    mimeType: contentType
  };
}

function payloadFromBase64(base64: string, mimeType = "image/png"): ImagePayload {
  if (base64.startsWith("data:")) {
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      return {
        url: base64,
        mimeType
      };
    }

    return {
      buffer: Buffer.from(match[2], "base64"),
      mimeType: match[1] || mimeType
    };
  }

  return {
    buffer: Buffer.from(base64, "base64"),
    mimeType
  };
}

function payloadFromUrl(url: string): ImagePayload {
  const mimeType = url.startsWith("data:image/") ? url.slice(5, url.indexOf(";")) : "image/png";

  return {
    url,
    mimeType: mimeType || "image/png"
  };
}

function payloadToResult(payload: ImagePayload): GeneratedImage {
  if (payload.url) {
    return {
      imageUrl: payload.url,
      mimeType: payload.mimeType
    };
  }

  if (!payload.buffer) {
    throw new Error("生图接口没有返回可用图片。");
  }

  return {
    imageUrl: `data:${payload.mimeType};base64,${payload.buffer.toString("base64")}`,
    mimeType: payload.mimeType
  };
}

async function imagePayloadFromUrl(url: string, fallbackMimeType = "image/png"): Promise<ImagePayload> {
  if (url.startsWith("data:")) {
    return payloadFromBase64(url, fallbackMimeType);
  }

  if (!userCanFetchRemoteImage(url)) {
    return payloadFromUrl(url);
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      return payloadFromUrl(url);
    }

    const mimeType = response.headers.get("content-type") || fallbackMimeType;
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      buffer,
      mimeType
    };
  } catch {
    return payloadFromUrl(url);
  }
}

function userCanFetchRemoteImage(url: string) {
  return /^https?:\/\//.test(url);
}

function firstOpenAiImage(data: OpenAiImageResponse) {
  return data.data?.find((item) => item.url || item.b64_json) || data.images?.find((item) => item.url || item.b64_json);
}

function firstOutputImage(data: OpenAiImageResponse) {
  return data.output?.find((item) => item.url || item.b64_json || (item.type?.includes("image") && item.result));
}

async function resultFromOpenAiImageResponse(data: OpenAiImageResponse) {
  const openAiImage = firstOpenAiImage(data);
  const outputImage = firstOutputImage(data);

  if (openAiImage?.url) {
    return payloadToResult(await imagePayloadFromUrl(openAiImage.url));
  }

  if (openAiImage?.b64_json) {
    return payloadToResult(payloadFromBase64(openAiImage.b64_json));
  }

  if (outputImage?.url) {
    return payloadToResult(await imagePayloadFromUrl(outputImage.url));
  }

  if (outputImage?.b64_json || outputImage?.result) {
    return payloadToResult(payloadFromBase64(outputImage.b64_json || outputImage.result || ""));
  }

  return null;
}

export async function POST(request: Request) {
  if (!hasServiceKey(process.env.GEMINI_IMAGE_API_KEY)) return NextResponse.json({ error: "梦境意象暂未开放，请稍后再试。" }, { status: 503 });
  try {
    const guard = await guardApiRequest(request, {
      key: "image",
      limit: 4,
      windowMs: 24 * 60 * 60 * 1000,
      requireUser: true,
      bypassForAdmin: true
    });

    if (!guard.ok) {
      return guard.response;
    }

    const input = await readJsonObject<ImageGenerationInput>(request);
    input.prompt = trimText(input.prompt, 800);
    input.title = trimText(input.title, 80);

    if (!input.prompt || input.prompt.trim().length < 8) {
      return NextResponse.json({ error: "缺少可用于生图的提示词。" }, { status: 400 });
    }

    const { endpoint, openai: isOpenAiStyle, model } = resolveImageConfig(process.env);
    const isSeedream = model.startsWith("doubao-seedream-");
    const prompt = buildPrompt(input);
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(48000),
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify(
        isOpenAiStyle
          ? {
              model,
              prompt,
              ...(isSeedream ? { stream: false, watermark: true } : { n: 1 }),
              size: process.env.GEMINI_IMAGE_SIZE || (isSeedream ? "2K" : "1024x1024"),
              ...(!model.startsWith("gpt-image-") ? { response_format: process.env.GEMINI_IMAGE_RESPONSE_FORMAT || (isSeedream ? "url" : "b64_json") } : {})
            }
          : {
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                responseModalities: ["TEXT", "IMAGE"]
              }
            }
      )
    });

    const data = await parseImageResponse(response);

    if (!response.ok || data.error) {
      console.error("[image] provider rejected request", { status: response.status, model });
      throw new ServiceError(response.status === 429 ? "生图服务当前繁忙，请稍后重试。" : "这次意象未能生成，请稍后重试。", response.status === 429 ? 503 : 502);
    }

    const openAiResult = await resultFromOpenAiImageResponse(data);
    if (openAiResult) {
      return NextResponse.json(openAiResult);
    }

    const geminiData = data as GeminiImageResponse;
    const parts = geminiData.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const base64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    const mimeType = imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || "image/png";

    if (base64) {
      return NextResponse.json(payloadToResult(payloadFromBase64(base64, mimeType)));
    }

    const filePart = parts.find((part) => part.fileData?.fileUri || part.file_data?.file_uri);
    const fileUri = filePart?.fileData?.fileUri || filePart?.file_data?.file_uri;
    const fileMimeType = filePart?.fileData?.mimeType || filePart?.file_data?.mime_type || "image/png";

    if (!fileUri) {
      throw new ServiceError("生图服务没有返回图片，请稍后重试。");
    }

    return NextResponse.json(payloadToResult(await fileUriToPayload(fileUri, fileMimeType)));
  } catch (error) {
    return serviceErrorResponse(error, "暂时无法生成梦境意象，请稍后重试。");
  }
}
