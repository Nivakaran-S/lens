import { AppHeader } from '../../components/AppHeader';

// Real session validation happens server-side on every API call. The
// middleware (frontend/proxy.ts) already redirects to /sign-in if there's
// no session cookie, so by the time we render this layout we can assume
// the user is signed in. The header fetches profile data client-side via
// /api/me; if the session is in fact invalid, that call 401s and the
// frontend bounces back to /sign-in.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
