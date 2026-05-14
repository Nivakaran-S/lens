import { createPartFromUri, type Part } from '@google/genai';
import { gemini, MODELS } from './client.js';
import type { GeminiFileRef } from './file-store.js';
import type { Report } from '../domain/risk-rules.js';
import type { DocType } from '../domain/doc-types.js';
import { logger } from '../util/log.js';

const log = logger('analyseAll');

/**
 * One-shot pack analysis. Sends all PDFs to Gemini 2.5 Pro in a single call
 * and gets back per-doc classification + extraction AND the cross-doc
 * synthesis report. Replaces the previous 25-call (12 classify + 12 extract
 * + 1 synthesize) pipeline with a single API call.
 *
 * Trade-offs vs the per-call pipeline:
 *  + 1 generate_content call instead of 25 → trivial on free-tier rate limits
 *  + Pro sees all raw PDFs simultaneously → better cross-doc reasoning
 *  + ~30-90s wall-clock vs ~6-7 min on free tier
 *  - Single point of failure (no partial results)
 *  - All-at-once UI update — no incremental progress within the analysis step
 */

export type DocInput = {
  id: string;
  filename: string;
  file: GeminiFileRef;
};

export type PerDocResult = {
  filename: string;
  doc_type: DocType;
  extraction: Record<string, unknown>;
};

export type AnalyseAllResult = {
  documents: PerDocResult[];
  report: Report;
};

const SYSTEM_INSTRUCTION = `You are an expert UK conveyancing analyst specialising in property auction legal packs.

You will receive a set of PDF documents (typically 8–15 files) that together make up an auction legal pack for a single UK property. Your job is to:
1. Classify each document into one of the canonical UK auction-pack document types.
2. Extract structured facts from each document, using the doc-type-specific field list below.
3. Cross-reference findings across documents to produce an overall risk-scored report.

Output STRICT JSON in the exact shape below. No prose, no markdown, no code fences.

{
  "documents": [
    { "filename": <verbatim filename as given>,
      "doc_type": <one of: title_register, title_plan, local_search, environmental_search, drainage_water_search, epc, ta6_property_info, ta10_fittings_contents, historic_conveyance, grant_of_probate, special_conditions, contents_list, other>,
      "extraction": { <doc-type-specific structured fields, see below — omit unknown fields> }
    },
    ...
  ],
  "property_summary": {
    "address": <string>,
    "tenure": <freehold|leasehold|commonhold|unknown>,
    "registered_owners": [<string>],
    "title_number": <string>,
    "lot_id": <string if shown>
  },
  "overall_risk": <low|medium|high|critical>,
  "executive_summary": <2–4 sentence narrative paragraph a buyer can read in 10 seconds to get the gist of the whole pack. Mention property type/tenure, vacant possession, key money figures (premium, completion period), and the headline risk if any. Plain English, no jargon. Max 600 characters.>,
  "headline_findings": [
    { "finding": <one short sentence a buyer reads first>,
      "sources": [<verbatim filename(s) of the document(s) that support this point — must match one of the filenames in the pack list above; usually 1, up to 3 if the finding synthesises across documents>]
    }
  ],
  "risks": [
    { "severity": <critical|high|medium|low|info>,
      "category": <title|legal|physical|planning|environmental|financial|completion>,
      "title": <short headline>,
      "explanation": <plain English, 1–3 sentences>,
      "evidence": [{ "doc_filename": <string>, "page_ref": <string>, "quote": <verbatim quote> }],
      "recommended_action": <concrete next step, e.g. "Insure via restrictive-covenant indemnity (~£150)">,
      "blocks_completion": <bool>
    }
  ],
  "cross_document_consistency": {
    "executor_matches_proprietor": <bool>,
    "epc_address_matches_title": <bool>,
    "notes": [<string>]
  },
  "buyer_questions_for_solicitor": [<5–10 specific, actionable questions>]
}

Per-doc-type extraction fields (omit any unknown):

title_register: title_number, address, tenure, class_of_title (absolute|possessory|qualified|good_leasehold|unknown), registered_proprietors[], charges[{description, beneficiary, dated}], restrictive_covenants[{summary, text, source_doc}], easements[{summary, text}], proprietorship_restrictions[{summary, text}]

title_plan: title_number, notable_observations[]

local_search: address, road_status (adopted|unadopted|partially_adopted|private|unknown), conservation_area, listed_building, article_4_directions[], contaminated_land_register, enforcement_notices[{summary, date}], planning_history[{ref, summary, decision (approved|refused|pending|withdrawn|unknown), date}], s106_obligations[], cil_outstanding

environmental_search: flood_risk_river (none|low|medium|high|unknown), flood_risk_surface, flood_risk_coastal, radon_affected_area, radon_pct, contaminated_land_part_2a, ground_stability_concerns[], nearby_industrial_or_landfill_sites[{summary, distance_m}]

drainage_water_search: mains_foul_drainage (bool), mains_water_supply (bool), public_sewer_within_boundary (bool), public_sewer_within_3m_of_building (bool), surface_water_disposal (mains|soakaway|private|unknown), metered (bool)

epc: address, current_band (A|B|C|D|E|F|G|unknown), current_score, potential_band, potential_score, valid_until, property_type, floor_area_sqm

ta6_property_info: address, disputes_or_complaints (bool), disputes_detail, alterations_done[], building_regs_provided[], planning_consents_provided[], japanese_knotweed (yes|no|not_known|unknown), flooding_history (bool), parking_arrangement, guarantees_provided[]

ta10_fittings_contents: included[], excluded[], extras_for_purchase[{item, price_gbp}]

historic_conveyance: date, parties[], notable_covenants_imposed[{summary, text}]

grant_of_probate: grant_type (probate|letters_of_administration|unknown), deceased_name, date_of_death, date_of_grant, executors_or_administrators[], estate_value_gbp

special_conditions: buyers_premium_gbp, seller_legal_fees_payable_by_buyer_gbp, additional_search_fees_payable_by_buyer_gbp, completion_period_days, vat_election (bool), indemnity_insurance_required[], notable_conditions[]

contents_list: listed_documents[]

other: summary

Rules:
- Quote verbatim text where a schema asks for it (covenants, restrictions). Do not paraphrase. BUT keep length bounded so the output fits in the response budget — see length caps below.
- For UK addresses, normalise spacing in postcodes (e.g. "NG19 6HN").
- For dates, prefer ISO 8601 (YYYY-MM-DD); if only a year is shown, output "YYYY".
- For monetary values, output the number in GBP (e.g. 1500, not "£1,500").
- ANY number found in any document — whether written as digits ("28 days", "£1,500", "5%") or in word form ("twenty-eight days", "one thousand five hundred pounds", "five per cent") — MUST appear in the relevant headline_findings[].finding or risks[].explanation when it materially affects the buyer (e.g. completion period, fees, percentages, distances, dates, areas, ages, EPC scores, deposit amounts, premium amounts). Convert word-form numbers to digit form in the output. Never round or summarise numeric values; preserve them exactly as stated in the source.
- headline_findings: produce 3–5 entries. Each entry MUST cite at least one filename in "sources" — copy the filename verbatim from the pack list above (case-sensitive). Never invent a filename. If a finding genuinely spans multiple docs (e.g. executor mismatch crosses the grant of probate and the title register), list every contributing filename.
- Severity guidance: critical = blocks completion or causes major financial harm; high = materially affects bid or post-completion plans; medium = should know about, may need a quote; low = noted for completeness; info = neutral fact.
- Always populate buyer_questions_for_solicitor with 5–10 specific, actionable questions.
- Set overall_risk to the highest severity present in risks[].
- If a fact is unknown, OMIT the field rather than inventing a value.
- Cross-check: probate sales — verify executor names match the registered proprietor of the title.
- Cross-check: EPC address vs title address.

Output budget — these limits exist so the JSON fits in the response token cap; exceeding them silently truncates the response and FAILS the analysis. Stay strictly within them:
- Each "quote" field (in risks[].evidence[]): max 200 characters of the verbatim source text. Truncate the prefix; do not paraphrase or summarise.
- Each "text" field on covenants, easements, proprietorship_restrictions, and historic_conveyance.notable_covenants_imposed: max 300 characters of verbatim text. Truncate; do not paraphrase.
- Each "summary" field: max 180 characters.
- Each "explanation" on risks[]: max 400 characters.
- "executive_summary": max 500 characters.
- risks[]: maximum 20 entries. If more than 20 issues exist, keep the highest-severity ones and merge similar items.
- restrictive_covenants[], easements[], proprietorship_restrictions[], charges[], planning_history[], enforcement_notices[], s106_obligations[], indemnity_insurance_required[], notable_conditions[], guarantees_provided[], alterations_done[], building_regs_provided[], planning_consents_provided[], ground_stability_concerns[], nearby_industrial_or_landfill_sites[], notable_observations[]: maximum 12 entries each. If more exist, keep the most material and add a final entry whose summary reads "[+N more not shown]".
- headline_findings: 3–5 entries (no more), each "finding" max 200 characters.
- buyer_questions_for_solicitor: 5–8 entries (no more), each max 180 characters. Each MUST be a plain JSON string, NOT an object — example: "What is the position on …?", not {"question": "…"}.
- Omit any field whose value would be an empty string, empty array, or null. Output JSON only — no leading or trailing whitespace beyond a single newline at most.

CRITICAL — JSON validity:
- Output a single root JSON object. No text before { or after the closing }.
- Use double quotes for every string. Escape literal " inside strings as \\".
- No trailing commas. No JS-style comments. No undefined values.
- Mentally re-check that every opened [ and { has a matching close before you finish.`;

/**
 * Best-effort repair of nearly-valid JSON. Most Gemini malformations are
 * easy to fix from the tail: stray trailing braces, unbalanced [] / {},
 * trailing commas before close-brackets, or text after the closing }.
 *
 * Returns the repaired string if any change was made, or null if there's
 * nothing obvious to try. Caller should still wrap JSON.parse in try/catch.
 */
function tryRepairJson(s: string): string | null {
  let out = s.trim();
  if (!out.startsWith('{')) return null;

  // 1. Trim anything after the last balanced closing brace at depth 0.
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastValidEnd = -1;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) lastValidEnd = i;
    }
  }
  if (lastValidEnd >= 0 && lastValidEnd < out.length - 1) {
    out = out.slice(0, lastValidEnd + 1);
  }

  // 2. If we ended mid-object/array, try appending the missing closers.
  depth = 0;
  inString = false;
  escape = false;
  const stack: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  if (stack.length > 0) {
    // Strip trailing comma (very common: `..., ` before EOF) so close works.
    out = out.replace(/,\s*$/, '');
    out += stack.reverse().join('');
  }

  // 3. Trailing-comma-before-close — the other common malformation.
  out = out.replace(/,\s*([}\]])/g, '$1');

  return out === s ? null : out;
}

// Extra rules appended to the system instruction when we retry in compact
// mode after a truncated first attempt. These OVERRIDE the base-prompt
// length budget with stricter caps so the second attempt definitely fits.
// Schema and field set are unchanged — only string lengths get tighter.
const COMPACT_SUFFIX = `

Compact-mode overrides (this run only — these REPLACE the base output budget):
- "quote" fields: max 100 characters.
- "text" fields on covenants/easements/restrictions/conveyances: max 160 characters.
- "explanation" on risks[]: max 240 characters.
- "summary" fields: max 100 characters.
- "executive_summary": max 300 characters.
- risks[]: max 12 entries. Keep the highest-severity ones and merge similar items.
- restrictive_covenants[], easements[], proprietorship_restrictions[], charges[], planning_history[], enforcement_notices[]: max 6 entries each. Use a final "[+N more not shown]" summary entry if more exist.
- headline_findings[]: produce exactly 3 entries (not 5). Each "finding" max 160 characters.
- buyer_questions_for_solicitor: max 5 entries, each max 140 characters. Plain strings only — never objects.
- Truncate prefixes; never paraphrase. Omit any field whose value is empty/null/[]. Schema and required keys unchanged.
- Re-check brackets and quote escaping before emitting.`;

type AttemptOutcome =
  | { ok: true; result: AnalyseAllResult }
  | { ok: false; truncated: boolean; reason: string; length: number; tail: string };

async function attempt(parts: Part[], compact: boolean): Promise<AttemptOutcome> {
  const ai = gemini();
  const response = await ai.models.generateContent({
    model: MODELS.synthesize,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: compact
        ? SYSTEM_INSTRUCTION + COMPACT_SUFFIX
        : SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      temperature: 0,
      // gemini-2.5-flash supports up to 65,536 output tokens. 64k gives
      // headroom for verbatim covenant quotes; compact retry trims further.
      maxOutputTokens: 64_000,
    },
  });

  const text = response.text ?? '';
  const finishReason = response.candidates?.[0]?.finishReason ?? 'UNKNOWN';

  if (!text) {
    return {
      ok: false,
      truncated: false,
      reason: `empty response (finishReason=${finishReason})`,
      length: 0,
      tail: '',
    };
  }

  // Gemini truncates output silently when it hits maxOutputTokens — the
  // result is well-formed prefix + cut-off tail. Detect this BEFORE the
  // JSON.parse step so the retry path can fire on the real cause.
  if (finishReason === 'MAX_TOKENS') {
    return {
      ok: false,
      truncated: true,
      reason: `truncated by MAX_TOKENS at length=${text.length}`,
      length: text.length,
      tail: text.slice(-200).replace(/\s+/g, ' '),
    };
  }

  let parsed: AnalyseAllResult | null = null;
  let parseErrorMessage: string | null = null;
  try {
    parsed = JSON.parse(text) as AnalyseAllResult;
  } catch (err) {
    parseErrorMessage = err instanceof Error ? err.message : String(err);
    // Try a best-effort repair before giving up. Most failures are trailing
    // commas, unbalanced brackets at the very end, or stray text after the
    // last `}` — all fixable without changing the data.
    const repaired = tryRepairJson(text);
    if (repaired !== null) {
      try {
        parsed = JSON.parse(repaired) as AnalyseAllResult;
        parseErrorMessage = null; // repaired successfully
      } catch {
        // Fall through — the repair didn't work either.
      }
    }
  }

  if (!parsed) {
    return {
      ok: false,
      // Any parse failure is recoverable via compact mode (which produces a
      // smaller, less complex output the model is less likely to mangle).
      // We previously only retried on truncation, which missed cases like
      // this one where finishReason=STOP but the JSON ended with a stray
      // closing brace.
      truncated: true,
      reason: `JSON.parse failed (finishReason=${finishReason}): ${parseErrorMessage}`,
      length: text.length,
      tail: text.slice(-200).replace(/\s+/g, ' '),
    };
  }

  if (!Array.isArray(parsed.documents)) {
    return {
      ok: false,
      truncated: false,
      reason: 'response missing documents[]',
      length: text.length,
      tail: text.slice(-200).replace(/\s+/g, ' '),
    };
  }

  if (!parsed.report && (parsed as unknown as Record<string, unknown>).property_summary) {
    // Some calls return flat shape (synthesis fields at top level instead of
    // under `report`). Lift them into the expected shape.
    const r = parsed as unknown as Record<string, unknown>;
    parsed = {
      documents: parsed.documents,
      report: {
        property_summary: r.property_summary as Report['property_summary'],
        overall_risk: (r.overall_risk as Report['overall_risk']) ?? 'low',
        executive_summary:
          typeof r.executive_summary === 'string' ? r.executive_summary : undefined,
        headline_findings: (r.headline_findings as Report['headline_findings']) ?? [],
        risks: (r.risks as Report['risks']) ?? [],
        cross_document_consistency:
          (r.cross_document_consistency as Report['cross_document_consistency']) ?? {},
        buyer_questions_for_solicitor: (r.buyer_questions_for_solicitor as string[]) ?? [],
      },
    };
  }

  return { ok: true, result: parsed };
}

export async function analyseAll(docs: DocInput[]): Promise<AnalyseAllResult> {
  const filenameList = docs.map((d, i) => `  ${i + 1}. ${d.filename}`).join('\n');

  const parts: Part[] = [
    {
      text: `Pack contains ${docs.length} documents:\n${filenameList}\n\nThe PDFs are attached below in the same order. Produce the full JSON now.`,
    },
    ...docs.map((d) => createPartFromUri(d.file.uri, d.file.mimeType)),
  ];

  // First attempt: normal mode. If Gemini truncated output (MAX_TOKENS or a
  // mid-stream JSON parse failure) we retry once in compact mode, which caps
  // verbatim quote lengths so the response fits comfortably under the token
  // ceiling. Both attempts use the same files — no extra upload cost.
  const first = await attempt(parts, false);
  if (first.ok) return first.result;

  if (first.truncated) {
    log.warn(
      `first attempt failed (${first.reason}); retrying in compact mode. tail=…${first.tail}`,
    );
    const second = await attempt(parts, true);
    if (second.ok) {
      log.info('compact-mode retry succeeded');
      return second.result;
    }
    throw new Error(
      `analyseAll failed after compact-mode retry. ` +
        `First: ${first.reason}. Second: ${second.reason}. Tail: …${second.tail}`,
    );
  }

  // Non-truncation failures (empty body, bad shape) — surface as-is.
  throw new Error(`analyseAll failed: ${first.reason}. Tail: …${first.tail}`);
}
