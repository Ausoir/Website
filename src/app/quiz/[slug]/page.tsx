import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { QuizWithQuestions } from "@/lib/quiz/types";
import { QuizRunner } from "@/components/quiz-runner";

export default async function QuizPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select(
      `
      id, slug, title, description,
      quiz_dimensions ( key, low_label, high_label, sort_order ),
      questions (
        id, prompt, sort_order,
        question_options ( id, label, sort_order, scores )
      ),
      result_profiles ( id, code, name, description )
    `
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .single<QuizWithQuestions>();

  if (!quiz) notFound();

  quiz.questions.sort((a, b) => a.sort_order - b.sort_order);
  quiz.questions.forEach((q) =>
    q.question_options.sort((a, b) => a.sort_order - b.sort_order)
  );

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="w-full max-w-xl flex-1 px-6 py-16 sm:px-10">
        <QuizRunner quiz={quiz} />
      </main>
    </div>
  );
}
