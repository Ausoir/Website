import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <Link href="/" className="font-semibold text-zinc-950 dark:text-zinc-50">
        PP Lab
      </Link>

      {user ? (
        <div className="flex items-center gap-4 text-sm">
          <Link href="/account" className="text-zinc-600 dark:text-zinc-400">
            {user.email}
          </Link>
          <form action={signOut}>
            <button className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/login"
          className="text-sm font-medium text-zinc-950 dark:text-zinc-50"
        >
          Sign in
        </Link>
      )}
    </header>
  );
}
