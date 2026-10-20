import type { DreamAnalysis } from "./types";

type ExportableDream = {
  createdAt: string;
  analystName: string;
  dream: { dreamAt: string; dreamText: string; wakingLife: string; mood: string };
  analysis: DreamAnalysis;
  followupAnswers: Array<{ question: string; answer: string }>;
  qa: Array<{ question: string; answer: string; reflection: string }>;
};

export function dreamAsMarkdown(record: ExportableDream) {
  const { analysis, dream } = record;
  const section = (heading: string, text: string) => text ? `## ${heading}\n\n${text}` : "";
  return [
    `# ${analysis.title}`,
    `${record.createdAt.slice(0, 10)} · ${record.analystName}`,
    section("梦境", dream.dreamText),
    section("时间", dream.dreamAt),
    section("醒后余温", dream.mood),
    section("现实线索", dream.wakingLife),
    section("五个追问", record.followupAnswers.map((item, index) => `### ${index + 1}. ${item.question}\n\n${item.answer || "未回答"}`).join("\n\n")),
    section("梦境解析", analysis.opening),
    section("我听见了什么", analysis.heard),
    section("可能的核心冲突", analysis.coreConflict),
    section("被保护的需要", analysis.hiddenNeed),
    section("关系与行动模式", analysis.relationshipPattern),
    ...analysis.readings.map((reading) => section(`${reading.name} · ${reading.title}`, reading.reading)),
    section("过去与现在", analysis.lifeGuess),
    section("当前张力", analysis.presentTension),
    section("不过度解读", analysis.avoidOverInterpreting),
    section("母题", analysis.motifs.join("、")),
    section("梦后仪式", analysis.ritual),
    section("梦后信件", analysis.letter),
    section("内心三问", record.qa.map((item, index) => `### ${index + 1}. ${item.question}\n\n${item.answer}\n\n${item.reflection}`).join("\n\n")),
    section("内在画像", analysis.updatedProfile),
    analysis.disclaimer ? `---\n\n${analysis.disclaimer}` : ""
  ].filter(Boolean).join("\n\n") + "\n";
}
