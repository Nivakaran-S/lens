import { Type, type Schema } from '@google/genai';
import { DOC_TYPES, type DocType } from '../domain/doc-types.js';

// ── Document classification (single doc → DocType) ─────────────────────
export const classifySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    doc_type: {
      type: Type.STRING,
      enum: [...DOC_TYPES],
      description: 'The single best-fit document type for this PDF.',
    },
    confidence: {
      type: Type.NUMBER,
      description: 'Self-reported 0–1 confidence in the classification.',
    },
    reason: {
      type: Type.STRING,
      description: 'One short sentence explaining the classification (e.g. "Title number visible top-right + Proprietorship Register heading").',
    },
  },
  required: ['doc_type', 'confidence', 'reason'],
  propertyOrdering: ['doc_type', 'confidence', 'reason'],
};

const evidenceItem: Schema = {
  type: Type.OBJECT,
  properties: {
    page_ref: { type: Type.STRING, description: 'Page number or section, e.g. "p.3" or "Charges Register entry 2".' },
    quote: { type: Type.STRING, description: 'Short verbatim quote from the document (≤200 chars).' },
  },
  required: ['page_ref', 'quote'],
  propertyOrdering: ['page_ref', 'quote'],
};

// ── Per-doc-type extraction schemas ────────────────────────────────────
// Keep schemas conservative: type/properties/required/enum/items/description/propertyOrdering only.
// Avoid oneOf, anyOf, additionalProperties — they trip the SDK validator.

const titleRegisterSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title_number: { type: Type.STRING, description: 'e.g. "NT247893".' },
    address: { type: Type.STRING },
    tenure: { type: Type.STRING, enum: ['freehold', 'leasehold', 'commonhold', 'unknown'] },
    class_of_title: {
      type: Type.STRING,
      enum: ['absolute', 'possessory', 'qualified', 'good_leasehold', 'unknown'],
    },
    registered_proprietors: {
      type: Type.ARRAY,
      description: 'Names exactly as on the proprietorship register.',
      items: { type: Type.STRING },
    },
    charges: {
      type: Type.ARRAY,
      description: 'Entries on the Charges Register: mortgages, notices, agreements.',
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          beneficiary: { type: Type.STRING, description: 'Lender or party who benefits from the entry.' },
          dated: { type: Type.STRING, description: 'Date in ISO if known.' },
        },
        required: ['description'],
        propertyOrdering: ['description', 'beneficiary', 'dated'],
      },
    },
    restrictive_covenants: {
      type: Type.ARRAY,
      description: 'Verbatim covenant text from the property/charges register or referenced deeds.',
      items: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Plain-English one-liner.' },
          text: { type: Type.STRING, description: 'Verbatim text, may be long.' },
          source_doc: { type: Type.STRING, description: 'e.g. "imposed by 1989 Conveyance".' },
        },
        required: ['summary'],
        propertyOrdering: ['summary', 'text', 'source_doc'],
      },
    },
    easements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['summary'],
        propertyOrdering: ['summary', 'text'],
      },
    },
    proprietorship_restrictions: {
      type: Type.ARRAY,
      description: 'Restrictions on the proprietorship register, e.g. Form A, lender-consent restrictions.',
      items: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['summary'],
        propertyOrdering: ['summary', 'text'],
      },
    },
  },
  required: ['title_number', 'class_of_title', 'registered_proprietors', 'charges', 'restrictive_covenants'],
  propertyOrdering: [
    'title_number',
    'address',
    'tenure',
    'class_of_title',
    'registered_proprietors',
    'charges',
    'restrictive_covenants',
    'easements',
    'proprietorship_restrictions',
  ],
};

const epcSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    address: { type: Type.STRING },
    current_band: { type: Type.STRING, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'unknown'] },
    current_score: { type: Type.NUMBER, description: 'Current SAP/SBEM score (0–100).' },
    potential_band: { type: Type.STRING, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'unknown'] },
    potential_score: { type: Type.NUMBER },
    valid_until: { type: Type.STRING, description: 'ISO date if shown on certificate.' },
    property_type: { type: Type.STRING, description: 'e.g. "Mid-terrace house", "Flat".' },
    floor_area_sqm: { type: Type.NUMBER },
  },
  required: ['current_band'],
  propertyOrdering: [
    'address',
    'current_band',
    'current_score',
    'potential_band',
    'potential_score',
    'valid_until',
    'property_type',
    'floor_area_sqm',
  ],
};

const localSearchSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    address: { type: Type.STRING },
    road_status: {
      type: Type.STRING,
      enum: ['adopted', 'unadopted', 'partially_adopted', 'private', 'unknown'],
    },
    conservation_area: { type: Type.BOOLEAN },
    listed_building: { type: Type.BOOLEAN },
    article_4_directions: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'Description of the Article 4 direction.' },
    },
    contaminated_land_register: { type: Type.BOOLEAN, description: 'Is the property on the local authority’s contaminated land register?' },
    enforcement_notices: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          date: { type: Type.STRING },
        },
        required: ['summary'],
        propertyOrdering: ['summary', 'date'],
      },
    },
    planning_history: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ref: { type: Type.STRING, description: 'Application reference, if shown.' },
          summary: { type: Type.STRING },
          decision: { type: Type.STRING, enum: ['approved', 'refused', 'pending', 'withdrawn', 'unknown'] },
          date: { type: Type.STRING },
        },
        required: ['summary'],
        propertyOrdering: ['ref', 'summary', 'decision', 'date'],
      },
    },
    s106_obligations: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'One-line summary of each Section 106 obligation.' },
    },
    cil_outstanding: { type: Type.BOOLEAN, description: 'Is Community Infrastructure Levy outstanding?' },
  },
  required: ['road_status'],
  propertyOrdering: [
    'address',
    'road_status',
    'conservation_area',
    'listed_building',
    'article_4_directions',
    'contaminated_land_register',
    'enforcement_notices',
    'planning_history',
    's106_obligations',
    'cil_outstanding',
  ],
};

const environmentalSearchSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    flood_risk_river: { type: Type.STRING, enum: ['none', 'low', 'medium', 'high', 'unknown'] },
    flood_risk_surface: { type: Type.STRING, enum: ['none', 'low', 'medium', 'high', 'unknown'] },
    flood_risk_coastal: { type: Type.STRING, enum: ['none', 'low', 'medium', 'high', 'unknown'] },
    radon_affected_area: { type: Type.BOOLEAN },
    radon_pct: { type: Type.NUMBER, description: 'Reported probability that radon protection is required, if shown.' },
    contaminated_land_part_2a: { type: Type.BOOLEAN, description: 'Is there a Part 2A contaminated land determination affecting the site?' },
    ground_stability_concerns: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'e.g. "historical coal mining within 250m".' },
    },
    nearby_industrial_or_landfill_sites: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          distance_m: { type: Type.NUMBER },
        },
        required: ['summary'],
        propertyOrdering: ['summary', 'distance_m'],
      },
    },
  },
  required: ['flood_risk_river', 'flood_risk_surface'],
  propertyOrdering: [
    'flood_risk_river',
    'flood_risk_surface',
    'flood_risk_coastal',
    'radon_affected_area',
    'radon_pct',
    'contaminated_land_part_2a',
    'ground_stability_concerns',
    'nearby_industrial_or_landfill_sites',
  ],
};

const drainageWaterSearchSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    mains_foul_drainage: { type: Type.BOOLEAN },
    mains_water_supply: { type: Type.BOOLEAN },
    public_sewer_within_boundary: { type: Type.BOOLEAN },
    public_sewer_within_3m_of_building: { type: Type.BOOLEAN },
    surface_water_disposal: {
      type: Type.STRING,
      enum: ['mains', 'soakaway', 'private', 'unknown'],
    },
    metered: { type: Type.BOOLEAN },
  },
  required: ['mains_foul_drainage', 'mains_water_supply'],
  propertyOrdering: [
    'mains_foul_drainage',
    'mains_water_supply',
    'public_sewer_within_boundary',
    'public_sewer_within_3m_of_building',
    'surface_water_disposal',
    'metered',
  ],
};

const ta6Schema: Schema = {
  type: Type.OBJECT,
  properties: {
    address: { type: Type.STRING },
    disputes_or_complaints: { type: Type.BOOLEAN },
    disputes_detail: { type: Type.STRING },
    alterations_done: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    building_regs_provided: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'List of works for which Building Regs certificates have been provided.' },
    },
    planning_consents_provided: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    japanese_knotweed: { type: Type.STRING, enum: ['yes', 'no', 'not_known', 'unknown'] },
    flooding_history: { type: Type.BOOLEAN },
    parking_arrangement: { type: Type.STRING, description: 'e.g. "off-street parking", "permit zone CPZ B".' },
    guarantees_provided: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'e.g. "FENSA windows 2014", "damp-proof course Wykamol".' },
    },
  },
  required: [],
  propertyOrdering: [
    'address',
    'disputes_or_complaints',
    'disputes_detail',
    'alterations_done',
    'building_regs_provided',
    'planning_consents_provided',
    'japanese_knotweed',
    'flooding_history',
    'parking_arrangement',
    'guarantees_provided',
  ],
};

const ta10Schema: Schema = {
  type: Type.OBJECT,
  properties: {
    included: { type: Type.ARRAY, items: { type: Type.STRING } },
    excluded: { type: Type.ARRAY, items: { type: Type.STRING } },
    extras_for_purchase: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          price_gbp: { type: Type.NUMBER },
        },
        required: ['item'],
        propertyOrdering: ['item', 'price_gbp'],
      },
    },
  },
  required: ['included', 'excluded'],
  propertyOrdering: ['included', 'excluded', 'extras_for_purchase'],
};

const historicConveyanceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    date: { type: Type.STRING, description: 'ISO date if legible.' },
    parties: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'e.g. "Vendor: John Smith", "Purchaser: Jane Doe".' },
    },
    notable_covenants_imposed: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['summary'],
        propertyOrdering: ['summary', 'text'],
      },
    },
  },
  required: [],
  propertyOrdering: ['date', 'parties', 'notable_covenants_imposed'],
};

const grantOfProbateSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    grant_type: { type: Type.STRING, enum: ['probate', 'letters_of_administration', 'unknown'] },
    deceased_name: { type: Type.STRING },
    date_of_death: { type: Type.STRING },
    date_of_grant: { type: Type.STRING },
    executors_or_administrators: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    estate_value_gbp: { type: Type.NUMBER },
  },
  required: ['grant_type', 'executors_or_administrators'],
  propertyOrdering: [
    'grant_type',
    'deceased_name',
    'date_of_death',
    'date_of_grant',
    'executors_or_administrators',
    'estate_value_gbp',
  ],
};

const specialConditionsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    buyers_premium_gbp: { type: Type.NUMBER, description: 'Buyer’s premium fee payable to auctioneer, in GBP.' },
    seller_legal_fees_payable_by_buyer_gbp: { type: Type.NUMBER },
    additional_search_fees_payable_by_buyer_gbp: { type: Type.NUMBER },
    completion_period_days: { type: Type.INTEGER, description: 'e.g. 28, 14, 56.' },
    vat_election: { type: Type.BOOLEAN, description: 'Has the seller opted to charge VAT on the sale price?' },
    indemnity_insurance_required: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'e.g. "restrictive covenant indemnity", "lack of building regs indemnity".' },
    },
    notable_conditions: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'Plain-English summary of any unusual or onerous clause.' },
    },
  },
  required: [],
  propertyOrdering: [
    'buyers_premium_gbp',
    'seller_legal_fees_payable_by_buyer_gbp',
    'additional_search_fees_payable_by_buyer_gbp',
    'completion_period_days',
    'vat_election',
    'indemnity_insurance_required',
    'notable_conditions',
  ],
};

const titlePlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title_number: { type: Type.STRING },
    notable_observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING, description: 'e.g. "T-marks on northern boundary indicate ownership", "extent appears to include shared driveway".' },
    },
  },
  required: [],
  propertyOrdering: ['title_number', 'notable_observations'],
};

const contentsListSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    listed_documents: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['listed_documents'],
  propertyOrdering: ['listed_documents'],
};

const otherSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: 'One-paragraph summary of what this document is and contains.' },
  },
  required: ['summary'],
  propertyOrdering: ['summary'],
};

export const PER_DOC_SCHEMAS: Record<DocType, Schema> = {
  title_register: titleRegisterSchema,
  title_plan: titlePlanSchema,
  local_search: localSearchSchema,
  environmental_search: environmentalSearchSchema,
  drainage_water_search: drainageWaterSearchSchema,
  epc: epcSchema,
  ta6_property_info: ta6Schema,
  ta10_fittings_contents: ta10Schema,
  historic_conveyance: historicConveyanceSchema,
  grant_of_probate: grantOfProbateSchema,
  special_conditions: specialConditionsSchema,
  contents_list: contentsListSchema,
  other: otherSchema,
};

// ── Cross-document synthesis ───────────────────────────────────────────
export const synthesisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    property_summary: {
      type: Type.OBJECT,
      properties: {
        address: { type: Type.STRING },
        tenure: { type: Type.STRING, enum: ['freehold', 'leasehold', 'commonhold', 'unknown'] },
        registered_owners: { type: Type.ARRAY, items: { type: Type.STRING } },
        title_number: { type: Type.STRING },
        lot_id: { type: Type.STRING, description: 'Auction lot reference if visible.' },
      },
      required: [],
      propertyOrdering: ['address', 'tenure', 'registered_owners', 'title_number', 'lot_id'],
    },
    overall_risk: { type: Type.STRING, enum: ['low', 'medium', 'high', 'critical'] },
    headline_findings: {
      type: Type.ARRAY,
      description: '3–5 short sentences a buyer should read first.',
      items: { type: Type.STRING },
    },
    risks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          severity: { type: Type.STRING, enum: ['critical', 'high', 'medium', 'low', 'info'] },
          category: {
            type: Type.STRING,
            enum: ['title', 'legal', 'physical', 'planning', 'environmental', 'financial', 'completion'],
          },
          title: { type: Type.STRING, description: 'Short headline.' },
          explanation: { type: Type.STRING, description: 'Plain-English explanation, 1–3 sentences.' },
          evidence: { type: Type.ARRAY, items: evidenceItem },
          recommended_action: {
            type: Type.STRING,
            description: 'Concrete next step (e.g. "Insure via restrictive-covenant indemnity (~£150)").',
          },
          blocks_completion: { type: Type.BOOLEAN },
        },
        required: ['severity', 'category', 'title', 'explanation', 'recommended_action', 'blocks_completion'],
        propertyOrdering: [
          'severity',
          'category',
          'title',
          'explanation',
          'evidence',
          'recommended_action',
          'blocks_completion',
        ],
      },
    },
    cross_document_consistency: {
      type: Type.OBJECT,
      properties: {
        executor_matches_proprietor: { type: Type.BOOLEAN },
        epc_address_matches_title: { type: Type.BOOLEAN },
        notes: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [],
      propertyOrdering: ['executor_matches_proprietor', 'epc_address_matches_title', 'notes'],
    },
    buyer_questions_for_solicitor: {
      type: Type.ARRAY,
      description: '5–10 specific questions to forward to the buyer’s conveyancer.',
      items: { type: Type.STRING },
    },
  },
  required: ['property_summary', 'overall_risk', 'headline_findings', 'risks', 'buyer_questions_for_solicitor'],
  propertyOrdering: [
    'property_summary',
    'overall_risk',
    'headline_findings',
    'risks',
    'cross_document_consistency',
    'buyer_questions_for_solicitor',
  ],
};
