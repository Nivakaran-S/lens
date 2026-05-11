import { eq } from 'drizzle-orm';
import { deleteCookie } from 'hono/cookie';
import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../auth.js';
import { db } from '../db/client.js';
import { anonymiseUser, getUser } from '../db/users.js';
import { listPaymentsForUser } from '../db/payments.js';
import { jobs, documents } from '../db/schema.js';
import { deleteAllSessionsForUser, SESSION_COOKIE_NAME } from '../auth/sessions.js';
import { deleteUserFiles } from '../storage/fs.js';
import { env } from '../env.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';

export const meRoute = new Hono<AuthEnv>();

meRoute.use('*', requireAuth);

/**
 * GET /api/me — returns the caller's profile, including the live credits
 * balance. Frontend uses this to populate the AppHeader pill and on the
 * /billing/success page to poll until the webhook lands.
 */
meRoute.get('/', async (c) => {
  const auth = c.get('user');
  const fresh = await getUser(auth.id);
  return c.json({
    id: auth.id,
    email: auth.email,
    role: fresh?.role ?? auth.role,
    credits: fresh?.credits ?? auth.credits,
  });
});

/**
 * GET /api/me/export — GDPR data portability (Art 20). Returns every piece
 * of personal data we hold about the calling user, as JSON. Excludes
 * password_hash (a secret derivative, not personal data the user supplied).
 */
meRoute.get('/export', async (c) => {
  const auth = c.get('user');
  const user = await getUser(auth.id);
  if (!user) {
    return c.json({ error: 'user not found' }, 404);
  }

  // Pull all owned data in parallel.
  const [userJobs, userDocs, userPayments] = await Promise.all([
    db().select().from(jobs).where(eq(jobs.user_id, auth.id)),
    db()
      .select({
        id: documents.id,
        job_id: documents.job_id,
        filename: documents.filename,
        size_bytes: documents.size_bytes,
        doc_type: documents.doc_type,
        extraction: documents.extraction,
        created_at: documents.created_at,
      })
      .from(documents)
      .innerJoin(jobs, eq(jobs.id, documents.job_id))
      .where(eq(jobs.user_id, auth.id)),
    listPaymentsForUser(auth.id, 10_000),
  ]);

  // Strip password_hash defensively — getUser already returns it but we
  // shouldn't ship it in an export.
  const { password_hash: _omit, ...userPublic } = user;

  c.header(
    'Content-Disposition',
    `attachment; filename="lens-data-${auth.id.slice(0, 8)}.json"`,
  );
  return c.json({
    exported_at: new Date().toISOString(),
    user: userPublic,
    jobs: userJobs,
    documents: userDocs,
    payments: userPayments,
    note: 'Uploaded ZIP and PDF file contents are not included — they are deleted automatically after the retention period or when the account is deleted.',
  });
});

/**
 * DELETE /api/me — GDPR right of erasure (Art 17).
 *
 * What we delete:
 *  - All sessions for this user
 *  - All jobs (CASCADE removes documents from DB)
 *  - All files on disk under {UPLOAD_DIR}/{userId}/
 *
 * What we ANONYMISE (rather than delete):
 *  - The users row itself: email → tombstone, password_hash → null,
 *    credits → 0, stripe_customer_id → null. This preserves payment audit
 *    rows (which we have a legitimate-interest basis to retain for
 *    accounting / anti-fraud) while removing all personal data.
 *
 * The original email becomes free to register again. The deleted account
 * can never be signed into.
 */
meRoute.delete('/', async (c) => {
  const log = (c.get('log') as Logger | undefined) ?? fallbackLogger('me:delete');
  const auth = c.get('user');
  const userId = auth.id;

  log.info('account deletion: starting', { sub: userId.slice(0, 8) });

  // 1. Delete all sessions (signs them out everywhere).
  await deleteAllSessionsForUser(userId);

  // 2. Delete all jobs owned by user — documents CASCADE on the FK.
  await db().delete(jobs).where(eq(jobs.user_id, userId));

  // 3. Delete files on disk. Best-effort: if it fails we still proceed
  //    to anonymise the user row, which is the legally critical step.
  try {
    await deleteUserFiles(userId);
  } catch (err) {
    log.error('account deletion: file cleanup failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Anonymise the user row.
  await anonymiseUser(userId);

  // 5. Clear the cookie on the response.
  const e = env();
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    domain: e.COOKIE_DOMAIN || undefined,
    secure: e.COOKIE_SECURE,
  });

  log.info('account deletion: complete', { sub: userId.slice(0, 8) });
  return c.json({ ok: true });
});
