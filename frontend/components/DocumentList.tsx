'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { JobDocument } from '../lib/types';

const DOC_TYPE_LABEL: Record<string, string> = {
  title_register: 'Title register',
  title_plan: 'Title plan',
  local_search: 'Local search',
  environmental_search: 'Environmental search',
  drainage_water_search: 'Drainage & water',
  epc: 'EPC',
  ta6_property_info: 'TA6 property info',
  ta10_fittings_contents: 'TA10 fittings & contents',
  historic_conveyance: 'Historic conveyance',
  grant_of_probate: 'Grant of probate',
  special_conditions: 'Special conditions',
  contents_list: 'Contents list',
  other: 'Other',
};

export function DocumentList({ jobId, documents }: { jobId: string; documents: JobDocument[] }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Documents in this pack</h2>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {documents.map((d) => (
          <DocumentRow key={d.id} jobId={jobId} doc={d} />
        ))}
      </ul>
    </section>
  );
}

function DocumentRow({ jobId, doc }: { jobId: string; doc: JobDocument }) {
  const extraction = doc.extraction && typeof doc.extraction === 'object'
    ? (doc.extraction as Record<string, unknown>)
    : null;
  const hasExtraction = extraction !== null && Object.keys(extraction).length > 0;
  // Default to expanded so users see the per-doc summary at a glance.
  // Collapsing is still available via the chevron toggle.
  const [open, setOpen] = useState(hasExtraction);
  const [showRaw, setShowRaw] = useState(false);
  const [pending, startTransition] = useTransition();

  function viewPdf() {
    startTransition(async () => {
      try {
        const r = await api.getDocumentUrl(jobId, doc.id);
        window.open(r.url, '_blank', 'noopener,noreferrer');
      } catch (e) {
        console.error('failed to get signed url', e);
      }
    });
  }

  return (
    <li>
      <div className="flex items-center justify-between gap-3 p-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          disabled={!hasExtraction}
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${hasExtraction ? 'text-zinc-500' : 'text-zinc-300 dark:text-zinc-700'}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm">{doc.filename}</span>
        </button>
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
          {doc.doc_type ? (
            <span
              className={
                hasExtraction
                  ? 'text-zinc-700 dark:text-zinc-300'
                  : 'flex items-center gap-1 text-amber-700 dark:text-amber-300'
              }
            >
              {!hasExtraction && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Classifying…
            </span>
          )}
        </span>
        <button
          onClick={viewPdf}
          disabled={pending}
          className="flex items-center gap-1 whitespace-nowrap text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {pending ? 'Opening…' : 'View PDF'}
        </button>
      </div>
      {open && hasExtraction && extraction && (
        <div className="border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <ExtractionSummary docType={doc.doc_type} extraction={extraction} />
          <div className="mt-3 border-t border-zinc-200 pt-2 text-right dark:border-zinc-800">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="text-[11px] text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>
          </div>
          {showRaw && (
            <pre className="mt-2 max-h-96 overflow-auto rounded border border-zinc-200 bg-white p-2 text-[11px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
{JSON.stringify(extraction, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

// ── Per-doc-type field summary ────────────────────────────────────────
//
// Each doc_type has a small set of "first-look" fields a buyer cares
// about. ExtractionSummary picks them out, formats them, and falls back
// to a generic key/value table for unrecognised types.

const FIELDS_BY_TYPE: Record<string, { key: string; label: string }[]> = {
  title_register: [
    { key: 'title_number', label: 'Title number' },
    { key: 'address', label: 'Address' },
    { key: 'tenure', label: 'Tenure' },
    { key: 'class_of_title', label: 'Class of title' },
    { key: 'registered_proprietors', label: 'Registered proprietors' },
    { key: 'charges', label: 'Charges' },
    { key: 'restrictive_covenants', label: 'Restrictive covenants' },
    { key: 'easements', label: 'Easements' },
    { key: 'proprietorship_restrictions', label: 'Restrictions' },
  ],
  title_plan: [
    { key: 'title_number', label: 'Title number' },
    { key: 'notable_observations', label: 'Notable observations' },
  ],
  local_search: [
    { key: 'address', label: 'Address' },
    { key: 'road_status', label: 'Road status' },
    { key: 'conservation_area', label: 'Conservation area' },
    { key: 'listed_building', label: 'Listed building' },
    { key: 'article_4_directions', label: 'Article 4 directions' },
    { key: 'contaminated_land_register', label: 'On contaminated-land register' },
    { key: 'enforcement_notices', label: 'Enforcement notices' },
    { key: 'planning_history', label: 'Planning history' },
    { key: 's106_obligations', label: 'Section 106 obligations' },
    { key: 'cil_outstanding', label: 'CIL outstanding' },
  ],
  environmental_search: [
    { key: 'flood_risk_river', label: 'River flood risk' },
    { key: 'flood_risk_surface', label: 'Surface flood risk' },
    { key: 'flood_risk_coastal', label: 'Coastal flood risk' },
    { key: 'radon_affected_area', label: 'Radon affected area' },
    { key: 'radon_pct', label: 'Radon %' },
    { key: 'contaminated_land_part_2a', label: 'Part 2A contamination' },
    { key: 'ground_stability_concerns', label: 'Ground stability' },
    { key: 'nearby_industrial_or_landfill_sites', label: 'Nearby industrial / landfill' },
  ],
  drainage_water_search: [
    { key: 'mains_foul_drainage', label: 'Mains foul drainage' },
    { key: 'mains_water_supply', label: 'Mains water supply' },
    { key: 'public_sewer_within_boundary', label: 'Public sewer within boundary' },
    { key: 'public_sewer_within_3m_of_building', label: 'Public sewer ≤3m of building' },
    { key: 'surface_water_disposal', label: 'Surface water disposal' },
    { key: 'metered', label: 'Metered' },
  ],
  epc: [
    { key: 'address', label: 'Address' },
    { key: 'current_band', label: 'Current band' },
    { key: 'current_score', label: 'Current score' },
    { key: 'potential_band', label: 'Potential band' },
    { key: 'potential_score', label: 'Potential score' },
    { key: 'valid_until', label: 'Valid until' },
    { key: 'property_type', label: 'Property type' },
    { key: 'floor_area_sqm', label: 'Floor area (sqm)' },
  ],
  ta6_property_info: [
    { key: 'address', label: 'Address' },
    { key: 'disputes_or_complaints', label: 'Disputes / complaints' },
    { key: 'disputes_detail', label: 'Disputes detail' },
    { key: 'alterations_done', label: 'Alterations done' },
    { key: 'building_regs_provided', label: 'Building regs provided' },
    { key: 'planning_consents_provided', label: 'Planning consents provided' },
    { key: 'japanese_knotweed', label: 'Japanese knotweed' },
    { key: 'flooding_history', label: 'Flooding history' },
    { key: 'parking_arrangement', label: 'Parking arrangement' },
    { key: 'guarantees_provided', label: 'Guarantees provided' },
  ],
  ta10_fittings_contents: [
    { key: 'included', label: 'Included in sale' },
    { key: 'excluded', label: 'Excluded from sale' },
    { key: 'extras_for_purchase', label: 'Extras for purchase' },
  ],
  historic_conveyance: [
    { key: 'date', label: 'Date' },
    { key: 'parties', label: 'Parties' },
    { key: 'notable_covenants_imposed', label: 'Notable covenants imposed' },
  ],
  grant_of_probate: [
    { key: 'grant_type', label: 'Grant type' },
    { key: 'deceased_name', label: 'Deceased name' },
    { key: 'date_of_death', label: 'Date of death' },
    { key: 'date_of_grant', label: 'Date of grant' },
    { key: 'executors_or_administrators', label: 'Executors / administrators' },
    { key: 'estate_value_gbp', label: 'Estate value (GBP)' },
  ],
  special_conditions: [
    { key: 'buyers_premium_gbp', label: 'Buyer’s premium (£)' },
    { key: 'seller_legal_fees_payable_by_buyer_gbp', label: 'Seller legal fees (£)' },
    { key: 'additional_search_fees_payable_by_buyer_gbp', label: 'Search fees (£)' },
    { key: 'completion_period_days', label: 'Completion period (days)' },
    { key: 'vat_election', label: 'VAT election' },
    { key: 'indemnity_insurance_required', label: 'Indemnity insurance required' },
    { key: 'notable_conditions', label: 'Notable conditions' },
  ],
  contents_list: [
    { key: 'listed_documents', label: 'Listed documents' },
  ],
  other: [
    { key: 'summary', label: 'Summary' },
  ],
};

function ExtractionSummary({
  docType,
  extraction,
}: {
  docType: string | null;
  extraction: Record<string, unknown>;
}) {
  const fields: { key: string; label: string }[] =
    docType && FIELDS_BY_TYPE[docType] ? FIELDS_BY_TYPE[docType] : [];

  // Build rows: only show fields that have a meaningful value.
  const rows: { label: string; value: unknown }[] = [];
  if (fields.length > 0) {
    for (const f of fields) {
      const v = extraction[f.key];
      if (isMeaningful(v)) rows.push({ label: f.label, value: v });
    }
  } else {
    // Unknown doc_type — list every populated field generically.
    for (const [key, value] of Object.entries(extraction)) {
      if (isMeaningful(value)) {
        rows.push({ label: humaniseKey(key), value });
      }
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs italic text-zinc-500">
        No structured fields extracted for this document.
      </p>
    );
  }

  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {rows.map((r, i) => (
        <FieldRow key={i} label={r.label} value={r.value} />
      ))}
    </dl>
  );
}

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return false;
  return true;
}

function humaniseKey(k: string): string {
  return k
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function FieldRow({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-words text-zinc-800 dark:text-zinc-200">{renderValue(value)}</dd>
    </>
  );
}

function renderValue(v: unknown): React.ReactNode {
  if (typeof v === 'boolean') {
    return (
      <span
        className={
          v
            ? 'rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
            : 'rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }
      >
        {v ? 'Yes' : 'No'}
      </span>
    );
  }
  if (typeof v === 'number') {
    return <span className="font-mono">{v.toLocaleString()}</span>;
  }
  if (typeof v === 'string') {
    return v;
  }
  if (Array.isArray(v)) {
    // Array of primitives → comma list. Array of objects → bullet list.
    if (v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
      return v.map((x) => String(x)).join('; ');
    }
    return (
      <ul className="list-disc space-y-1 pl-5">
        {v.map((item, i) => (
          <li key={i}>{renderValue(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof v === 'object' && v !== null) {
    // Nested object — show as inline labelled pairs.
    return (
      <span className="space-y-0.5 block text-xs">
        {Object.entries(v).map(([k, val]) => (
          isMeaningful(val) && (
            <span key={k} className="block">
              <span className="text-zinc-500">{humaniseKey(k)}:</span>{' '}
              <span>{renderValue(val)}</span>
            </span>
          )
        ))}
      </span>
    );
  }
  return String(v);
}
