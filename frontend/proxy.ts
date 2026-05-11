import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/upload', '/jobs', '/billing', '/admin'];
const AUTH_ROUTES = ['/sign-in', '/sign-up', '/forgot-password'];

const SESSION_COOKIE = 'lens_sid';

/**
 * Lightweight middleware: only checks whether the session cookie exists.
 * Real session validity (expiry, user role, etc.) is enforced by the
 * backend on every API call. This means we never have to make a backend
 * hop from the middleware — keeps page loads fast.
 *
 * A signed-in user with an expired/deleted session will still see the
 * dashboard shell, but every API call will 401 and the frontend bounces
 * them to /sign-in.
 *
 * NOTE: the session cookie sits on the api subdomain (api.checkmylegals.co.uk).
 * The Next.js middleware runs on the apex (checkmylegals.co.uk) and can't
 * see it directly. We therefore use a "presence" cookie OR rely on the
 * backend to bounce 401s. For now: skip cookie check on cross-subdomain
 * setups and let the page-level useEffect calls do the authentication
 * bounce.
 *
 * If frontend + backend share the apex (or use a Domain=.checkmylegals.co.uk
 * cookie), this cookie check works; otherwise it just lets everything
 * through and the API redirects handle it.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPage = AUTH_ROUTES.includes(pathname);

  if (isProtected && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.searchParams.delete('next');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
