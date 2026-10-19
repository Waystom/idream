import { NextResponse } from "next/server";
import { guardApiRequest, isAnalystKey, readJsonObject, trimText } from "@/lib/api-guard";
import { hasServiceKey, serviceErrorResponse } from "@/lib/service-errors";
import { createDeepSeekChatCompletion, getDeepSeekModel, safeJsonParse } from "@/lib/deepseek";
import { buildNextFollowupPrompt } from "@/lib/prompts";
import type { NextFollowupInput, NextFollowupQuestion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function validateInput(body: Partial<NextFollowupInput>) {
  if (!isAnalystKey(body.selectedAnalyst)) {
    return "请先选择一位心理学家。";
  }

  if (!body.dreamText || body.dreamText.trim().length < 12) {
    return "请至少写下十几个字的梦境内容。";
  }

  if (typeof body.questionIndex !== "number" || !Number.isInteger(body.questionIndex) || body.questionIndex < 0 || body.questionIndex > 4) {
    return "追问序号不正确。";
  }

  return null;
}

export async function POST(request: Request) {
  if (!hasServiceKey(process.env.DEEPSEEK_API_KEY)) return NextResponse.json({ error: "梦境解析服务暂未就绪，请稍后再试。" }, { status: 503 });
  try {
    const guard = await guardApiRequest(request, {
      key: "followup",
      limit: 25,
      windowMs: 24 * 60 * 60 * 1000,
      requireUser: true,
      bypassForAdmin: true
    });

    if (!guard.ok) {
      return guard.response;
    }

    const body = await readJsonObject<NextFollowupInput>(request);
    body.dreamText = trimText(body.dreamText, 4000);
    body.wakingLife = trimText(body.wakingLife, 1200);
    body.mood = trimText(body.mood, 800);
    body.previousProfile = trimText(body.previousProfile, 1800);
    body.previousAnswers = (Array.isArray(body.previousAnswers) ? body.previousAnswers : []).slice(0, 5).map((item) => ({
      question: trimText(item?.question, 160),
      answer: trimText(item?.answer, 1200)
    }));

    const validationError = validateInput(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const completion = await createDeepSeekChatCompletion({
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
      thinking: {
        type: "disabled"
      }
    }, {
      timeoutMs: 20000,
      maxRetries: 0
    });

    const followup = safeJsonParse<NextFollowupQuestion>(completion.choices[0]?.message?.content);
    if (!trimText(followup.question, 1000)) throw new Error("Missing followup question");

    return NextResponse.json(followup);
  } catch (error) {
    return serviceErrorResponse(error, "暂时无法生成追问，请稍后重试。");
  }
}
