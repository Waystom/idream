import { NextResponse } from "next/server";
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
  text?: string;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  error?: {
    message?: string;
  };
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

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as ImageGenerationInput;

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

    const parts = data.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const base64 = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    const mimeType = imagePart?.inlineData?.mimeType || imagePart?.inline_data?.mime_type || "image/png";

    if (!base64) {
      throw new Error("生图接口没有返回图片。请确认中转站支持 Gemini 图片输出。");
    }

    const result: GeneratedImage = {
      imageUrl: `data:${mimeType};base64,${base64}`,
      mimeType
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成图片失败。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
