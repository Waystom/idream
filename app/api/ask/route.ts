import { NextResponse } from "next/server";
import { guardApiRequest, readJsonObject, trimText } from "@/lib/api-guard";
import { createDeepSeekChatCompletion, getDeepSeekModel, safeJsonParse } from "@/lib/deepseek";
import { buildQuestionPrompt } from "@/lib/prompts";
import { hasServiceKey, serviceErrorResponse } from "@/lib/service-errors";
import type { QuestionAnswer, QuestionInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!hasServiceKey(process.env.DEEPSEEK_API_KEY)) return NextResponse.json({ error: "梦境解析服务暂未就绪，请稍后再试。" }, { status: 503 });
  try {
    const guard = await guardApiRequest(request, {
      key: "ask",
      limit: 12,
      windowMs: 24 * 60 * 60 * 1000,
      requireUser: true,
      bypassForAdmin: true
    });

    if (!guard.ok) {
      return guard.response;
    }

    const body = await readJsonObject<QuestionInput>(request);
    body.question = trimText(body.question, 800);
    body.previousProfile = trimText(body.previousProfile, 1800);
    body.dreamContext = trimText(body.dreamContext, 2200);
    body.history = (Array.isArray(body.history) ? body.history : []).slice(0, 3).map((item) => ({
      question: trimText(item?.question, 800),
      answer: trimText(item?.answer, 1200)
    }));

    if (!body.question || body.question.trim().length < 2) {
      return NextResponse.json({ error: "请写下你真正想问的问题。" }, { status: 400 });
    }

    if (body.history.length >= 3) {
      return NextResponse.json({ error: "这一轮梦境最多可以问三个问题。" }, { status: 400 });
    }

    const completion = await createDeepSeekChatCompletion({
      model: getDeepSeekModel(),
      messages: [
        {
          role: "system",
          content: "你是一个中文梦境咨询产品中的内在自我问答引擎。你必须只返回合法 json。"
        },
        {
          role: "user",
          content: buildQuestionPrompt(body)
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.72,
      max_tokens: 1600,
      thinking: {
        type: "disabled"
      }
    }, {
      timeoutMs: 26000,
      maxRetries: 0
    });

    const answer = safeJsonParse<QuestionAnswer>(completion.choices[0]?.message?.content);
    if (!trimText(answer.answer, 8000)) throw new Error("Missing answer");

    return NextResponse.json(answer);
  } catch (error) {
    return serviceErrorResponse(error, "暂时无法回应这个问题，请稍后重试。");
  }
}
