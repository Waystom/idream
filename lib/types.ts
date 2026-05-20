export type AnalystKey = "freud" | "jung" | "adler";

export type DreamInput = {
  dreamAt: string;
  dreamText: string;
  wakingLife: string;
  mood: string;
  selectedAnalyst: AnalystKey;
  previousProfile?: string;
};

export type FollowupQuestions = {
  analystKey: AnalystKey;
  analystName: string;
  introduction: string;
  questions: string[];
};

export type FollowupAnswer = {
  question: string;
  answer: string;
};

export type NextFollowupInput = DreamInput & {
  previousAnswers: FollowupAnswer[];
  questionIndex: number;
};

export type NextFollowupQuestion = {
  analystKey: AnalystKey;
  analystName: string;
  question: string;
};

export type AnalysisInput = DreamInput & {
  followupAnswers: FollowupAnswer[];
};

export type AnalystReading = {
  key: AnalystKey;
  name: string;
  title: string;
  reading: string;
};

export type DreamAnalysis = {
  title: string;
  opening: string;
  readings: AnalystReading[];
  heard: string;
  coreConflict: string;
  hiddenNeed: string;
  relationshipPattern: string;
  avoidOverInterpreting: string;
  lifeGuess: string;
  presentTension: string;
  motifs: string[];
  ritual: string;
  letter: string;
  imagePrompt: string;
  updatedProfile: string;
  nextQuestions: string[];
  disclaimer: string;
};

export type QuestionInput = {
  question: string;
  previousProfile: string;
  dreamContext: string;
  history: Array<{
    question: string;
    answer: string;
  }>;
};

export type QuestionAnswer = {
  answer: string;
  updatedProfile: string;
  reflection: string;
};
