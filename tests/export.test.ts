import { test } from "node:test";
import assert from "node:assert/strict";
import { dreamAsMarkdown } from "../lib/dream-export";
import type { DreamAnalysis } from "../lib/types";

const analysis: DreamAnalysis = {
  title: "窗边的书", opening: "开场", heard: "听见的线索", coreConflict: "核心冲突",
  hiddenNeed: "隐藏需要", relationshipPattern: "关系模式", avoidOverInterpreting: "保留不确定性",
  lifeGuess: "现实猜测", presentTension: "当前张力", motifs: ["窗户", "书"], ritual: "今晚的仪式",
  letter: "一封完整的信", imagePrompt: "private image prompt", updatedProfile: "最新画像",
  nextQuestions: [], disclaimer: "仅供自我探索",
  readings: [{ key: "jung", name: "荣格", title: "象征", reading: "分析者的完整解读" }]
};

test("readable dream export preserves intake, followups, readings, letter and inner answers", () => {
  const text = dreamAsMarkdown({
    createdAt: "2026-10-20T10:00:00Z", analystName: "荣格",
    dream: { dreamAt: "昨夜", dreamText: "一扇亮着的窗", wakingLife: "正在尝试新事物", mood: "平静" },
    analysis, followupAnswers: [{ question: "窗外是什么？", answer: "安静的海" }],
    qa: [{ question: "我需要什么？", answer: "一点空间", reflection: "保留一点自由" }]
  });
  for (const content of ["2026-10-20", "荣格", "一扇亮着的窗", "正在尝试新事物", "窗外是什么？", "安静的海", "分析者的完整解读", "一封完整的信", "我需要什么？", "一点空间", "保留一点自由", "最新画像", "仅供自我探索"]) {
    assert.ok(text.includes(content), `Missing exported content: ${content}`);
  }
  assert.ok(text.indexOf("## 梦境\n") < text.indexOf("## 五个追问\n"));
  assert.ok(text.indexOf("## 五个追问\n") < text.indexOf("## 内心三问\n"));
  assert.doesNotMatch(text, /private image prompt|undefined/);
});

test("empty optional answers do not create empty export sections", () => {
  const text = dreamAsMarkdown({
    createdAt: "2026-10-20T10:00:00Z", analystName: "荣格",
    dream: { dreamAt: "", dreamText: "梦", wakingLife: "", mood: "" }, analysis,
    followupAnswers: [], qa: []
  });
  assert.doesNotMatch(text, /## 时间\n|## 醒后余温\n|## 现实线索\n|## 五个追问\n|## 内心三问\n/);
  assert.match(text, /# 窗边的书/);
});
