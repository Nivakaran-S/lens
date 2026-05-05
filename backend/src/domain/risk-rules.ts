import type { DocumentRow } from '../db/jobs.js';
import type { DocType } from './doc-types.js';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category = 'title' | 'legal' | 'physical' | 'planning' | 'environmental' | 'financial' | 'completion';

export type Risk = {
  severity: Severity;
  category: Category;
  title: string;
  explanation: string;
  evidence: { doc_filename: string; page_ref?: string; quote?: string }[];
  recommended_action: string;
  blocks_completion: boolean;
};

export type CrossDocumentConsistency = {
  executor_matches_proprietor?: boolean;
  epc_address_matches_title?: boolean;
  notes?: string[];
};

// Each bullet under "Overall risk" cites the source documents it was derived
// from — verbatim filenames matching documents in the uploaded ZIP. Some
// findings synthesise across multiple docs (e.g. executor-mismatch needs
// both the grant of probate and the title register), so `sources` is an
// array.
export type HeadlineFinding = {
  finding: string;
  sources: string[];
};

export type Report = {
  property_summary: {
    address?: string;
    tenure?: string;
    registered_owners?: string[];
    title_number?: string;
    lot_id?: string;
  };
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
  // Legacy shape (string[]) is kept readable for old jobs persisted before
  // the source-citation change. New analyses always produce HeadlineFinding[].
  headline_findings: Array<HeadlineFinding | string>;
  risks: Risk[];
  cross_document_consistency: CrossDocumentConsistency;
  buyer_questions_for_solicitor: string[];
};

const SEV_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const OVERALL_RANK: Record<Report['overall_risk'], number> = { low: 0, medium: 1, high: 2, critical: 3 };
const RANK_TO_OVERALL: Report['overall_risk'][] = ['low', 'medium', 'high', 'critical'];

function bumpSeverity(current: Severity, atLeast: Severity): Severity {
  return SEV_RANK[current] >= SEV_RANK[atLeast] ? current : atLeast;
}

function getDoc<T = Record<string, unknown>>(documents: DocumentRow[], type: DocType): T | null {
  const row = documents.find((d) => d.doc_type === type);
  if (!row || !row.extraction || typeof row.extraction !== 'object') return null;
  return row.extraction as T;
}

function getDocRow(documents: DocumentRow[], type: DocType): DocumentRow | null {
  return documents.find((d) => d.doc_type === type) ?? null;
}

function norm(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function namesOverlap(a: string, b: string): boolean {
  const ta = new Set(norm(a).split(' ').filter((w) => w.length > 2));
  const tb = new Set(norm(b).split(' ').filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap >= 2; // at least surname + one other token
}

/**
 * Apply deterministic UK auction rules on top of the model-generated report.
 * Adds findings the model may have missed, elevates severities, and fixes
 * cross-document consistency flags from the per-doc extractions.
 */
export function applyRiskRules(report: Report, documents: DocumentRow[]): Report {
  const out: Report = {
    ...report,
    risks: [...(report.risks ?? [])],
    headline_findings: [...(report.headline_findings ?? [])],
    cross_document_consistency: { ...(report.cross_document_consistency ?? {}) },
    buyer_questions_for_solicitor: [...(report.buyer_questions_for_solicitor ?? [])],
  };

  // ── Property summary fill-in ─────────────────────────────────────────
  const titleReg = getDoc<{
    title_number?: string;
    address?: string;
    tenure?: string;
    class_of_title?: string;
    registered_proprietors?: string[];
    charges?: { description?: string; beneficiary?: string }[];
    restrictive_covenants?: { summary?: string; text?: string; source_doc?: string }[];
    proprietorship_restrictions?: { summary?: string; text?: string }[];
  }>(documents, 'title_register');

  const titleRegRow = getDocRow(documents, 'title_register');
  out.property_summary = {
    ...(out.property_summary ?? {}),
    title_number: out.property_summary?.title_number ?? titleReg?.title_number,
    address: out.property_summary?.address ?? titleReg?.address,
    tenure: out.property_summary?.tenure ?? titleReg?.tenure,
    registered_owners:
      out.property_summary?.registered_owners?.length
        ? out.property_summary.registered_owners
        : titleReg?.registered_proprietors,
  };

  // ── Title class ──────────────────────────────────────────────────────
  const cls = titleReg?.class_of_title;
  if (cls && cls !== 'absolute' && cls !== 'unknown') {
    upsertRisk(out.risks, {
      severity: 'high',
      category: 'title',
      title: `Class of title is ${cls}, not absolute`,
      explanation:
        'Anything other than absolute title means the Land Registry has reservations about the chain of ownership. Lenders may decline; insurance is sometimes required.',
      evidence: titleRegRow ? [{ doc_filename: titleRegRow.filename, page_ref: 'Property Register' }] : [],
      recommended_action: 'Ask your conveyancer whether title indemnity insurance is required and check lender criteria.',
      blocks_completion: false,
    });
  }

  // ── Restrictive covenants ────────────────────────────────────────────
  const covenants = titleReg?.restrictive_covenants ?? [];
  if (covenants.length > 0 && titleRegRow) {
    const evidence = covenants.slice(0, 3).map((c) => ({
      doc_filename: titleRegRow.filename,
      page_ref: c.source_doc ?? 'Charges Register',
      quote: c.text ?? c.summary,
    }));
    upsertRisk(out.risks, {
      severity: 'medium',
      category: 'title',
      title: `${covenants.length} restrictive covenant${covenants.length === 1 ? '' : 's'} on title`,
      explanation:
        'Restrictive covenants can prohibit alterations, business use, or specific extensions. A breach is not always discharged by long use.',
      evidence,
      recommended_action:
        'Review each covenant against your intended use. Indemnity insurance for unenforced breaches typically £100–£500.',
      blocks_completion: false,
    });
  }

  // ── Proprietorship restrictions (Form A, lender consent, etc.) ───────
  const propRest = titleReg?.proprietorship_restrictions ?? [];
  if (propRest.length > 0 && titleRegRow) {
    upsertRisk(out.risks, {
      severity: 'medium',
      category: 'title',
      title: `Restriction on the proprietorship register`,
      explanation:
        'Restrictions limit how the property can be sold or charged. Common forms include Form A (beneficial interests) and lender-consent restrictions.',
      evidence: [{ doc_filename: titleRegRow.filename, page_ref: 'Proprietorship Register', quote: propRest[0]?.text }],
      recommended_action: 'Ask the seller’s solicitor what consent or certificate is required to comply with the restriction at completion.',
      blocks_completion: false,
    });
  }

  // ── EPC / MEES ───────────────────────────────────────────────────────
  const epc = getDoc<{
    address?: string;
    current_band?: string;
    valid_until?: string;
  }>(documents, 'epc');
  const epcRow = getDocRow(documents, 'epc');
  if (epc?.current_band && epcRow) {
    const band = epc.current_band.toUpperCase();
    if (band === 'F' || band === 'G') {
      upsertRisk(out.risks, {
        severity: 'critical',
        category: 'legal',
        title: `EPC band ${band} — fails MEES for residential lettings`,
        explanation:
          'Since 1 April 2020 it has been unlawful to let a residential property in England and Wales with an EPC of F or G unless an exemption is registered. From 2028 the threshold rises to C for new tenancies. Major retrofit or registered exemption is required.',
        evidence: [{ doc_filename: epcRow.filename, page_ref: '1', quote: `Energy efficiency band ${band}` }],
        recommended_action:
          'If you intend to let, budget for retrofit to at least band E now (and band C by 2028) or register an exemption.',
        blocks_completion: false,
      });
    } else if (band === 'D' || band === 'E') {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'legal',
        title: `EPC band ${band} — at risk of MEES 2028`,
        explanation:
          'Government has signalled that the minimum EPC for new residential tenancies will move to band C by 2028. D and E ratings will then require retrofit.',
        evidence: [{ doc_filename: epcRow.filename, page_ref: '1', quote: `Energy efficiency band ${band}` }],
        recommended_action: 'Plan retrofit cost into your bid (typical £8k–£15k for a small house).',
        blocks_completion: false,
      });
    }
  }

  // ── Probate executor / proprietor matching ───────────────────────────
  const probate = getDoc<{
    executors_or_administrators?: string[];
    deceased_name?: string;
  }>(documents, 'grant_of_probate');
  const probateRow = getDocRow(documents, 'grant_of_probate');
  if (probate && titleReg) {
    const executors = probate.executors_or_administrators ?? [];
    const owners = titleReg.registered_proprietors ?? [];
    const deceased = probate.deceased_name ?? '';
    const ownerMatchesDeceased = owners.some((o) => namesOverlap(o, deceased));
    out.cross_document_consistency.executor_matches_proprietor = ownerMatchesDeceased;

    if (!ownerMatchesDeceased && titleRegRow && probateRow) {
      upsertRisk(out.risks, {
        severity: 'critical',
        category: 'completion',
        title: 'Probate sale: deceased name does not match registered proprietor',
        explanation:
          'If the registered proprietor on the title is not the person named in the grant of probate, the executors may not have authority to sell. This is a common probate-sale completion blocker.',
        evidence: [
          { doc_filename: probateRow.filename, page_ref: '1', quote: `Deceased: ${deceased}` },
          { doc_filename: titleRegRow.filename, page_ref: 'Proprietorship Register', quote: owners.join('; ') },
        ],
        recommended_action:
          'Ask the seller’s solicitor for the chain of title from the deceased to the current registered proprietor before bidding.',
        blocks_completion: true,
      });
    }

    if (executors.length === 0 && probateRow) {
      upsertRisk(out.risks, {
        severity: 'high',
        category: 'completion',
        title: 'No executors/administrators identified on grant',
        explanation: 'Could not identify the executors or administrators from the grant of probate.',
        evidence: [{ doc_filename: probateRow.filename }],
        recommended_action: 'Request a clearer copy of the grant or a sealed office copy.',
        blocks_completion: true,
      });
    }
  }

  // ── Local search / road status ───────────────────────────────────────
  const local = getDoc<{
    road_status?: string;
    enforcement_notices?: { summary?: string; date?: string }[];
    s106_obligations?: string[];
    cil_outstanding?: boolean;
    contaminated_land_register?: boolean;
    article_4_directions?: string[];
  }>(documents, 'local_search');
  const localRow = getDocRow(documents, 'local_search');
  if (local && localRow) {
    if (local.road_status === 'unadopted' || local.road_status === 'private') {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'legal',
        title: 'Property fronts an unadopted / private road',
        explanation:
          'Owners on an unadopted road typically share maintenance liability and there is no automatic public right to repair. Lenders may require an indemnity or repair fund.',
        evidence: [{ doc_filename: localRow.filename, page_ref: 'Highways' }],
        recommended_action: 'Confirm maintenance liability and check for any private road agreement.',
        blocks_completion: false,
      });
    }
    if ((local.enforcement_notices?.length ?? 0) > 0) {
      upsertRisk(out.risks, {
        severity: 'high',
        category: 'planning',
        title: 'Outstanding planning enforcement notice',
        explanation:
          'An outstanding enforcement notice runs with the land. The council can require unauthorised works to be undone at the buyer’s expense.',
        evidence: [{ doc_filename: localRow.filename, page_ref: 'Planning' }],
        recommended_action: 'Ask the seller for evidence the enforcement has been complied with, or budget for compliance.',
        blocks_completion: true,
      });
    }
    if ((local.s106_obligations?.length ?? 0) > 0) {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'financial',
        title: 'Section 106 obligations attached to title',
        explanation:
          'Section 106 obligations bind successors in title and can require ongoing payments or restrictions on use.',
        evidence: [{ doc_filename: localRow.filename, page_ref: 'Planning' }],
        recommended_action: 'Quantify the financial impact and any conditions before bidding.',
        blocks_completion: false,
      });
    }
    if (local.cil_outstanding === true) {
      upsertRisk(out.risks, {
        severity: 'high',
        category: 'financial',
        title: 'Community Infrastructure Levy outstanding',
        explanation: 'Unpaid CIL can become a charge on the land that the new owner inherits.',
        evidence: [{ doc_filename: localRow.filename, page_ref: 'CIL' }],
        recommended_action: 'Ask for the CIL liability notice and demand notice; require it to be discharged by the seller pre-completion.',
        blocks_completion: true,
      });
    }
    if (local.contaminated_land_register === true) {
      upsertRisk(out.risks, {
        severity: 'critical',
        category: 'environmental',
        title: 'Property on the local contaminated-land register',
        explanation:
          'Listing on the council’s contaminated-land register can trigger remediation liability under Part 2A of the Environmental Protection Act.',
        evidence: [{ doc_filename: localRow.filename }],
        recommended_action: 'Commission specialist environmental advice; budget remediation cost.',
        blocks_completion: false,
      });
    }
  }

  // ── Environmental search ─────────────────────────────────────────────
  const env = getDoc<{
    flood_risk_river?: string;
    flood_risk_surface?: string;
    flood_risk_coastal?: string;
    radon_affected_area?: boolean;
    contaminated_land_part_2a?: boolean;
    ground_stability_concerns?: string[];
  }>(documents, 'environmental_search');
  const envRow = getDocRow(documents, 'environmental_search');
  if (env && envRow) {
    const fr = [env.flood_risk_river, env.flood_risk_surface, env.flood_risk_coastal];
    if (fr.includes('high')) {
      upsertRisk(out.risks, {
        severity: 'high',
        category: 'environmental',
        title: 'High flood risk',
        explanation:
          'High flood risk impacts insurance premiums (Flood Re may not cover post-2009 builds), mortgageability, and resale.',
        evidence: [{ doc_filename: envRow.filename, page_ref: 'Flood' }],
        recommended_action: 'Get an indicative buildings-insurance quote before bidding; confirm Flood Re eligibility.',
        blocks_completion: false,
      });
    } else if (fr.includes('medium')) {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'environmental',
        title: 'Medium flood risk',
        explanation: 'Medium flood risk can elevate insurance premiums and may affect lender appetite.',
        evidence: [{ doc_filename: envRow.filename, page_ref: 'Flood' }],
        recommended_action: 'Confirm insurance quote prior to bidding.',
        blocks_completion: false,
      });
    }
    if (env.contaminated_land_part_2a === true) {
      upsertRisk(out.risks, {
        severity: 'critical',
        category: 'environmental',
        title: 'Part 2A contaminated land determination',
        explanation:
          'A Part 2A determination can require remediation by the current owner under the polluter-pays principle, with no statutory cap.',
        evidence: [{ doc_filename: envRow.filename }],
        recommended_action: 'Specialist environmental and legal advice essential.',
        blocks_completion: true,
      });
    }
    if ((env.ground_stability_concerns?.length ?? 0) > 0) {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'environmental',
        title: 'Ground stability concerns reported',
        explanation: 'Coal mining, sinkholes, or landslip history can affect insurance and structural integrity.',
        evidence: [{ doc_filename: envRow.filename }],
        recommended_action: 'Consider commissioning a structural engineer’s report.',
        blocks_completion: false,
      });
    }
  }

  // ── Drainage / water ─────────────────────────────────────────────────
  const drainage = getDoc<{
    mains_foul_drainage?: boolean;
    mains_water_supply?: boolean;
    public_sewer_within_3m_of_building?: boolean;
  }>(documents, 'drainage_water_search');
  const drainageRow = getDocRow(documents, 'drainage_water_search');
  if (drainage && drainageRow) {
    if (drainage.mains_foul_drainage === false) {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'physical',
        title: 'Not connected to mains drainage',
        explanation:
          'Septic tanks and cesspools have ongoing emptying costs and from 2020 cannot discharge directly to a watercourse without compliant treatment.',
        evidence: [{ doc_filename: drainageRow.filename }],
        recommended_action: 'Request compliance certificate or budget for replacement treatment plant.',
        blocks_completion: false,
      });
    }
    if (drainage.public_sewer_within_3m_of_building === true) {
      upsertRisk(out.risks, {
        severity: 'low',
        category: 'physical',
        title: 'Public sewer within 3m of the building',
        explanation:
          'Build-overs near public sewers may need a build-over agreement with the water authority. Affects future extensions.',
        evidence: [{ doc_filename: drainageRow.filename }],
        recommended_action: 'Note for any planned extension; check whether a build-over agreement exists.',
        blocks_completion: false,
      });
    }
  }

  // ── Special conditions of sale ───────────────────────────────────────
  const special = getDoc<{
    buyers_premium_gbp?: number;
    seller_legal_fees_payable_by_buyer_gbp?: number;
    additional_search_fees_payable_by_buyer_gbp?: number;
    completion_period_days?: number;
    indemnity_insurance_required?: string[];
    notable_conditions?: string[];
  }>(documents, 'special_conditions');
  const specialRow = getDocRow(documents, 'special_conditions');
  if (special && specialRow) {
    const totalExtra =
      (special.buyers_premium_gbp ?? 0) +
      (special.seller_legal_fees_payable_by_buyer_gbp ?? 0) +
      (special.additional_search_fees_payable_by_buyer_gbp ?? 0);
    if (totalExtra > 0) {
      upsertRisk(out.risks, {
        severity: totalExtra > 5000 ? 'high' : 'medium',
        category: 'financial',
        title: `Buyer-paid fees on top of hammer price (~£${Math.round(totalExtra)})`,
        explanation:
          'Auction packs frequently shift seller costs onto the buyer: buyer’s premium, seller legal fees, and search reimbursement. Factor into your maximum bid.',
        evidence: [{ doc_filename: specialRow.filename, page_ref: 'Special Conditions' }],
        recommended_action: 'Add the total to your hammer-price ceiling.',
        blocks_completion: false,
      });
    }
    if (typeof special.completion_period_days === 'number' && special.completion_period_days > 0 && special.completion_period_days < 28) {
      upsertRisk(out.risks, {
        severity: 'medium',
        category: 'completion',
        title: `Short completion period: ${special.completion_period_days} days`,
        explanation:
          'Standard auction completion is 28 days. Shorter periods make mortgage finance impractical — typically requires cash or bridging.',
        evidence: [{ doc_filename: specialRow.filename, page_ref: 'Special Conditions' }],
        recommended_action: 'Pre-arrange bridging finance or confirm cash funds before bidding.',
        blocks_completion: false,
      });
    }
    if ((special.indemnity_insurance_required?.length ?? 0) > 0) {
      upsertRisk(out.risks, {
        severity: 'low',
        category: 'legal',
        title: 'Indemnity insurance required by special conditions',
        explanation: 'Seller is requiring the buyer to take out specific indemnity policies.',
        evidence: [{ doc_filename: specialRow.filename }],
        recommended_action: 'Get quotes for the listed indemnity policies (usually £75–£500 each).',
        blocks_completion: false,
      });
    }
  }

  // ── EPC vs title address consistency ────────────────────────────────
  if (epc?.address && titleReg?.address) {
    const matches = norm(epc.address).includes(norm(titleReg.address).split(' ').slice(-1)[0] ?? '');
    out.cross_document_consistency.epc_address_matches_title = matches;
    if (!matches) {
      const note = `EPC address "${epc.address}" does not appear to match title address "${titleReg.address}".`;
      out.cross_document_consistency.notes = [...(out.cross_document_consistency.notes ?? []), note];
    }
  }

  // ── Recompute overall_risk from highest severity in the rule layer ───
  let highestRank = OVERALL_RANK[out.overall_risk ?? 'low'] ?? 0;
  for (const r of out.risks) {
    if (r.severity === 'critical') highestRank = Math.max(highestRank, 3);
    else if (r.severity === 'high') highestRank = Math.max(highestRank, 2);
    else if (r.severity === 'medium') highestRank = Math.max(highestRank, 1);
  }
  out.overall_risk = RANK_TO_OVERALL[highestRank] ?? out.overall_risk ?? 'low';

  // ── Sort risks by severity desc, then keep model-supplied order ──────
  out.risks.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);

  return out;
}

/**
 * If a similar finding already exists from the model, merge severity + evidence
 * rather than duplicating. Match heuristic: same category and overlapping title words.
 */
function upsertRisk(risks: Risk[], add: Risk): void {
  const addKey = norm(add.title);
  const existing = risks.find((r) => {
    if (r.category !== add.category) return false;
    const rKey = norm(r.title);
    // Same category + any meaningful token overlap → treat as the same finding
    // and elevate severity rather than duplicating.
    return tokenOverlap(addKey, rKey) >= 1;
  });
  if (!existing) {
    risks.push(add);
    return;
  }
  existing.severity = bumpSeverity(existing.severity, add.severity);
  existing.blocks_completion = existing.blocks_completion || add.blocks_completion;
  if (add.evidence.length > 0 && existing.evidence.length === 0) {
    existing.evidence = add.evidence;
  }
  if (!existing.recommended_action && add.recommended_action) {
    existing.recommended_action = add.recommended_action;
  }
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((w) => w.length > 3));
  const tb = new Set(b.split(' ').filter((w) => w.length > 3));
  let n = 0;
  for (const w of ta) if (tb.has(w)) n++;
  return n;
}
