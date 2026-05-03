export const DOC_TYPES = [
  'title_register',
  'title_plan',
  'local_search',
  'environmental_search',
  'drainage_water_search',
  'epc',
  'ta6_property_info',
  'ta10_fittings_contents',
  'historic_conveyance',
  'grant_of_probate',
  'special_conditions',
  'contents_list',
  'other',
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  title_register: 'Land Registry Official Copy of Register (OC1)',
  title_plan: 'Title Plan',
  local_search: 'Local Authority Search (LLC1/CON29)',
  environmental_search: 'Environmental Search',
  drainage_water_search: 'Drainage & Water Search',
  epc: 'Energy Performance Certificate',
  ta6_property_info: 'TA6 Property Information Form',
  ta10_fittings_contents: 'TA10 Fittings & Contents Form',
  historic_conveyance: 'Historic Conveyance / Transfer',
  grant_of_probate: 'Grant of Probate',
  special_conditions: 'Special Conditions of Sale',
  contents_list: 'Pack Contents List',
  other: 'Other',
};

export const DOC_TYPE_HINTS: Record<DocType, string> = {
  title_register:
    'Land Registry "Official Copy of Register" — three sections (Property, Proprietorship, Charges). Lists registered proprietor, class of title, restrictive covenants, charges, and easements. Title number on every page.',
  title_plan:
    'Land Registry Title Plan — a coloured boundary plan with red edging showing the registered extent of the title.',
  local_search:
    'CON29 / LLC1 Local Authority Search — planning history, enforcement notices, road status, conservation area, listed building, contaminated land register, financial charges (S106/CIL).',
  environmental_search:
    'Environmental Search (Groundsure / Landmark / Envirosearch) — flood risk, ground stability, radon zone, contaminated land Part 2A, nearby industrial/landfill sites.',
  drainage_water_search:
    'Drainage & Water Search (CON29DW) — mains drainage, water supply, public sewer location, surface water disposal.',
  epc: 'Energy Performance Certificate — current and potential energy efficiency band (A–G), score, recommendations.',
  ta6_property_info:
    'TA6 Property Information Form — Law Society standard form filled in by the seller. Disputes, alterations, building regs, planning consents, guarantees, parking, knotweed, flooding history.',
  ta10_fittings_contents:
    'TA10 Fittings & Contents Form — Law Society standard form listing what is included/excluded with the sale.',
  historic_conveyance:
    'Old Conveyance / Transfer / Indenture — pre-Land-Registry dated deed (often 1900s) imposing covenants. Frequently scanned/photocopied.',
  grant_of_probate:
    'Grant of Probate or Letters of Administration — confirms executors’/administrators’ authority to sell a deceased’s property.',
  special_conditions:
    'Special Conditions of Sale (auction-pack contract). Buyer’s premium, seller fees payable by buyer, completion period, additional searches, VAT election, indemnity insurance requirements.',
  contents_list:
    'Auctioneer’s pack index / contents list — short bullet list of every document in the pack.',
  other: 'Anything that does not fit the other types — broker correspondence, photographs, marketing pages, etc.',
};
