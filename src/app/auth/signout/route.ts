import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = createClient();
  await supabase.auth.signOut();

  // Redirecionamento relativo: o navegador preserva o domínio público,
  // sem usar o host interno do proxy (ex.: 0.0.0.0:3000).
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: '/login',
      'Cache-Control': 'no-store',
    },
  });
}
