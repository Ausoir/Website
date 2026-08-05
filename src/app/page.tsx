import { PpLab } from "@/components/pp-lab";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <PpLab user={user ? { id: user.id } : null} />;
}
