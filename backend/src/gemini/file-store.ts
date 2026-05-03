import { FILE_REFRESH_AGE_MS, gemini } from './client.js';
import { updateDocument } from '../db/jobs.js';
import { getObjectBuffer } from '../storage/r2.js';
import type { DocumentRow } from '../db/jobs.js';

export type GeminiFileRef = { uri: string; mimeType: string };

/**
 * Upload a PDF buffer to the Gemini File API and return its URI.
 */
export async function uploadPdfToGemini(buffer: Buffer, displayName: string): Promise<GeminiFileRef> {
  const ai = gemini();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
  const file = await ai.files.upload({
    file: blob,
    config: { mimeType: 'application/pdf', displayName },
  });
  if (!file.uri) throw new Error('Gemini File API returned no URI');
  return { uri: file.uri, mimeType: 'application/pdf' };
}

/**
 * Returns a usable Gemini file URI for a document, re-uploading from R2 if the
 * existing URI is missing or older than {@link FILE_REFRESH_AGE_MS}.
 */
export async function ensureFreshGeminiFile(doc: DocumentRow): Promise<GeminiFileRef> {
  const existingUri = doc.gemini_file_uri;
  const uploadedAt = doc.gemini_file_uploaded_at ? new Date(doc.gemini_file_uploaded_at).getTime() : 0;
  const age = Date.now() - uploadedAt;

  if (existingUri && age < FILE_REFRESH_AGE_MS) {
    return { uri: existingUri, mimeType: 'application/pdf' };
  }

  const buffer = await getObjectBuffer(doc.storage_key);
  const ref = await uploadPdfToGemini(buffer, doc.filename);

  await updateDocument(doc.id, {
    gemini_file_uri: ref.uri,
    gemini_file_uploaded_at: new Date().toISOString(),
  });

  return ref;
}
