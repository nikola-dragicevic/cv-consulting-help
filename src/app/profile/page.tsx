// app/profile/page.tsx
"use client";

import { useState, useEffect, useMemo, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabaseBrowser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Eye } from "lucide-react";

interface Profile {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  street: string;
  cv_file_url: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvViewLoading, setCvViewLoading] = useState(false);
  const [cvViewError, setCvViewError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // load from server via cookie-authenticated route
        const res = await fetch("/api/profile", { method: "GET" });

        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) throw new Error("Kunde inte hämta profil.");

        const data = await res.json();

        if (!data) {
          // no profile row yet; still need email for display
          const { data: { user } } = await supabase.auth.getUser();
          setProfile({
            full_name: "",
            email: user?.email || "",
            phone: "",
            city: "",
            street: "",
            cv_file_url: null,
          });
        } else {
          setProfile(data);
        }
      } catch (e) {
        console.error("Error fetching profile:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router, supabase]);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    setMessage("");

    const form = new FormData();
    form.append("fullName", profile.full_name);
    form.append("phone", profile.phone);
    form.append("city", profile.city);
    form.append("street", profile.street);
    if (cvFile) form.append("cv", cvFile);

    try {
      const res = await fetch("/api/profile", { method: "POST", body: form });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Något gick fel.");
      setMessage("Din profil har uppdaterats!");

      if (result.newCvUrl) {
        setProfile(prev => (prev ? { ...prev, cv_file_url: result.newCvUrl } : prev));
      }
    } catch (err: any) {
      setMessage(`Fel: ${err.message}`);
    } finally {
      setLoading(false);
      setCvFile(null);
      const fileInput = document.getElementById("cv-upload") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (profile) setProfile({ ...profile, [name]: value });
  };

  const handleViewCv = async () => {
    setCvViewLoading(true);
    setCvViewError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setCvViewError('Ingen session token');
        setCvViewLoading(false);
        return;
      }

      // Call the server API
      const response = await fetch('/api/cv/signed-url', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        setCvViewError(errData.error || 'Kunde inte hämta CV');
        setCvViewLoading(false);
        return;
      }

      const { url } = await response.json();
      // Open CV in a new tab
      window.open(url, '_blank');
      setCvViewLoading(false);
    } catch (err: any) {
      setCvViewError(err.message || 'Fel vid hämtning av CV');
      setCvViewLoading(false);
    }
  };

  if (loading) return <div className="p-8">Laddar din profil...</div>;
  if (!profile) return <div className="p-8">Kunde inte ladda din profil. Vänligen logga in igen.</div>;

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <User /> Min Profil
          </CardTitle>
          <CardDescription>Håll din information uppdaterad för bästa matchningar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fullName">Fullständigt namn</Label>
              <Input id="fullName" name="full_name" value={profile.full_name} onChange={handleInputChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-post</Label>
              <Input id="email" name="email" value={profile.email} disabled />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" name="phone" value={profile.phone} onChange={handleInputChange} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Stad</Label>
                <Input id="city" name="city" value={profile.city} onChange={handleInputChange} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Gatuadress</Label>
              <Input id="street" name="street" value={profile.street} onChange={handleInputChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cv-upload">Ladda upp nytt CV (PDF eller .txt)</Label>
              <div className="flex items-center gap-3">
                <Input id="cv-upload" type="file" accept=".pdf,.txt" onChange={(e) => setCvFile(e.target.files?.[0] || null)} />
                {profile.cv_file_url && (
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={handleViewCv}
                    disabled={cvViewLoading}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {cvViewLoading ? 'Laddar...' : 'Visa nuvarande'}
                  </Button>
                )}
              </div>
              {cvViewError && <p className="text-xs text-red-600">{cvViewError}</p>}
              <p className="text-xs text-slate-500">
                Om du laddar upp en ny fil kommer den att ersätta din gamla. Detta triggar en ny matchningsanalys.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sparar..." : "Spara ändringar"}
            </Button>
            {message && <p className="text-sm text-center text-green-600 mt-4">{message}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
