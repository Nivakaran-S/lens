import { createPartFromUri } from '@google/genai';
import { gemini, MODELS } from './client.js';
import { PER_DOC_SCHEMAS } from './schemas.js';
import { DOC_TYPE_HINTS, DOC_TYPE_LABELS, type DocType } from '../domain/doc-types.js';
import type { GeminiFileRef } from './file-store.js';

const SYSTEM_INSTRUCTION = `You extract structured facts from a single UK auction legal-pack PDF.

Rules:
- Return STRICT JSON matching the supplied schema. No commentary, no markdown, no code fences.
- If a field is unknown, omit it (do not invent values). Use the schema's "unknown" enum value where one is provided.
- Quote verbatim text where the schema asks for it (covenants, restrictions). Do not paraphrase.
- For UK addresses, normalise spacing in postcodes (e.g. "NG19 6HN").
- For dates, prefer ISO 8601 (YYYY-MM-DD). If only a year is shown, output "YYYY".
- For monetary values, output the number in GBP (e.g. 1500, not "£1,500").`;

export async function extractDocument(
  docType: DocType,
  file: GeminiFileRef,
  filenameHint: string,
): Promise<unknown> {
  const ai = gemini();
  const schema = PER_DOC_SCHEMAS[docType];

  const response = await ai.models.generateContent({
    model: MODELS.extract,
    contents: [
      {
        role: 'user',
        parts: [
          createPartFromUri(file.uri, file.mimeType),
          {
            text: `Document type: ${docType} (${DOC_TYPE_LABELS[docType]}).
Hint: ${DOC_TYPE_HINTS[docType]}
Filename: ${filenameHint}

Extract the structured facts now.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) throw new Error(`Empty extraction response for ${docType}`);

  return JSON.parse(text);
}
