import { GoogleGenAI } from '@google/genai';
import { env } from '../env.js';

let cached: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (cached) return cached;
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  cached = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return cached;
}

export const MODELS = {
  classify: 'gemini-2.5-flash',
  extract: 'gemini-2.5-flash',
  synthesize: 'gemini-2.5-pro',
  chat: 'gemini-2.5-flash-lite',
} as const;

// Files in the Gemini File API expire after 48 h. We refresh proactively at 40 h.
export const FILE_REFRESH_AGE_MS = 40 * 60 * 60 * 1000;
