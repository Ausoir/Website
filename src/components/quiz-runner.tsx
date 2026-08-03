"use client";

import { useMemo, useState } from "react";
import { addOptionScores, computeResultCode, type RawScores } from "@/lib/quiz/scoring";
import type { QuizWithQuestions } from "@/lib/quiz/types";
import { createClient } from "@/lib/supabase/client";
import { AdSlot } from "@/components/ad-slot";

export function QuizRunner({ quiz }: { quiz: QuizWithQuestions }) {
  const [step, setStep] = useState(0);
  const [totals, setTotals] = useState<RawScores>({});
  const [saveError, setSaveError] = useState(false);

  const questions = quiz.questions;
  const isComplete = step >= questions.length;

  const resultCode = useMemo(
    () => (isComplete ? computeResultCode(quiz.quiz_dimensions, totals) : null),
    [isComplete, quiz.quiz_dimensions, totals]
  );
  const resultProfile = useMemo(
    () => quiz.result_profiles.find((p) => p.code === resultCode) ?? null,
    [quiz.result_profiles, resultCode]
  );

  async function selectOption(optionScores: RawScores) {
    const nextTotals = addOptionScores(totals, optionScores);
    setTotals(nextTotals);

    const nextStep = step + 1;
    setStep(nextStep);

    if (nextStep >= questions.length) {
      const code = computeResultCode(quiz.quiz_dimensions, nextTotals);
      const profile = quiz.result_profiles.find((p) => p.code === code);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await supabase.from("attempts").insert({
          quiz_id: quiz.id,
          user_id: user?.id ?? null,
          result_profile_id: profile?.id ?? null,
          raw_scores: nextTotals,
        });
      } catch {
        setSaveError(true);
      }
    }
  }

  if (isComplete) {
    return (
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Your result
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {resultProfile ? resultProfile.name : resultCode}
        </h1>
        {resultProfile?.code && (
          <p className="mt-1 text-zinc-500">{resultProfile.code}</p>
        )}
        {resultProfile?.description && (
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            {resultProfile.description}
          </p>
        )}
        {saveError && (
          <p className="mt-4 text-xs text-zinc-400">
            (Result wasn&apos;t saved, but here it is anyway.)
          </p>
        )}
        <AdSlot className="mt-8" />
      </div>
    );
  }

  const question = questions[step];

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Question {step + 1} of {questions.length}
      </p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-1.5 rounded-full bg-zinc-900 transition-all dark:bg-zinc-100"
          style={{ width: `${(step / questions.length) * 100}%` }}
        />
      </div>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {question.prompt}
      </h1>

      <div className="mt-6 flex flex-col gap-3">
        {question.question_options.map((option) => (
          <button
            key={option.id}
            onClick={() => selectOption(option.scores)}
            className="rounded-xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
