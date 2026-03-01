"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/LanguageProvider';
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
      <div className="container mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
        <Link href="/" className="text-xl font-bold">
          Jobb Nu
        </Link>

        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              {t("Dashboard", "Dashboard")}
            </Link>
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
            <Link
              href="/cv"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              CV
            </Link>
            <Link
              href="/cv&pb"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              CV + PB
            </Link>
            <Link
              href="/cvpb&konsult"
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              CV + PB + Konsult
            </Link>
          </div>
        </div>

        <nav className="justify-self-end">
          {loading ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{t("Laddar...", "Loading...")}</span>
            </div>
          ) : user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
              <Link href="/profile">
                <Button variant="outline" size="sm">{t("Min Profil", "My Profile")}</Button>
              </Link>
              <Button onClick={handleLogout} variant="destructive" size="sm">{t("Logga ut", "Log out")}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
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
    </header>
  );
}
