import { describe, expect, it } from 'vitest';
import { applyRiskRules, type Report } from './risk-rules.js';
import type { DocumentRow } from '../db/jobs.js';

function emptyReport(): Report {
  return {
    property_summary: {},
    overall_risk: 'low',
    headline_findings: [],
    risks: [],
    cross_document_consistency: {},
    buyer_questions_for_solicitor: [],
  };
}

function doc(overrides: Partial<DocumentRow> & { doc_type: string; extraction: unknown }): DocumentRow {
  return {
    id: `doc-${Math.random()}`,
    job_id: 'job-1',
    filename: `${overrides.doc_type}.pdf`,
    storage_key: `path/${overrides.doc_type}.pdf`,
    size_bytes: 1000,
    gemini_file_uri: null,
    gemini_file_uploaded_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('applyRiskRules', () => {
  it('flags EPC band F as critical MEES non-compliance', () => {
    const docs = [doc({ doc_type: 'epc', extraction: { current_band: 'F', address: '1 The Lane' } })];
    const out = applyRiskRules(emptyReport(), docs);
    const epcRisk = out.risks.find((r) => r.title.includes('EPC band F'));
    expect(epcRisk).toBeDefined();
    expect(epcRisk!.severity).toBe('critical');
    expect(out.overall_risk).toBe('critical');
  });

  it('flags EPC band G as critical MEES non-compliance', () => {
    const docs = [doc({ doc_type: 'epc', extraction: { current_band: 'G' } })];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.find((r) => r.severity === 'critical' && r.category === 'legal')).toBeDefined();
  });

  it('flags EPC band E as MEES-2028 risk (medium)', () => {
    const docs = [doc({ doc_type: 'epc', extraction: { current_band: 'E' } })];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('EPC band E'));
    expect(r?.severity).toBe('medium');
  });

  it('does not flag EPC band C', () => {
    const docs = [doc({ doc_type: 'epc', extraction: { current_band: 'C' } })];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.filter((r) => r.title.toLowerCase().includes('epc'))).toHaveLength(0);
  });

  it('flags non-absolute class of title as high', () => {
    const docs = [
      doc({ doc_type: 'title_register', extraction: { title_number: 'NT1', class_of_title: 'possessory' } }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('possessory'));
    expect(r?.severity).toBe('high');
  });

  it('does not flag absolute class of title', () => {
    const docs = [
      doc({ doc_type: 'title_register', extraction: { title_number: 'NT1', class_of_title: 'absolute' } }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.filter((r) => r.title.toLowerCase().includes('class of title'))).toHaveLength(0);
  });

  it('flags restrictive covenants and includes evidence quote', () => {
    const docs = [
      doc({
        doc_type: 'title_register',
        extraction: {
          title_number: 'NT1',
          class_of_title: 'absolute',
          restrictive_covenants: [
            { summary: 'No business use', text: 'Not to use the said property for any business purpose...' },
          ],
        },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('restrictive covenant'));
    expect(r).toBeDefined();
    expect(r!.severity).toBe('medium');
    expect(r!.evidence[0]?.quote).toContain('business');
  });

  it('flags probate executor / proprietor mismatch as critical completion blocker', () => {
    const docs = [
      doc({
        doc_type: 'title_register',
        extraction: {
          title_number: 'NT1',
          class_of_title: 'absolute',
          registered_proprietors: ['Margaret Thompson'],
        },
      }),
      doc({
        doc_type: 'grant_of_probate',
        extraction: {
          deceased_name: 'Robert Smith',
          executors_or_administrators: ['Jane Smith'],
        },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('Probate'));
    expect(r).toBeDefined();
    expect(r!.severity).toBe('critical');
    expect(r!.blocks_completion).toBe(true);
    expect(out.cross_document_consistency.executor_matches_proprietor).toBe(false);
    expect(out.overall_risk).toBe('critical');
  });

  it('does NOT flag mismatch when names match', () => {
    const docs = [
      doc({
        doc_type: 'title_register',
        extraction: {
          title_number: 'NT1',
          class_of_title: 'absolute',
          registered_proprietors: ['Robert James Smith'],
        },
      }),
      doc({
        doc_type: 'grant_of_probate',
        extraction: {
          deceased_name: 'Robert James Smith',
          executors_or_administrators: ['Jane Smith'],
        },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.cross_document_consistency.executor_matches_proprietor).toBe(true);
    expect(out.risks.find((r) => r.title.includes('does not match'))).toBeUndefined();
  });

  it('flags unadopted road from local search', () => {
    const docs = [doc({ doc_type: 'local_search', extraction: { road_status: 'unadopted' } })];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.find((r) => r.title.toLowerCase().includes('unadopted'))).toBeDefined();
  });

  it('flags outstanding CIL as high financial completion risk', () => {
    const docs = [
      doc({ doc_type: 'local_search', extraction: { road_status: 'adopted', cil_outstanding: true } }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('CIL') || x.title.includes('Community Infrastructure'));
    expect(r?.severity).toBe('high');
    expect(r?.blocks_completion).toBe(true);
  });

  it('flags contaminated land register entry as critical environmental', () => {
    const docs = [
      doc({ doc_type: 'local_search', extraction: { road_status: 'adopted', contaminated_land_register: true } }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.find((r) => r.severity === 'critical' && r.category === 'environmental')).toBeDefined();
  });

  it('flags Part 2A determination as critical and completion-blocking', () => {
    const docs = [
      doc({
        doc_type: 'environmental_search',
        extraction: { flood_risk_river: 'low', flood_risk_surface: 'low', contaminated_land_part_2a: true },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('Part 2A'));
    expect(r?.severity).toBe('critical');
    expect(r?.blocks_completion).toBe(true);
  });

  it('flags high flood risk', () => {
    const docs = [
      doc({
        doc_type: 'environmental_search',
        extraction: { flood_risk_river: 'high', flood_risk_surface: 'low' },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('flood'));
    expect(r?.severity).toBe('high');
  });

  it('flags septic-tank-only drainage', () => {
    const docs = [
      doc({
        doc_type: 'drainage_water_search',
        extraction: { mains_foul_drainage: false, mains_water_supply: true },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.find((r) => r.title.includes('mains drainage'))).toBeDefined();
  });

  it('flags short completion period', () => {
    const docs = [
      doc({
        doc_type: 'special_conditions',
        extraction: { completion_period_days: 14 },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.risks.find((r) => r.title.toLowerCase().includes('completion period'))).toBeDefined();
  });

  it('flags large buyer-paid fees as high financial', () => {
    const docs = [
      doc({
        doc_type: 'special_conditions',
        extraction: {
          buyers_premium_gbp: 3000,
          seller_legal_fees_payable_by_buyer_gbp: 1500,
          additional_search_fees_payable_by_buyer_gbp: 800,
        },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const r = out.risks.find((x) => x.title.includes('Buyer-paid fees'));
    expect(r?.severity).toBe('high');
  });

  it('elevates overall_risk to highest severity present', () => {
    const docs = [
      doc({
        doc_type: 'special_conditions',
        extraction: { completion_period_days: 14 }, // medium
      }),
      doc({ doc_type: 'epc', extraction: { current_band: 'F' } }), // critical
    ];
    const out = applyRiskRules({ ...emptyReport(), overall_risk: 'low' }, docs);
    expect(out.overall_risk).toBe('critical');
  });

  it('sorts risks by severity descending', () => {
    const docs = [
      doc({ doc_type: 'epc', extraction: { current_band: 'F' } }), // critical
      doc({ doc_type: 'local_search', extraction: { road_status: 'unadopted' } }), // medium
    ];
    const out = applyRiskRules(emptyReport(), docs);
    const severities = out.risks.map((r) => r.severity);
    const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    for (let i = 1; i < severities.length; i++) {
      expect(order[severities[i]!]!).toBeLessThanOrEqual(order[severities[i - 1]!]!);
    }
  });

  it('upserts: bumps severity instead of duplicating when model and rules overlap', () => {
    const seedReport: Report = {
      ...emptyReport(),
      risks: [
        {
          severity: 'low',
          category: 'legal',
          title: 'EPC band F noted',
          explanation: 'EPC F is suboptimal.',
          evidence: [],
          recommended_action: 'Consider retrofit.',
          blocks_completion: false,
        },
      ],
    };
    const docs = [doc({ doc_type: 'epc', extraction: { current_band: 'F' } })];
    const out = applyRiskRules(seedReport, docs);
    const epcRisks = out.risks.filter((r) => r.title.toLowerCase().includes('epc band f'));
    expect(epcRisks).toHaveLength(1);
    expect(epcRisks[0]!.severity).toBe('critical');
  });

  it('back-fills property summary from title register when missing', () => {
    const docs = [
      doc({
        doc_type: 'title_register',
        extraction: {
          title_number: 'NT247893',
          class_of_title: 'absolute',
          tenure: 'freehold',
          address: 'Lot, Mansfield NG19 6HN',
          registered_proprietors: ['Jane Doe'],
        },
      }),
    ];
    const out = applyRiskRules(emptyReport(), docs);
    expect(out.property_summary.title_number).toBe('NT247893');
    expect(out.property_summary.tenure).toBe('freehold');
    expect(out.property_summary.registered_owners).toEqual(['Jane Doe']);
  });
});
