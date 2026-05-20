import { NextResponse } from "next/server";
import { getDeepSeekClient, getDeepSeekModel, safeJsonParse } from "@/lib/deepseek";
import { buildNextFollowupPrompt } from "@/lib/prompts";
import type { NextFollowupInput, NextFollowupQuestion } from "@/lib/types";

export const runtime = "nodejs";

function validateInput(body: Partial<NextFollowupInput>) {
  if (!body.selectedAnalyst) {
    return "请先选择一位心理学家。";
  }

  if (!body.dreamText || body.dreamText.trim().length < 12) {
    return "请至少写下十几个字的梦境内容。";
  }

  if (typeof body.questionIndex !== "number" || body.questionIndex < 0 || body.questionIndex > 4) {
    return "追问序号不正确。";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NextFollowupInput;
    const validationError = validateInput(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const completion = await getDeepSeekClient().chat.completions.create({
      model: getDeepSeekModel(),
      messages: [
        {
          role: "system",
          content: "你是一个中文梦境咨询产品中的逐步追问引擎。你必须只返回合法 json。"
        },
        {
          role: "user",
          content: buildNextFollowupPrompt(body)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.72,
      max_tokens: 700,
      // DeepSeek V4 accepts this OpenAI-compatible extension to keep JSON output stable.
      // @ts-expect-error DeepSeek-specific request parameter
      thinking: {
        type: "disabled"
      }
    });

    const followup = safeJsonParse<NextFollowupQuestion>(completion.choices[0]?.message?.content);

    return NextResponse.json(followup);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成追问失败，请稍后再试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
