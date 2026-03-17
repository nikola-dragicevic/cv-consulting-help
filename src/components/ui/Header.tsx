"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { isAdminOrModerator } from '@/lib/admin';
import type { User } from '@supabase/supabase-js';

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();

  useEffect(() => {
    const supabase = getBrowserSupabase();

    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error getting session:", error);
        }
        setUser(session?.user ?? null);
        console.log("Header: Current user:", session?.user?.email || "Not logged in");
      } catch (err) {
        console.error("Error in getSession:", err);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Header: Auth state changed:", _event, session?.user?.email || "No user");
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    console.log("User logged out");
    router.push('/');
    router.refresh();
  };

  return (
    <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b">
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:min-w-0">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <Image
                src="/jobbnu_app_icon_centered_128.png"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8"
                priority
              />
              <Image
                src="/JobbNuColor.png"
                alt="JobbNu"
                width={596}
                height={168}
                className="h-7 w-auto"
                priority
              />
            </Link>

            <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:min-w-0">
              <Link
                href="/dashboard"
                className="rounded-full border border-amber-400 bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 hover:border-amber-500"
              >
                {t("Jobbmatchning", "Job Matching")}
              </Link>
              <Link
                href="/cv"
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                CV
              </Link>
              <Link
                href="/pb"
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                {t("PB", "PB")}
              </Link>
            </div>
          </div>

          <div className="flex justify-center lg:justify-center">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setLang("sv")}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  lang === "sv" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                aria-label="Svenska"
              >
                SV
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                  lang === "en" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                aria-label="English"
              >
                EN
              </button>
            </div>
          </div>

          <nav className="min-w-0">
            {loading ? (
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm text-gray-400">{t("Laddar...", "Loading...")}</span>
              </div>
            ) : user ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="hidden text-sm text-gray-600 sm:block">{user.email}</span>
                {isAdminOrModerator(user) && (
                  <Link href="/admin">
                    <Button variant="outline" size="sm">Admin</Button>
                  </Link>
                )}
                <Link href="/profile">
                  <Button variant="outline" size="sm">{t("Min Profil", "My Profile")}</Button>
                </Link>
                <Button onClick={handleLogout} variant="destructive" size="sm">{t("Logga ut", "Log out")}</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">{t("Logga in", "Log in")}</Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">{t("Registrera", "Sign up")}</Button>
                </Link>
              </div>
            )}
          </nav>
          </div>
      </div>
    </header>
  );
}
