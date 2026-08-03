/**
 * Placeholder for future ad/subscription monetization.
 * Swap the contents for an ad network snippet, or hide entirely
 * behind a `hasActiveSubscription` check once subscriptions exist.
 */
export function AdSlot({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-24 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-400 dark:border-zinc-700 dark:text-zinc-600 ${className}`}
    >
      Ad slot
    </div>
  );
}
