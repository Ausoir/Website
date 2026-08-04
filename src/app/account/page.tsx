import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AttemptRow = {
  id: string;
  created_at: string;
  quizzes: { slug: string; title: string } | null;
  result_profiles: { code: string; name: string } | null;
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: attempts } = await supabase
    .from("attempts")
    .select(
      "id, created_at, quizzes ( slug, title ), result_profiles ( code, name )"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<AttemptRow[]>();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Your history
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{user.email}</p>

        <div className="mt-8 flex flex-col gap-3">
          {attempts?.map((attempt) => (
            <div
              key={attempt.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {attempt.quizzes?.title ?? "Quiz"}
                </span>
                <span className="text-xs text-zinc-500">
                  {new Date(attempt.created_at).toLocaleDateString()}
                </span>
              </div>
              {attempt.result_profiles && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Result: {attempt.result_profiles.name} (
                  {attempt.result_profiles.code})
                </p>
              )}
            </div>
          ))}

          {!attempts?.length && (
            <p className="text-sm text-zinc-500">No history yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
