import { NextResponse } from "next/server";
import { guardApiRequest, trimText } from "@/lib/api-guard";
import { getSupabaseAdminClient, hasSupabaseServerEnv } from "@/lib/supabase/server";
import type { GeneratedImage, ImageGenerationInput } from "@/lib/types";

export const runtime = "nodejs";

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

type ImagePayload = {
  buffer?: Buffer;
  mimeType: string;
  url?: string;
};

function getImageEndpoint() {
  const baseUrl = process.env.GEMINI_IMAGE_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image-preview";
  const trimmedBase = baseUrl.replace(/\/$/, "");

  if (trimmedBase.includes(":generateContent")) {
    return trimmedBase;
  }

  return `${trimmedBase}/models/${model}:generateContent`;
}

function getAuthHeaders(): Record<string, string> {
  const apiKey = process.env.GEMINI_IMAGE_API_KEY;
  const headerMode = process.env.GEMINI_IMAGE_AUTH_HEADER || "x-goog-api-key";

  if (!apiKey) {
    throw new Error("Missing GEMINI_IMAGE_API_KEY");
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

function buildPrompt(input: ImageGenerationInput) {
  return `
请生成一张安静、私密、严肃的梦境心理画像照片。

风格要求：
- 写实摄影感，不要卡通，不要赛博朋克，不要夸张奇幻。
- 灰蓝或暖灰底色，微弱暖金色光，像夜晚咨询室里的一束灯。
- 画面中不要出现真实名人、文字、水印、品牌标志。
- 不要直接描绘可识别的用户长相，表达心理氛围和象征即可。
- 构图高级、克制、留白充足，适合放在心理咨询产品中。

梦名：
${input.title || "未命名的梦"}

心理画像提示词：
${input.prompt}
`.trim();
}

async function fileUriToPayload(fileUri: string, fallbackMimeType: string): Promise<ImagePayload> {
  const response = await fetch(fileUri, {
    headers: getAuthHeaders()
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

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }

  if (mimeType.includes("webp")) {
    return "webp";
  }

  return "png";
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

async function persistImage(payload: ImagePayload, userId: string | null) {
  const bucket = process.env.SUPABASE_IMAGE_BUCKET || "dream-images";

  if (!payload.buffer || !userId || !hasSupabaseServerEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return payloadToResult(payload);
  }

  try {
    const admin = getSupabaseAdminClient();
    const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extensionForMimeType(payload.mimeType)}`;
    const { error } = await admin.storage.from(bucket).upload(path, payload.buffer, {
      contentType: payload.mimeType,
      upsert: false
    });

    if (error) {
      throw error;
    }

    const { data } = admin.storage.from(bucket).getPublicUrl(path);

    return {
      imageUrl: data.publicUrl,
      mimeType: payload.mimeType
    } satisfies GeneratedImage;
  } catch {
    return payloadToResult(payload);
  }
}

async function imagePayloadFromUrl(url: string, fallbackMimeType = "image/png"): Promise<ImagePayload> {
  if (url.startsWith("data:")) {
    return payloadFromBase64(url, fallbackMimeType);
  }

  if (!userCanFetchRemoteImage(url)) {
    return payloadFromUrl(url);
  }

  try {
    const response = await fetch(url);

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

export async function POST(request: Request) {
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

    const input = (await request.json()) as ImageGenerationInput;
    input.prompt = trimText(input.prompt, 800);
    input.title = trimText(input.title, 80);

    if (!input.prompt || input.prompt.trim().length < 8) {
      return NextResponse.json({ error: "缺少可用于生图的提示词。" }, { status: 400 });
    }

    const response = await fetch(getImageEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: buildPrompt(input)
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    });

    const data = (await response.json()) as GeminiImageResponse;

    if (!response.ok || data.error) {
      throw new Error(data.error?.message || "生成图片失败。");
    }

    const openAiImage = data.data?.find((item) => item.url || item.b64_json) || data.images?.find((item) => item.url || item.b64_json);
    const outputImage = data.output?.find((item) => item.url || item.b64_json || (item.type?.includes("image") && item.result));

    if (openAiImage?.url) {
      return NextResponse.json(await persistImage(await imagePayloadFromUrl(openAiImage.url), guard.userId));
    }

    if (openAiImage?.b64_json) {
      return NextResponse.json(await persistImage(payloadFromBase64(openAiImage.b64_json), guard.userId));
    }

    if (outputImage?.url) {
      return NextResponse.json(await persistImage(await imagePayloadFromUrl(outputImage.url), guard.userId));
    }

    if (outputImage?.b64_json || outputImage?.result) {
      return NextResponse.json(await persistImage(payloadFromBase64(outputImage.b64_json || outputImage.result || ""), guard.userId));
    }

    const parts = data.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const base64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    const mimeType = imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || "image/png";

    if (base64) {
      return NextResponse.json(await persistImage(payloadFromBase64(base64, mimeType), guard.userId));
    }

    const filePart = parts.find((part) => part.fileData?.fileUri || part.file_data?.file_uri);
    const fileUri = filePart?.fileData?.fileUri || filePart?.file_data?.file_uri;
    const fileMimeType = filePart?.fileData?.mimeType || filePart?.file_data?.mime_type || "image/png";

    if (!fileUri) {
      throw new Error("生图接口没有返回图片。请确认中转站支持 Gemini 图片输出。");
    }

    return NextResponse.json(await persistImage(await fileUriToPayload(fileUri, fileMimeType), guard.userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成图片失败。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
