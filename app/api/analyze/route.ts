import { NextResponse } from "next/server";
import { guardApiRequest, trimText } from "@/lib/api-guard";
import { createDeepSeekChatCompletion, getDeepSeekModel, safeJsonParse } from "@/lib/deepseek";
import { buildAnalysisPrompt } from "@/lib/prompts";
import type { DeepSeekChatCompletionParams } from "@/lib/deepseek";
import type { AnalysisInput, DreamAnalysis } from "@/lib/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const maxDuration = 60;

const analysisModel = process.env.DEEPSEEK_ANALYSIS_MODEL || getDeepSeekModel();
const fallbackAnalysisModel = process.env.DEEPSEEK_ANALYSIS_FALLBACK_MODEL || getDeepSeekModel();
const analysisTimeoutMs = Number(process.env.DEEPSEEK_ANALYSIS_TIMEOUT_MS || 22000);
const fallbackTimeoutMs = Number(process.env.DEEPSEEK_ANALYSIS_FALLBACK_TIMEOUT_MS || 24000);

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
    const guard = await guardApiRequest(request, {
      key: "analyze",
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000,
      requireUser: true,
      bypassForAdmin: true
    });

    if (!guard.ok) {
      return guard.response;
    }

    const body = (await request.json()) as AnalysisInput;
    body.dreamText = trimText(body.dreamText, 2800);
    body.wakingLife = trimText(body.wakingLife, 800);
    body.mood = trimText(body.mood, 400);
    body.previousProfile = trimText(body.previousProfile, 1200);
    body.followupAnswers = (body.followupAnswers || []).slice(0, 5).map((item) => ({
      question: trimText(item.question, 160),
      answer: trimText(item.answer, 800)
    }));

    const validationError = validateDreamInput(body);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "你是一个中文梦境咨询产品中的结构化分析引擎。你必须只返回合法 json。"
      },
      {
        role: "user",
        content: buildAnalysisPrompt(body)
      }
    ];

    const requestBody: Omit<DeepSeekChatCompletionParams, "model"> = {
      messages: [
        ...messages
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2600,
      thinking: {
        type: "disabled"
      }
    };

    async function requestAnalysis(model: string, timeoutMs: number) {
      const startedAt = Date.now();
      const completion = await createDeepSeekChatCompletion(
        {
          model,
          ...requestBody
        },
        {
          timeoutMs,
          maxRetries: 0
        }
      );
      console.info(`[analyze] model=${model} durationMs=${Date.now() - startedAt}`);

      return safeJsonParse<DreamAnalysis>(completion.choices[0]?.message?.content);
    }

    let analysis: DreamAnalysis;

    try {
      analysis = await requestAnalysis(analysisModel, analysisTimeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[analyze] model=${analysisModel} failed: ${message}`);

      if (fallbackAnalysisModel === analysisModel) {
        throw error;
      }

      analysis = await requestAnalysis(fallbackAnalysisModel, fallbackTimeoutMs);
    }

    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败，请稍后再试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
