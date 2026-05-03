import { createPartFromUri, type Part } from '@google/genai';
import { gemini, MODELS } from './client.js';
import { synthesisSchema } from './schemas.js';
import { DOC_TYPE_LABELS, type DocType } from '../domain/doc-types.js';
import type { GeminiFileRef } from './file-store.js';
import type { Report } from '../domain/risk-rules.js';

const SYSTEM_INSTRUCTION = `You are an expert UK conveyancing analyst summarising a property auction legal pack for a non-lawyer buyer.

Rules:
- Return STRICT JSON matching the schema. No prose, no markdown, no code fences.
- Quote evidence verbatim from the documents and cite the source filename and page where possible.
- Plain English. Define UK legal jargon inline (e.g. "Section 106 (a planning obligation)").
- Severity guidance:
  * critical = blocks completion or causes major financial harm if missed.
  * high = materially affects buyer's bid or post-completion plans.
  * medium = should know about, may need a quote or specialist confirmation.
  * low = noted for completeness.
  * info = neutral fact, no action required.
- Always populate buyer_questions_for_solicitor with 5–10 specific, actionable questions.
- Set overall_risk to the highest severity present in risks[].
- If unsure about a fact, OMIT it rather than inventing one.
- Output JSON only.`;

export type DocumentForSynthesis = {
  filename: string;
  doc_type: DocType;
  extraction: unknown;
  file?: GeminiFileRef;
};

export async function synthesiseReport(documents: DocumentForSynthesis[]): Promise<Report> {
  const ai = gemini();

  const summaryBlock = documents
    .map(
      (d) =>
        `## ${d.filename} (${DOC_TYPE_LABELS[d.doc_type]})\n${JSON.stringify(d.extraction ?? {}, null, 2)}`,
    )
    .join('\n\n');

  const parts: Part[] = [
    {
      text: `Pack contents (${documents.length} documents):\n\n${summaryBlock}\n\nProduce the synthesis JSON now.`,
    },
  ];

  // Attach the file refs as evidence so the model can re-read them when extractions are thin.
  for (const d of documents) {
    if (d.file?.uri) parts.push(createPartFromUri(d.file.uri, d.file.mimeType));
  }

  const response = await ai.models.generateContent({
    model: MODELS.synthesize,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: synthesisSchema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Empty synthesis response');
  return JSON.parse(text) as Report;
}
