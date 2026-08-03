import type { Dimension, RawScores } from "./scoring";

export type QuizOption = {
  id: string;
  label: string;
  sort_order: number;
  scores: RawScores;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  sort_order: number;
  question_options: QuizOption[];
};

export type QuizSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
};

export type ResultProfile = {
  id: string;
  code: string;
  name: string;
  description: string | null;
};

export type QuizWithQuestions = QuizSummary & {
  quiz_dimensions: Dimension[];
  questions: QuizQuestion[];
  result_profiles: ResultProfile[];
};
