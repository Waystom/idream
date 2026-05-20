import { NextResponse } from "next/server";
import { getDeepSeekClient, getDeepSeekProModel, safeJsonParse } from "@/lib/deepseek";
import { buildAnalysisPrompt } from "@/lib/prompts";
import type { AnalysisInput, DreamAnalysis } from "@/lib/types";

export const runtime = "nodejs";

function validateDreamInput(body: Partial<AnalysisInput>) {
  if (!body.dreamText || body.dreamText.trim().length < 12) {
    return "请至少写下十几个字的梦境内容。";
  }

  if (!body.selectedAnalyst) {
    return "请先选择一位心理学家。";
  }

  if (!body.followupAnswers || body.followupAnswers.length < 5) {
    return "请先回答完 5 个追问。";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalysisInput;
    const validationError = validateDreamInput(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const completion = await getDeepSeekClient().chat.completions.create({
      model: getDeepSeekProModel(),
      messages: [
        {
          role: "system",
          content: "你是一个中文梦境咨询产品中的结构化分析引擎。你必须只返回合法 json。"
        },
        {
          role: "user",
          content: buildAnalysisPrompt(body)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2600,
      // DeepSeek V4 accepts this OpenAI-compatible extension to keep JSON output stable.
      // @ts-expect-error DeepSeek-specific request parameter
      thinking: {
        type: "disabled"
      }
    });

    const analysis = safeJsonParse<DreamAnalysis>(completion.choices[0]?.message?.content);

    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败，请稍后再试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
