import { GoogleGenAI } from '@google/genai';
import { env } from '../env.js';

let cached: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (cached) return cached;
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  cached = new GoogleGenAI({ apiKey });
  return cached;
}

export const MODELS = {
  classify: 'gemini-2.5-flash',
  extract: 'gemini-2.5-flash',
  // Note: gemini-2.5-pro is NOT in the Gemini API free tier (limit: 0).
  // Use Flash for the unified analyseAll call so free-tier accounts work.
  // If/when on paid tier, swap to 'gemini-2.5-pro' for richer cross-doc
  // reasoning at higher cost.
  synthesize: 'gemini-2.5-flash',
  chat: 'gemini-2.5-flash-lite',
} as const;

// Files in the Gemini File API expire after 48 h. We refresh proactively at 40 h.
export const FILE_REFRESH_AGE_MS = 40 * 60 * 60 * 1000;
