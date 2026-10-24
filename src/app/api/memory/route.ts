import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api';
import { memoryFacets } from '@/lib/memory';

// What the memory has learned so far, grouped by Atlas Search facets.
export async function GET() {
  const auth = await requireSession();
  if ('error' in auth) return auth.error;
  return NextResponse.json(await memoryFacets());
}
