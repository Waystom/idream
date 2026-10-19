import { NextResponse } from "next/server";
import { guardApiRequest, isAnalystKey, readJsonObject, trimText } from "@/lib/api-guard";
import { hasServiceKey, serviceErrorResponse } from "@/lib/service-errors";
import { createDeepSeekChatCompletion, getDeepSeekModel, safeJsonParse } from "@/lib/deepseek";
import { analystNames, analystTitles, buildAnalysisPrompt } from "@/lib/prompts";
import type { DeepSeekChatCompletionParams } from "@/lib/deepseek";
import type { AnalysisInput, DreamAnalysis } from "@/lib/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const maxDuration = 60;

const analysisModel = process.env.DEEPSEEK_ANALYSIS_MODEL || getDeepSeekModel();
const fallbackAnalysisModel = process.env.DEEPSEEK_ANALYSIS_FALLBACK_MODEL || getDeepSeekModel();
const analysisTimeoutMs = Number(process.env.DEEPSEEK_ANALYSIS_TIMEOUT_MS || 22000);
const fallbackTimeoutMs = Number(process.env.DEEPSEEK_ANALYSIS_FALLBACK_TIMEOUT_MS || 24000);

function buildCompactAnalysisPrompt(input: AnalysisInput) {
  const selectedName = analystNames[input.selectedAnalyst];
  const selectedTitle = analystTitles[input.selectedAnalyst];
  const followups = input.followupAnswers
    .map((item, index) => `第${index + 1}问：${item.question}\n回答：${item.answer || "用户未填写"}`)
    .join("\n\n");

  return `
请以“${selectedName}：${selectedTitle}”的视角，给这个梦做一次简短、克制、口语化的中文解析。只返回合法 JSON，不要 Markdown。

JSON 必须包含这些字段：
{
  "title": "不超过18个中文字符",
  "opening": "70-100字",
  "readings": [{"key": "${input.selectedAnalyst}", "name": "${selectedName}", "title": "${selectedTitle}", "reading": "120-180字"}],
  "heard": "60-90字",
  "coreConflict": "50-90字",
  "hiddenNeed": "50-90字",
  "relationshipPattern": "50-90字",
  "avoidOverInterpreting": "一句提醒",
  "lifeGuess": "100-160字",
  "presentTension": "70-110字",
  "motifs": ["母题1", "母题2", "母题3"],
  "ritual": "40-80字",
  "letter": "120-180字",
  "imagePrompt": "60-100字",
  "updatedProfile": "160-240字",
  "nextQuestions": ["问题1", "问题2", "问题3"],
  "disclaimer": "内容用于自我探索，不替代心理治疗或医学诊断。"
}

梦境：
${input.dreamText}

现实处境：
${input.wakingLife || "用户未填写"}

醒后感受：
${input.mood || "用户未填写"}

五个追问：
${followups}
`.trim();
}

function normalizeAnalysis(input: AnalysisInput, analysis: Partial<DreamAnalysis>): DreamAnalysis {
  const selectedName = analystNames[input.selectedAnalyst];
  const selectedTitle = analystTitles[input.selectedAnalyst];
  const title = analysis.title || "这个梦在提醒你";
  const opening = analysis.opening || analysis.heard || "这个梦像是在把一些尚未说清的感受放到你面前。它不一定是在给出结论，更像是在邀请你慢一点看见自己最近的张力。";
  const fallbackText = analysis.presentTension || analysis.lifeGuess || opening;

  return {
    title,
    opening,
    readings: analysis.readings?.length
      ? analysis.readings
      : [
          {
            key: input.selectedAnalyst,
            name: selectedName,
            title: selectedTitle,
            reading: fallbackText
          }
        ],
    heard: analysis.heard || opening,
    coreConflict: analysis.coreConflict || fallbackText,
    hiddenNeed: analysis.hiddenNeed || fallbackText,
    relationshipPattern: analysis.relationshipPattern || fallbackText,
    avoidOverInterpreting: analysis.avoidOverInterpreting || "这只是一种理解角度，不需要把梦里的每个细节都固定成结论。",
    lifeGuess: analysis.lifeGuess || fallbackText,
    presentTension: analysis.presentTension || fallbackText,
    motifs: analysis.motifs?.length ? analysis.motifs : ["不确定感", "靠近与回避", "需要被看见"],
    ritual: analysis.ritual || "今天找一个安静的时刻，把梦里最有重量的画面写成一句话，然后先停在那里，不急着解释。",
    letter: analysis.letter || opening,
    imagePrompt: analysis.imagePrompt || `一张安静、克制的梦境意象照片，主题是${title}，低饱和、自然光、私密咨询室氛围。`,
    updatedProfile: analysis.updatedProfile || fallbackText,
    nextQuestions: analysis.nextQuestions?.length ? analysis.nextQuestions.slice(0, 3) : ["我最近最想回避的是什么？", "这个梦里最需要被理解的是谁？", "我可以把哪一步放轻一点？"],
    disclaimer: analysis.disclaimer || "内容用于自我探索，不替代心理治疗或医学诊断。"
  };
}

function validateDreamInput(body: Partial<AnalysisInput>) {
  if (!body.dreamText || body.dreamText.trim().length < 12) {
    return "请至少写下十几个字的梦境内容。";
  }

  if (!isAnalystKey(body.selectedAnalyst)) {
    return "请先选择一位心理学家。";
  }

  if (!body.followupAnswers || body.followupAnswers.length < 5) {
    return "请先回答完 5 个追问。";
  }

  return null;
}

export async function POST(request: Request) {
  if (!hasServiceKey(process.env.DEEPSEEK_API_KEY)) return NextResponse.json({ error: "梦境解析服务暂未就绪，请稍后再试。" }, { status: 503 });
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

    const body = await readJsonObject<AnalysisInput>(request);
    body.dreamText = trimText(body.dreamText, 2800);
    body.wakingLife = trimText(body.wakingLife, 800);
    body.mood = trimText(body.mood, 400);
    body.previousProfile = trimText(body.previousProfile, 1200);
    body.followupAnswers = (Array.isArray(body.followupAnswers) ? body.followupAnswers : []).slice(0, 5).map((item) => ({
      question: trimText(item?.question, 160),
      answer: trimText(item?.answer, 800)
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

    async function requestAnalysis(model: string, timeoutMs: number, nextMessages: ChatCompletionMessageParam[], maxTokens: number) {
      const startedAt = Date.now();
      const requestBody: Omit<DeepSeekChatCompletionParams, "model"> = {
        messages: nextMessages,
        response_format: { type: "json_object" },
        temperature: 0.62,
        max_tokens: maxTokens,
        thinking: {
          type: "disabled"
        }
      };
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

      return normalizeAnalysis(body, safeJsonParse<Partial<DreamAnalysis>>(completion.choices[0]?.message?.content));
    }

    let analysis: DreamAnalysis;

    try {
      analysis = await requestAnalysis(analysisModel, analysisTimeoutMs, messages, 2200);
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
      if (status === 401 || status === 403 || status === 404) throw error;
      console.warn("[analyze] retrying with compact prompt", { status });

      analysis = await requestAnalysis(
        fallbackAnalysisModel,
        fallbackTimeoutMs,
        [
          {
            role: "system",
            content: "你是一个中文梦境咨询产品中的结构化分析引擎。你必须只返回合法 json。"
          },
          {
            role: "user",
            content: buildCompactAnalysisPrompt(body)
          }
        ],
        1400
      );
    }

    return NextResponse.json(analysis);
  } catch (error) {
    return serviceErrorResponse(error, "暂时无法完成解析，请稍后重试。你的梦境内容会保留。");
  }
}
