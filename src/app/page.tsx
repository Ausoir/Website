import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { QuizSummary } from "@/lib/quiz/types";
import { AdSlot } from "@/components/ad-slot";

export default async function Home() {
  const supabase = await createClient();
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, slug, title, description")
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .returns<QuizSummary[]>();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="w-full max-w-3xl flex-1 px-6 py-16 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Discover your type
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Quick, free personality quizzes. Pick one to get started.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {quizzes?.map((quiz) => (
            <Link
              key={quiz.id}
              href={`/quiz/${quiz.slug}`}
              className="rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <h2 className="font-semibold text-zinc-950 dark:text-zinc-50">
                {quiz.title}
              </h2>
              {quiz.description && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {quiz.description}
                </p>
              )}
            </Link>
          ))}

          {!quizzes?.length && (
            <p className="text-sm text-zinc-500">
              No quizzes yet. Run the migration + seed in{" "}
              <code>supabase/</code> to add the sample quiz.
            </p>
          )}
        </div>

        <AdSlot className="mt-10" />
      </main>
    </div>
  );
}
