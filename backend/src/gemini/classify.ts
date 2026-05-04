import { createPartFromUri } from '@google/genai';
import { gemini, MODELS } from './client.js';
import { classifySchema } from './schemas.js';
import { DOC_TYPE_HINTS, DOC_TYPE_LABELS, DOC_TYPES, type DocType } from '../domain/doc-types.js';
import type { GeminiFileRef } from './file-store.js';
import { withFreeTierThrottle } from './throttle.js';

const SYSTEM_INSTRUCTION = `You classify a single PDF page set into one UK auction legal-pack document type.
Return STRICT JSON matching the provided schema. No prose.

Document types:
${DOC_TYPES.map((t) => `- ${t}: ${DOC_TYPE_LABELS[t]} — ${DOC_TYPE_HINTS[t]}`).join('\n')}`;

const PROMPT = `Classify the attached PDF as exactly one of the listed document types.
Pick "other" only if none of the named types fit. Output the JSON now.`;

export type ClassifyResult = {
  doc_type: DocType;
  confidence: number;
  reason: string;
};

export async function classifyDocument(file: GeminiFileRef, filenameHint: string): Promise<ClassifyResult> {
  return withFreeTierThrottle(`classify ${filenameHint}`, async () => {
    const ai = gemini();
    const response = await ai.models.generateContent({
      model: MODELS.classify,
      contents: [
        {
          role: 'user',
          parts: [
            createPartFromUri(file.uri, file.mimeType),
            { text: `Filename hint: ${filenameHint}\n\n${PROMPT}` },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: classifySchema,
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty classify response');

    const parsed = JSON.parse(text) as ClassifyResult;
    if (!DOC_TYPES.includes(parsed.doc_type)) {
      throw new Error(`Classifier returned unknown doc_type: ${parsed.doc_type}`);
    }
    return parsed;
  });
}
