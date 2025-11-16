import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const svcClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const anonClient = createClient(SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: profile, error: profileErr } = await svcClient
      .from('candidate_profiles')
      .select('cv_bucket_path, cv_file_url')
      .eq('user_id', userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'CV not found' }, { status: 404 });
    }

    let bucketPath = profile.cv_bucket_path;
    
    // Remove 'cvs/' prefix if it exists (createSignedUrl expects path without bucket name)
    if (bucketPath && bucketPath.startsWith('cvs/')) {
      bucketPath = bucketPath.substring(4); // Remove 'cvs/' (4 chars)
    }

    if (!bucketPath) {
      return NextResponse.json({ error: 'CV path not found' }, { status: 404 });
    }

    console.log('DEBUG: Creating signed URL for:', bucketPath);

    const { data: signed, error: signErr } = await svcClient
      .storage
      .from('cvs')
      .createSignedUrl(bucketPath, 60);

    if (signErr || !signed) {
      console.error('Signed URL error:', signErr);
      return NextResponse.json({ error: 'Could not generate URL', details: signErr?.message }, { status: 500 });
    }

    console.log('DEBUG: Signed URL created successfully');
    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error('Error in /api/cv/signed-url:', err);
    return NextResponse.json({ error: 'Server error', details: String(err) }, { status: 500 });
  }
}