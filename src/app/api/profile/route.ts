import { type NextRequest, NextResponse } from "next/server"
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { randomUUID } from "crypto"

// Helper function to create a Supabase client for Route Handlers
const createSupabaseRouteHandlerClient = async () => {
  // cookies() in Next.js route handlers returns a RequestCookies instance (not a direct map);
  // ensure we await/use it correctly in case the runtime returns a promise-like object.
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use Service Role Key for admin-level actions
    {
      cookies: {
        // The createServerClient expects functions that operate synchronously on cookies.
        // We adapt the RequestCookies API to the shape expected by the Supabase SSR helper.
        get(name: string) {
          const c = cookieStore.get?.(name)
          return c ? c.value : undefined
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // RequestCookies.set accepts an object with name and value and optional attributes
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // Setting cookies can fail in some SSR contexts — swallow safely.
          }
        },
        remove(name: string, options?: CookieOptions) {
          try {
            // There's no explicit remove API on RequestCookies; set cookie with empty value and maxAge=0
            cookieStore.set({ name, value: '', maxAge: 0, ...options })
          } catch (error) {
            // Ignore
          }
        },
      },
    }
  )
}


// GET function to fetch the user's profile
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error && error.code !== 'PGRST116') { // Ignore "no rows found" error
        console.error("GET Profile Error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(profile);
}


// POST function to update the user's profile
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get("cv") as File | null
    let cv_url: string | null = null;

    if (file) {
      const cvFilename = `${user.id}/${randomUUID()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("cvs")
        .upload(cvFilename, file, { upsert: true });

      if (uploadError) throw new Error(`CV upload failed: ${uploadError.message}`);
      
      const { data: { publicUrl } } = supabase.storage.from('cvs').getPublicUrl(cvFilename);
      cv_url = publicUrl;
    }

    const profileData: any = {
      user_id: user.id,
      email: user.email,
      full_name: formData.get("fullName") as string,
      phone: formData.get("phone") as string,
      city: formData.get("city") as string,
      street: formData.get("street") as string,
    };
    
    if (cv_url) {
        profileData.cv_file_url = cv_url;
        profileData.vector = null; // Invalidate old vector
    }

    const { error: upsertError } = await supabase
      .from('candidate_profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    if (upsertError) throw new Error(`Profile update failed: ${upsertError.message}`);
    
    return NextResponse.json({ success: true, newCvUrl: cv_url });

  } catch (error: any) {
    console.error("Profile update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}