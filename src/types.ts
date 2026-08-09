/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MADAM_LIM_REVIEW_PASSCODE = "1111";

export enum ExtractionStatus {
  QUEUED = "QUEUED",
  STARTING = "STARTING",
  PROCESSING = "PROCESSING",
  WAITING_FOR_RATE_LIMIT = "WAITING_FOR_RATE_LIMIT",
  PAUSED_BY_QUOTA = "PAUSED_BY_QUOTA",
  PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  // Keeping legacy for backward compatibility/internal steps if needed, 
  // but we will primarily use the above for UI.
  UPLOADED = "UPLOADED",
  COUNTING_PAGES = "COUNTING_PAGES",
  CREATING_CHUNKS = "CREATING_CHUNKS",
  EXTRACTING_CHUNKS = "EXTRACTING_CHUNKS",
  VALIDATING_CHUNKS = "VALIDATING_CHUNKS",
  COMMITTING_RECORDS = "COMMITTING_RECORDS",
  PAUSED_QUOTA = "PAUSED_QUOTA",
  MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE",
  SKIPPED = "SKIPPED",
  EXTRACTING = "EXTRACTING", 
  VALIDATING = "VALIDATING",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
  EXTRACTED = "EXTRACTED",
  INCOMPLETE_RESULT = "INCOMPLETE_RESULT",
  REPROCESS_REQUIRED = "REPROCESS_REQUIRED",
  TIMED_OUT = "TIMED_OUT",
  WAITING_TO_RETRY = "WAITING_TO_RETRY"
}

export enum MatchStatus {
  CLEAN_MATCH = "CLEAN MATCH",
  CLEAN_MATCH_FULLY_VERIFIED = "CLEAN_MATCH_FULLY_VERIFIED",
  CLEAN_MATCH_HEADER_VERIFIED = "CLEAN_MATCH_HEADER_VERIFIED",
  PASS_WITH_LIMITATION = "PASS WITH LIMITATION",
  QUANTITY_MISMATCH = "QUANTITY MISMATCH",
  PRICE_MISMATCH = "PRICE MISMATCH",
  CONDITION_ISSUE = "CONDITION ISSUE",
  POSSIBLE_DUPLICATE = "POSSIBLE DUPLICATE",
  NO_PO_FOUND = "NO PO FOUND",
  NO_GRN_FOUND = "NO GRN FOUND",
  SUPPLIER_MISMATCH = "SUPPLIER MISMATCH",
  MULTIPLE_ISSUES = "MULTIPLE ISSUES",
  INVALID_INVOICE_DATA = "INVALID INVOICE DATA",
  // Backward compatibility aliases
  MATCHED = "CLEAN MATCH",
  REVIEW_REQUIRED = "REVIEW REQUIRED",
  APPROVED_EXCEPTION = "APPROVED EXCEPTION",
  REJECTED = "REJECTED",
  FAIL = "FAIL",
}

export enum CheckStatus {
  PASS = "PASS",
  FAIL = "FAIL",
  NOT_TESTED = "NOT_TESTED",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
}

export enum ApprovalStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  ON_HOLD = "ON_HOLD",
  NOT_HELD = "NOT_HELD",
  RESOLVED = "RESOLVED",
  APPROVED_AFTER_REVIEW = "APPROVED_AFTER_REVIEW",
}

export interface SupportingEvidence {
  evidenceType: "SUPPLEMENTARY_GRN" | "DELIVERY_NOTE" | "OTHER";
  filename: string;
  fileDataUrl?: string;
  fileType?: string;
  uploadedAt: string;
  uploadedBy: string;
  grnNumber?: string;
  receivedDate?: string;
  additionalQuantityReceived?: number;
  condition?: string;
  notes?: string;
}

export enum UserRole {
  ACCOUNTS_EXECUTIVE = "ACCOUNTS_EXECUTIVE",
  PROCUREMENT_STAFF = "PROCUREMENT_STAFF",
  WAREHOUSE_STAFF = "WAREHOUSE_STAFF",
  ACCOUNTS_MANAGER = "ACCOUNTS_MANAGER",
  SYSTEM_ADMIN = "SYSTEM_ADMIN",
}

export interface UserSession {
  session_id: string;
  user_name: string;
  user_role: UserRole;
  staff_id: string;
  signed_in_at: string;
  last_activity_at: string;
  is_authenticated: boolean;
  status: "ACTIVE" | "EXPIRED";
}

export interface App2AuditEntry {
  audit_id: string;
  timestamp: string;
  session_id: string;
  user_name: string;
  user_role: UserRole;
  step_number: number | null;
  action_type: string;
  document_type: string | null;
  record_id: string | null;
  invoice_number: string | null;
  po_number: string | null;
  grn_number: string | null;
  supplier_name: string | null;
  source_filename: string | null;
  source_page_number: number | null;
  previous_status: string | null;
  new_status: string | null;
  field_changed: string | null;
  original_value: any;
  new_value: any;
  matched_fields: string[] | null;
  mismatch_fields: string[] | null;
  assigned_department: string | null;
  decision: string | null;
  decision_reason: string | null;
  related_report_id: string | null;
  previous_entry_hash: string;
  entry_hash: string;
  metadata?: any;
}

export interface GeneratedReport {
  report_id: string;
  report_type: string;
  generated_at: string;
  generated_by: string;
  user_role: UserRole;
  file_name: string;
  related_record_ids: string[];
  filters_used: any;
  record_count: number;
  file_size: string;
  report_status: string;
  report_hash: string;
  download_reference: string;
  download_count: number;
  last_downloaded_at?: string;
  archived_status: boolean;
}

export interface ExternalMessageDraft {
  message_id: string;
  generated_at: string;
  generated_by: string;
  approved_by?: string;
  approved_at?: string;
  copied_at?: string;
  approval_status: "DRAFT" | "PENDING" | "APPROVED" | "COPIED";
  recipient: string;
  recipient_department: string;
  channel: "EMAIL" | "WHATSAPP" | "TEAMS";
  intended_department?: string;
  subject: string;
  message: string;
  related_records: {
    po_number?: string;
    grn_number?: string;
    invoice_number?: string;
  };
  reason?: string;
  message_status?: "DRAFT" | "APPROVED" | "CANCELLED" | "REJECTED" | "COPIED";
  delivery_status?: "PENDING" | "SENT" | "FAILED";
}

export interface DepartmentResponse {
  issue_id: string;
  department: "PROCUREMENT" | "WAREHOUSE";
  response: string;
  proposed_corrected_value?: any;
  explanation: string;
  supporting_attachment_id?: string;
  submitted_by: string;
  submitted_at: string;
  confirmed_quantity_received?: number;
  confirmed_damaged_quantity?: number;
  confirmed_rejected_quantity?: number;
  confirmed_condition?: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
}

export interface ProcessingJob {
  id: string;
  fileName: string;
  fileType: string;
  status: ExtractionStatus;
  currentStep: string;
  error?: string;
  file?: File;
  type: 'PO' | 'GRN';
  sourceFileHash?: string;
  totalPageCount?: number;
  processedPages?: number[];
  skippedPages?: number[];
  missingPages?: number[];
  failedPages?: number[];
  pendingChunks?: { start: number; end: number }[];
  failedChunks?: { start: number; end: number }[];
  processingStarted?: boolean;
  processingCompleted?: boolean;
  hasCache?: boolean;
  cacheRecords?: any[];
  startTime?: number;
  elapsedTime?: number;
  model_name?: string;
  model_config_version?: string;
  successful_pages?: number;
  failed_pages_count?: number;
  started_at?: string;
  completed_at?: string;
}

export interface POData {
  poRecordId: string;
  jobId?: string;
  sourceRecordKey: string; // hash:pageNumber
  poNumber: string | null;
  poDate: string | null;
  supplierName: string | null;
  supplierAddress: string | null;
  itemDescription: string | null;
  quantityOrdered: number | null;
  unitOfMeasure: string | null;
  unitPrice: number | null; // stored as float for UI, but calculations use cents
  currency: string | null;
  totalAmount: number | null;
  expectedDeliveryDate: string | null;
  deliveryAddress: string | null;
  paymentTerms: string | null;
  authorisedBy: string | null;
  sourceFileName: string;
  sourcePageNumber: number;
  sourceFileHash: string;
  sourceSheet?: string;
  sourceRowNumber?: number;
  importedAt?: string;
  validationStatus?: "VALID" | "REVIEW_REQUIRED" | "REJECTED";
  validationReasons?: string[];
  extractionConfidence: number;
  fieldConfidence: Record<string, number>;
  extractionStatus: ExtractionStatus;
  validationIssues: string[];
  isApproved?: boolean;
  metadata?: {
    model_name?: string;
    model_config_version?: string;
    extraction_timestamp?: string;
    [key: string]: any;
  };
}

export enum ReviewStatus {
  READY = "READY",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
  REVIEW_APPROVED = "REVIEW_APPROVED",
  ASSIGNED_TO_WAREHOUSE = "ASSIGNED_TO_WAREHOUSE",
}

export enum FieldStatus {
  CLEAR = "CLEAR",
  UNCLEAR = "UNCLEAR",
  NOT_FOUND = "NOT_FOUND",
  HUMAN_CORRECTED = "HUMAN_CORRECTED",
}

export interface GRNData {
  grnRecordId: string;
  jobId?: string;
  sourceRecordKey: string; // hash:pageNumber
  grnNumber: string | null;
  grnDate: string | null;
  poNumber: string | null;
  supplierName: string | null;
  itemDescription: string | null;
  quantityOrdered: number | null;
  quantityReceived: number | null;
  damagedQuantity: number | null;
  rejectedQuantity: number | null;
  acceptedQuantity: number | null;
  quantityDifference: number | null;
  unitOfMeasure: string | null;
  condition: string | null;
  receivedBy: string | null;
  warehouseNotes: string | null;
  signatureDetected: boolean;
  signatureReviewStatus: FieldStatus;
  fieldStatuses?: {
    quantityOrdered?: FieldStatus;
    quantityReceived?: FieldStatus;
  };
  sourceFileName: string;
  sourcePageNumber: number;
  sourceFileHash: string;
  sourceSheet?: string;
  sourceRowNumber?: number;
  importedAt?: string;
  validationStatus?: "VALID" | "REVIEW_REQUIRED" | "REJECTED";
  validationReasons?: string[];
  notes?: string | null;
  signaturePresent?: boolean | null;
  extractionConfidence: number;
  fieldConfidence: Record<string, number>;
  extractionStatus: ExtractionStatus;
  reviewStatus: ReviewStatus;
  reviewReasons: string[];
  quantityOrderedStatus: FieldStatus;
  quantityReceivedStatus: FieldStatus;
  humanCorrectedFields: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  validationIssues: string[];
  isApproved?: boolean;
  metadata?: {
    model_name?: string;
    model_config_version?: string;
    extraction_timestamp?: string;
    [key: string]: any;
  };
}

export type Step3SortOption =
  | "PO_NUMBER_ASC"
  | "PO_NUMBER_DESC"
  | "INVOICE_NUMBER_ASC"
  | "INVOICE_NUMBER_DESC"
  | "SUPPLIER_ASC"
  | "SUPPLIER_DESC"
  | "INVOICE_DATE_ASC"
  | "INVOICE_DATE_DESC"
  | "DUE_DATE_ASC"
  | "DUE_DATE_DESC"
  | "TOTAL_AMOUNT_ASC"
  | "TOTAL_AMOUNT_DESC";

export interface ThreeWayMatchResult {
  matchId: string;
  invoiceRecordId: string;
  status: MatchStatus;
  approval_status: ApprovalStatus;
  match_summary: string;
  financial_impact: string;
  responsible_department: "ACCOUNTS" | "WAREHOUSE" | "PROCUREMENT";
  recommended_action: string;
  matched_po_number: string;
  matched_supplier: string;
  ai_explanation?: string;
}

export interface InvoiceLineItem {
  record_id: string;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface InvoiceData {
  record_id: string;
  status?: string;
  check_result?: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  po_number: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  file_format?: string;
  document_style?: string;
  source_filename: string;
  source_invoice_link: string;
  extraction_status: string;
  duplicate_status: string;
  human_decision: string;
  approval_type?: string;
  approved_by?: string;
  approval_date?: string;
  review_notes?: string;
  processing_status: string;
  lines: InvoiceLineItem[];
  importIssues: string[];
  hasLineItems?: boolean;
  lineItemStatus?: string;
}

export interface App1ImportSummary {
  fileName: string;
  structure: string;
  registerFound: boolean;
  linesFound: boolean;
  approvedWorksheetFound?: boolean;
  headerRowDetected?: number;
  dataStartRowNumber?: number;
  invoiceLineDataStatus?: string;
  importTime: string;
  totalRows?: number;
  recordsRead: number;
  readyInvoicesCount?: number;
  importedCount: number;
  linesCount: number;
  skippedCount: number;
  incompleteCount: number;
  uniquePOs: number;
  parserVersion?: number;
  workbookFileHash?: string;
  importStatus?: string;
  worksheetSelected?: string;
  hasFileBlob?: boolean;
}

export interface SkippedRecord {
  row: number;
  invoiceNumber: string;
  status: string;
  reason: string;
}

export interface MatchResult {
  matchRecordId: string;
  invoiceRecordId: string;
  status: MatchStatus;
  deterministicStatus: MatchStatus;
  icon: string;
  shortReason: string;
  poNumber: string | null;
  grnNumbers: string[]; // Support multiple GRNs per PO
  invoiceNumber: string;
  supplierName: string;
  itemDescription: string;
  invoiceQuantity: number | null;
  poQuantityOrdered: number | null;
  grnQuantityReceived: number;
  damagedQuantity: number;
  rejectedQuantity: number;
  acceptedQuantity: number;
  invoiceUnitPrice: number | null;
  poUnitPrice: number | null;
  priceDifference: number | null;
  expectedInvoiceAmount: number | null;
  actualInvoiceAmount: number;
  amountDifference: number | null;
  grnCondition: string | null;
  checks: {
    poReference: CheckStatus;
    supplierMatch: CheckStatus;
    totalAmountMatch: CheckStatus;
    grnExistence: CheckStatus;
    quantityCheck: CheckStatus;
    priceCheck: CheckStatus;
    conditionCheck: CheckStatus;
    approvalStatus: CheckStatus;
  };
  issues: MatchIssue[];
  potentialFinancialImpact: number | null;
  recommendedAction: string;
  assignedDepartment: string;
  humanDecision: string | null;
  reviewedBy: string | null;
  reviewDate: string | null;
  reviewNotes: string | null;
  assignmentDate?: string;
  poSourceFile: string | null;
  grnSourceFiles: string[];
  invoiceSourceFile: string;
  autoApprove: boolean;
  aiExplanation?: string | null;
  aiExplanationStatus?: "IDLE" | "GENERATING" | "SUCCESS" | "FAILED";
  aiExplanationError?: string | null;
  approvalRecommendationStatus?: "PENDING" | "CONFIRMED" | "REVALIDATION_REQUIRED" | "CONFIRMED_AFTER_REVIEW";
  approvalConfirmedBy?: string | null;
  approvalConfirmedAt?: string | null;
  approvalType?: string;
  approvedBy?: string;
  approvalJustification?: string | null;
  reviewResolution?: string | null;
  humanReviewStatus?: ApprovalStatus;
  holdReason?: string;
  holdTimestamp?: string;
  holdUser?: string;
  holdNote?: string;
  supportingEvidence?: SupportingEvidence[];
  isApproved?: boolean;
  approvedAt?: string;
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
  aiExplanationTechDetails?: {
    endpoint: string;
    method: string;
    status: number;
    errorCode: string;
    requestId: string;
    timestamp: string;
  } | null;
  ruleBasedExplanation?: {
    whatWasChecked: string;
    whatWasFound: string;
    whyStatusGiven: string;
    financialImpactText: string;
    recommendedActionText: string;
    responsibleDepartmentText: string;
  };
}

export interface MatchIssue {
  type: string;
  sourceDocument: string;
  expectedValue: any;
  actualValue: any;
  difference: any;
  financialImpact: number;
  recommendedAction: string;
}

export interface AuditRecord {
  timestamp: string;
  user: string;
  recordId: string;
  action: string;
  previousValue: any;
  newValue: any;
  notes: string;
}

export interface AppState {
  currentStep: number;
  poJobs: ProcessingJob[];
  poRecords: POData[];
  grnJobs: ProcessingJob[];
  grnRecords: GRNData[];
  importedInvoiceRecords: InvoiceData[];
  skippedInvoiceRows: SkippedRecord[];
  app1ImportSummary: App1ImportSummary | null;
  step3State?: {
    workbookFileHash?: string;
    workbookFilename?: string;
    workbookStructure?: string;
    worksheetSelected?: string;
    headerRowNumber?: number;
    dataStartRowNumber?: number;
    importStatus?: string;
    importedAt?: string;
  };
  matchResults: MatchResult[];
  hasRunMatch: boolean;
  lastRunTimestamp: string | null;
  auditLog: AuditRecord[];
  isAuthorised: boolean;
  presentationMode: boolean;
  processedTransferIds: string[];
  lastApp1TransferId: string | null;
}
