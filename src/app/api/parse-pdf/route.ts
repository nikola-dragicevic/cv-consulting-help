// src/app/api/parse-pdf/route.ts
import { NextResponse } from 'next/server';
import { pdf } from 'pdf-parse';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Ingen fil uppladdad.' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const data = await pdf(fileBuffer);

    return NextResponse.json({ text: data.text });

  } catch (error) {
    console.error('PDF parsing error:', error);
    return NextResponse.json({ error: 'Kunde inte läsa PDF-filen.' }, { status: 500 });
  }
}