import type { PublicQuizState } from "@/lib/publicState";

export default function QuizResult({ quiz, large = false }: { quiz: PublicQuizState; large?: boolean }) {
  if (quiz.isCorrect === null) return null;
  return (
    <div className={`space-y-3 rounded-xl border p-4 ${quiz.isCorrect ? "border-emerald-500/60 bg-emerald-950/40" : "border-red-500/60 bg-red-950/40"}`}>
      <p className={large ? "text-[4vh] font-black" : "text-xl font-black"}>{quiz.isCorrect ? "정답입니다" : "오답입니다"}</p>
      <p className={large ? "text-[2.5vh]" : "text-base"}>학급 답변 <strong>{quiz.classAnswer ? "O" : "X"}</strong><span className="mx-2 opacity-50">·</span>정답 <strong>{quiz.correctAnswer ? "O" : "X"}</strong></p>
      {quiz.explanation && <p className={large ? "text-[2.2vh] leading-relaxed" : "text-sm leading-relaxed text-slate-200"}>{quiz.explanation}</p>}
      {quiz.sources && <p className={large ? "text-[1.7vh] opacity-70" : "text-xs text-slate-400"}>출처: {quiz.sources.map((source, index) => <span key={source.url}>{index > 0 && " · "}<a href={source.url} target="_blank" rel="noreferrer" className="underline hover:opacity-100">{source.title}</a></span>)}</p>}
    </div>
  );
}
