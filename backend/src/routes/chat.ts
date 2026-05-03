import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { getJob, insertChatMessage, listChatMessages, listDocumentsForJob } from '../db/jobs.js';
import { answerChat, type ChatContext } from '../gemini/chat.js';
import { ensureFreshGeminiFile } from '../gemini/file-store.js';
import type { Report } from '../domain/risk-rules.js';

const sendSchema = z.object({ message: z.string().min(1).max(4000) });

export const chatRoute = new Hono<AuthEnv>();

chatRoute.use('*', requireAuth);

chatRoute.get('/:id/messages', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });

  const messages = await listChatMessages(id);
  return c.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    })),
  });
});

chatRoute.post('/:id/chat', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid body' });

  const job = await getJob(id);
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.user_id !== user.id) throw new HTTPException(403, { message: 'Forbidden' });
  if (job.status !== 'done') {
    throw new HTTPException(409, { message: 'Job not ready for chat' });
  }

  const history = await listChatMessages(id);

  await insertChatMessage(id, 'user', parsed.data.message);

  const documents = await listDocumentsForJob(id);
  const files: ChatContext['files'] = [];
  for (const d of documents) {
    if (!d.doc_type) continue;
    const ref = await ensureFreshGeminiFile(d);
    files.push({ filename: d.filename, ref });
  }

  let reply: string;
  try {
    reply = await answerChat(
      history.map((m) => ({ role: m.role, content: m.content })),
      parsed.data.message,
      { files, report: (job.report as Report | null) ?? null },
    );
  } catch (err) {
    console.error('[chat] gemini error', err);
    throw new HTTPException(502, { message: 'Chat backend failed' });
  }

  if (!reply || !reply.trim()) {
    reply = "I couldn't generate an answer for that — try rephrasing the question?";
  }

  await insertChatMessage(id, 'assistant', reply);

  return c.json({ reply });
});
