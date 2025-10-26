"use client"

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/button';
import type { User } from '@supabase/supabase-js';

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

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
      <div className="container mx-auto flex items-center justify-between p-4">
        <Link href="/" className="text-xl font-bold">
          CV-Hjälp
        </Link>
        <nav>
          {loading ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">Laddar...</span>
            </div>
          ) : user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
              <Link href="/profile">
                <Button variant="outline" size="sm">Min Profil</Button>
              </Link>
              <Button onClick={handleLogout} variant="destructive" size="sm">Logga ut</Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" size="sm">Logga in</Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Registrera</Button>
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}