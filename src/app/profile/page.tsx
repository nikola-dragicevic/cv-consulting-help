"use client"

import { useState, useEffect, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Upload, User } from "lucide-react"

// Types for profile data
interface Profile {
  full_name: string
  email: string
  phone: string
  city: string
  street: string
  cv_file_url: string | null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [cvFile, setCvFile] = useState<File | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/profile');
        
        if (response.status === 401) {
          router.push('/login');
          return;
        }

        if (!response.ok) {
          throw new Error('Kunde inte hämta profil.');
        }

        const data = await response.json();

        // If no profile exists yet for a logged-in user, we still need their email
        if (!data) {
          const { data: { user } } = await supabase.auth.getUser();
          setProfile({
              full_name: '',
              email: user?.email || '',
              phone: '',
              city: '',
              street: '',
              cv_file_url: null
          });
        } else {
          setProfile(data);
        }
      } catch (error: any) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router])

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setLoading(true)
    setMessage("")

    const formData = new FormData()
    formData.append("fullName", profile.full_name)
    formData.append("phone", profile.phone)
    formData.append("city", profile.city)
    formData.append("street", profile.street)
    if (cvFile) {
      formData.append("cv", cvFile)
    }

    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Något gick fel.")
      }
      
      setMessage("Din profil har uppdaterats!")
      if (result.newCvUrl) {
        setProfile(prev => prev ? {...prev, cv_file_url: result.newCvUrl} : null)
      }

    } catch (err: any) {
      setMessage(`Fel: ${err.message}`)
    } finally {
      setLoading(false)
      setCvFile(null); // Clear file input state
      const fileInput = document.getElementById('cv-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    }
  }
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (profile) {
      setProfile({ ...profile, [name]: value })
    }
  }

  if (loading) {
    return <div className="p-8">Laddar din profil...</div>
  }

  if (!profile) {
    return <div className="p-8">Kunde inte ladda din profil. Vänligen logga in igen.</div>
  }

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
                 {profile.cv_file_url && <Button type="button" variant="link" asChild><a href={profile.cv_file_url} target="_blank" rel="noopener noreferrer">Visa nuvarande</a></Button>}
              </div>
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
  )
}