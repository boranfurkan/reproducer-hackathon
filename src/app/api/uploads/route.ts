import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { ALLOWED_MEDIA, MAX_MEDIA_BYTES, uploadMedia } from '@/lib/media';

// A screen recording or screenshot for a ticket: stored in the Gemini Files API, the browser gets a reference back.
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a file' }, { status: 400 });
  if (!(file.type in ALLOWED_MEDIA)) return NextResponse.json({ error: 'Use an mp4, webm or mov recording, or a png, jpg or webp screenshot' }, { status: 415 });
  if (file.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'The file is larger than 50 MB' }, { status: 413 });
  try {
    return NextResponse.json({ media: await uploadMedia(file, file.type, file.name) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
