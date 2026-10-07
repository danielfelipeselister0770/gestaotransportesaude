import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>, _headers: Headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      } as any,
    }
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const pathname = request.nextUrl.pathname;

  const publicAuthPath =
    pathname === '/login' ||
    pathname === '/auth/callback' ||
    pathname === '/motorista/primeiro-acesso' ||
    pathname === '/api/motoristas/acesso';

  if (!claims && !publicAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (!claims || publicAuthPath) {
    return response;
  }

  const userId = claims.sub as string | undefined;
  const { data: profile } = userId
    ? await supabase.from('profiles').select('role,active,must_change_password').eq('id', userId).maybeSingle()
    : { data: null };

  const role = profile?.role as 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'MOTORISTA' | undefined;
  const isPasswordChange = pathname === '/auth/trocar-senha';

  if (profile?.active === false) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('blocked', '1');
    return NextResponse.redirect(url);
  }

  if (profile?.must_change_password && !isPasswordChange) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/trocar-senha';
    return NextResponse.redirect(url);
  }
  const isDriverArea = pathname === '/motorista' || pathname.startsWith('/motorista/');
  const isDriverApi = pathname.startsWith('/api/motorista/');

  if (role === 'MOTORISTA') {
    if (isDriverArea || isDriverApi) {
      return response;
    }

    const url = request.nextUrl.clone();
    url.pathname = '/motorista';
    return NextResponse.redirect(url);
  }

  if (pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return response;
}
