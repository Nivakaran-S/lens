import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/proxy';

const PROTECTED_PREFIXES = ['/dashboard', '/upload', '/jobs', '/billing', '/admin'];
const AUTH_ROUTES = ['/sign-in', '/sign-up'];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_ROUTES.includes(pathname);

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
