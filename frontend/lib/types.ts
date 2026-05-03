export type JobStatus =
  | 'queued'
  | 'uploaded'
  | 'extracting'
  | 'classifying'
  | 'analyzing'
  | 'synthesizing'
  | 'done'
  | 'failed';

export type OverallRisk = 'low' | 'medium' | 'high' | 'critical';

export type JobSummary = {
  id: string;
  status: JobStatus;
  zip_filename: string;
  property_label: string | null;
  overall_risk: OverallRisk | null;
  created_at: string;
  updated_at: string;
};

export type JobDocument = {
  id: string;
  filename: string;
  doc_type: string | null;
  extraction: unknown | null;
  created_at: string;
};

export type JobDetail = {
  job: {
    id: string;
    status: JobStatus;
    status_detail: string | null;
    report: SynthesisReport | null;
    error: string | null;
    zip_filename: string;
    property_label: string | null;
    created_at: string;
    updated_at: string;
  };
  documents: JobDocument[];
};

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Risk = {
  severity: RiskSeverity;
  category: string;
  title: string;
  explanation: string;
  evidence: { doc_filename: string; page_ref?: string; quote?: string }[];
  recommended_action: string;
  blocks_completion: boolean;
};

export type SynthesisReport = {
  property_summary: {
    address?: string;
    tenure?: string;
    registered_owners?: string[];
    lot_id?: string;
  };
  overall_risk: 'low' | 'medium' | 'high' | 'critical';
  headline_findings: string[];
  risks: Risk[];
  cross_document_consistency: {
    executor_matches_proprietor?: boolean;
    epc_address_matches_title?: boolean;
    notes?: string[];
  };
  buyer_questions_for_solicitor: string[];
};

export type CreateJobResponse = {
  jobId: string;
  storagePath: string;
  uploadUrl: string;
  uploadToken: string;
  bucket: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};
