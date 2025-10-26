// src/lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function getServerSupabase() {
  const cookieStore = await cookies(); // <- await here

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // optional chaining for older Next types
          // @ts-ignore
          cookieStore.delete?.({ name, ...options });
          cookieStore.set({ name, value: "", maxAge: 0, ...options });
        },
      },
    }
  );
}
