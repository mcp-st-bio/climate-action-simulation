import quizData from "@/data/quiz.json";

export interface QuizSource {
  title: string;
  url: string;
}

export interface QuizItem {
  turn: number;
  question: string;
  answer: boolean;
  explanation: string;
  sources: QuizSource[];
}

const QUIZZES = quizData as QuizItem[];

export function getQuizForTurn(turn: number): QuizItem | undefined {
  return QUIZZES.find((quiz) => quiz.turn === turn);
}

