import { createPartFromUri, type Content } from '@google/genai';
import { gemini, MODELS } from './client.js';
import type { GeminiFileRef } from './file-store.js';
import type { Report } from '../domain/risk-rules.js';

const SYSTEM_INSTRUCTION = `You are a UK conveyancing assistant answering follow-up questions about a single auction legal pack.

Rules:
- Ground every claim in the attached PDFs and the provided synthesis report.
- Quote source docs and pages where helpful (e.g. "Title Register, Charges Register entry 2").
- If the answer is not in the pack, say so explicitly — do not speculate.
- Keep answers tight: 1–4 short paragraphs unless the user explicitly asks for more.
- Never give legal advice — recommend consulting a conveyancer for binding advice.
- Plain English; explain UK jargon inline.`;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ChatContext = {
  files: { filename: string; ref: GeminiFileRef }[];
  report: Report | null;
};

/**
 * Send one chat message + history and return the assistant reply.
 * Files are attached on every turn (Gemini caches the upload, but we re-reference URIs).
 */
export async function answerChat(
  history: ChatTurn[],
  userMessage: string,
  context: ChatContext,
): Promise<string> {
  const ai = gemini();

  const reportBlurb = context.report
    ? `Synthesis report (already produced for this pack):\n\n${JSON.stringify(context.report, null, 2)}\n\n`
    : '';
  const fileList = context.files.length
    ? `Documents in this pack:\n${context.files.map((f, i) => `  ${i + 1}. ${f.filename}`).join('\n')}\n\n`
    : '';

  const groundingPreamble: Content = {
    role: 'user',
    parts: [
      { text: `${reportBlurb}${fileList}Use the attached PDFs as the source of truth. The report above is your prior synthesis — refine or correct it if the user surfaces something new.` },
      ...context.files.map((f) => createPartFromUri(f.ref.uri, f.ref.mimeType)),
    ],
  };
  const groundingAck: Content = {
    role: 'model',
    parts: [{ text: 'Understood. I will answer questions strictly from these documents and the prior synthesis.' }],
  };

  const historyContents: Content[] = history.map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }));

  const response = await ai.models.generateContent({
    model: MODELS.chat,
    contents: [
      groundingPreamble,
      groundingAck,
      ...historyContents,
      { role: 'user', parts: [{ text: userMessage }] },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
    },
  });

  return response.text ?? '';
}
