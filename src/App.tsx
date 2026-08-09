import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { encodePayload } from "./lib/urlTransfer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { 
  FileUp, 
  CheckCircle2, 
  XCircle,
  ChevronRight, 
  FileText, 
  FileCheck, 
  RefreshCcw, 
  AlertTriangle, 
  Download, 
  Search,
  ArrowRight,
  User,
  History,
  Lock,
  EyeOff,
  Eye,
  Edit2,
  Trash2,
  Filter,
  Save,
  Package,
  ArrowUpDown,
  X,
  Maximize,
  RotateCw,
  RotateCcw,
  FileSearch,
  ZoomIn,
  ZoomOut,
  PackageCheck,
  Settings,
  Info,
  ShieldAlert,
  LogIn,
  ExternalLink,
  FileSpreadsheet,
  Menu,
  LayoutGrid,
  GitMerge,
  ShieldCheck,
  LogOut,
  BarChart3,
  Bot,
  Copy,
  HelpCircle,
  DollarSign,
  Clock,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { Document, Page } from "react-pdf";
import { PDFDocument } from "pdf-lib";

import { readWorkbook, findWorksheet, detectHeaderRow, normaliseHeader, parseExcelDate, parseNumber, worksheetToObjects, isBlankRow } from "./services/excelImportService";
import { ExcelUploadCard } from "./components/ExcelUploadCard";
import { GRNTableRefactored } from "./components/GRNTableRefactored";
import { Step3InvoiceSection } from "./components/Step3InvoiceSection";
import { Step4MatchSection } from "./components/Step4MatchSection";
import { parseApp1UrlPayload, clearApp1TransferParams, App1TransferInvoice } from "./services/app1UrlImport";

import { 
  AppState, 
  POData, 
  GRNData, 
  InvoiceData, 
  MatchResult, 
  MatchStatus, 
  ExtractionStatus, 
  AuditRecord, 
  ProcessingJob, 
  App1ImportSummary, 
  SkippedRecord, 
  InvoiceLineItem, 
  ReviewStatus, 
  FieldStatus, 
  CheckStatus,
  UserSession,
  App2AuditEntry,
  ApprovalStatus,
  GeneratedReport,
  ExternalMessageDraft,
  UserRole,
  DepartmentResponse,
  SupportingEvidence
} from "./types";

import { parsePOExcel, parseGRNExcel, ExcelImportResult } from "./lib/excel";
import { performMatch, validatePO, validateGRN, normalizePO, calculateGRNFields, generateRuleBasedExplanation, isApprovedResult, isGRNReviewRequired } from "./logic";
import { cn, formatCurrency, formatDate } from "./lib/utils";
import ReviewModal from "./components/ReviewModal";
import { getAllRecords, saveRecord, saveFile, getFile, deleteRecord, clearStore } from "./lib/db";

const STEPS = [
  { id: 1, title: "Step 1", label: "Import PO Database" },
  { id: 2, title: "Step 2", label: "Import GRN Database" },
  { id: 3, title: "Step 3", label: "Import App 1 Invoices" },
  { id: 4, title: "Step 4", label: "Three-Way Match" },
];

const APP2_STATE_VERSION = 11;
const APP1_IMPORT_PARSER_VERSION = 8;

const PO_STORAGE_KEY = "boonHuat_step1_purchaseOrders";
const GRN_STORAGE_KEY = "boonHuat_step2_grns";
const INVOICE_STORAGE_KEY = "boonHuat_step3_invoices";
const MATCH_RESULTS_STORAGE_KEY = "boonHuat_step4_matchResults";
const REFERENCE_VERSION_KEY = "boonHuat_referenceDataVersion";
const APP3_PUBLISHED_URL = "https://ais-pre-5cpotnfdklojvehxh7d55u-180793067643.asia-southeast1.run.app/app3"; // Placeholder

const restoreArray = (key: string): any[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

enum PreviewState {
  IDLE = "IDLE",
  LOADING_SOURCE = "LOADING_SOURCE",
  LOADING_DOCUMENT = "LOADING_DOCUMENT",
  RENDERING_PAGE = "RENDERING_PAGE",
  READY = "READY",
  SOURCE_NOT_FOUND = "SOURCE_NOT_FOUND",
  RENDER_ERROR = "RENDER_ERROR"
}

const PROFILES = [
  { staffId: "ML001", role: UserRole.ACCOUNTS_EXECUTIVE, name: "Madam Lim", email: "madam.lim@boonhuat.com", password: "1111" },
  { staffId: "PR001", role: UserRole.PROCUREMENT_STAFF, name: "Procurement Officer", email: "procurement@boonhuat.com", password: "2345" },
  { staffId: "WH001", role: UserRole.WAREHOUSE_STAFF, name: "Warehouse Officer", email: "warehouse@boonhuat.com", password: "3456" },
  { staffId: "AM001", role: UserRole.ACCOUNTS_MANAGER, name: "Accounts Manager", email: "manager@boonhuat.com", password: "4567" },
  { staffId: "SA001", role: UserRole.SYSTEM_ADMIN, name: "System Administrator", email: "admin@boonhuat.com", password: "5678" },
];


const normaliseStatus = (value: any) => String(value || "").trim().toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ");
const normaliseSupplier = (val: string) => val.trim().toUpperCase().replace(/[^A-Z0-9]/g, "_");
const normaliseInvoiceNumber = (val: string) => val.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalisePOReference = (val: string) => val.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export default function App() {
  const step3GenerationRef = useRef(0);
  const step3WorkbookInputRef = useRef<HTMLInputElement>(null);
  const grnAbortControllers = useRef<Map<string, AbortController>>(new Map());
  const grnRunIds = useRef<Map<string, number>>(new Map());
  const autoRetryAttempted = useRef<Set<string>>(new Set());
  const pageTaskStatuses = useRef<Map<string, string>>(new Map());
  
  // True once the initial IndexedDB load (PO/GRN/invoice records) has finished.
  // The App1 URL-transfer importer waits for this so it matches against real PO/GRN
  // data instead of an empty state array on first paint.
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [referenceDataHydrated, setReferenceDataHydrated] = useState(false);
  const urlImportProcessedRef = useRef(false);
  
  const [state, setState] = useState<AppState>({
    currentStep: 1,
    poJobs: [],
    poRecords: [],
    grnJobs: [],
    grnRecords: [],
    importedInvoiceRecords: [],
    skippedInvoiceRows: [],
    app1ImportSummary: null,
    matchResults: [],
    auditLog: [],
    isAuthorised: false,
    presentationMode: false,
    processedTransferIds: [],
    lastApp1TransferId: null,
  });

  const [excelPreview, setExcelPreview] = useState<{
    poResult?: ExcelImportResult<POData>;
    grnResult?: ExcelImportResult<GRNData>;
    invoiceResult?: { invoices: InvoiceData[], summary: App1ImportSummary, skipped: any[] };
    filename: string;
    show: boolean;
  } | null>(null);

  const [supportFiles, setSupportFiles] = useState<{type: 'PO' | 'GRN', files: File[]} | null>(null);
  const [poImportMode, setPoImportMode] = useState<'EXCEL' | 'DATABASE'>('EXCEL');
  const [grnImportMode, setGrnImportMode] = useState<'EXCEL' | 'DATABASE'>('EXCEL');

  const handleSupportFileUpload = (type: 'PO' | 'GRN', files: FileList | null) => {
    if (files && files.length > 0) {
      setSupportFiles({ type, files: Array.from(files) });
    }
  };

  const handlePOExcelUpload = async (file: File) => {
    try {
      setIsLoading(true);
      const result = await parsePOExcel(file);
      setExcelPreview({
        poResult: result,
        filename: file.name,
        show: true
      });
      addAuditEntry({
        action_type: "EXCEL_WORKBOOK_SELECTED",
        source_filename: file.name,
        metadata: { worksheet: result.sheetName, type: 'PO' }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGRNExcelUpload = async (file: File) => {
    try {
      setIsLoading(true);
      const result = await parseGRNExcel(file);
      setExcelPreview({
        grnResult: result,
        filename: file.name,
        show: true
      });
      addAuditEntry({
        action_type: "EXCEL_WORKBOOK_SELECTED",
        source_filename: file.name,
        metadata: { worksheet: result.sheetName, type: 'GRN' }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBothExcelUpload = async (file: File) => {
    try {
      setIsLoading(true);
      let poResult, grnResult;
      let errors = [];

      try {
        poResult = await parsePOExcel(file);
      } catch (err: any) {
        errors.push(err.message);
      }

      try {
        grnResult = await parseGRNExcel(file);
      } catch (err: any) {
        errors.push(err.message);
      }

      if (!poResult && !grnResult) {
        throw new Error("Neither Purchase Orders nor Goods Received Notes worksheets could be found in this workbook.");
      }

      setExcelPreview({
        poResult,
        grnResult,
        filename: file.name,
        show: true
      });

      addAuditEntry({
        action_type: "EXCEL_WORKBOOK_SELECTED",
        source_filename: file.name,
        metadata: { 
          poWorksheet: poResult?.sheetName, 
          grnWorksheet: grnResult?.sheetName,
          type: 'BOTH'
        }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const commitExcelImport = async () => {
    if (!excelPreview) return;

    const { poResult, grnResult, invoiceResult, filename } = excelPreview;
    
    let newPoRecords = [...state.poRecords];
    let newGrnRecords = [...state.grnRecords];

    if (poResult) {
      const incoming = [...poResult.valid, ...poResult.review];
      // Duplicate prevention: skip existing
      const existingPoNumbers = new Set(state.poRecords.map(r => r.poNumber));
      const uniqueIncoming = incoming.filter(r => !existingPoNumbers.has(r.poNumber));
      
      for (const record of uniqueIncoming) {
        await saveRecord("poRecords", record);
      }
      newPoRecords = [...newPoRecords, ...uniqueIncoming];
      
      addAuditEntry({
        action_type: "PO_RECORDS_IMPORTED",
        source_filename: filename,
        metadata: {
          worksheet: poResult.sheetName,
          count: uniqueIncoming.length,
          valid: poResult.valid.length,
          review: poResult.review.length,
          rejected: poResult.rejected.length
        }
      });
    }

    if (grnResult) {
      const incoming = [...grnResult.valid, ...grnResult.review];
      const existingGrnNumbers = new Set(state.grnRecords.map(r => r.grnNumber));
      const uniqueIncoming = incoming.filter(r => !existingGrnNumbers.has(r.grnNumber));

      for (const record of uniqueIncoming) {
        await saveRecord("grnRecords", record);
      }
      newGrnRecords = [...newGrnRecords, ...uniqueIncoming];

      addAuditEntry({
        action_type: "GRN_RECORDS_IMPORTED",
        source_filename: filename,
        metadata: {
          worksheet: grnResult.sheetName,
          count: uniqueIncoming.length,
          valid: grnResult.valid.length,
          review: grnResult.review.length,
          rejected: grnResult.rejected.length
        }
      });
    }
    
    if (invoiceResult) {
      const { invoices, summary, skipped } = invoiceResult;
      localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(invoices));
      await saveRecord("appState", { id: "importSummary", data: summary });

      const newMatchResults = invoices.map(inv => performMatch(inv, newPoRecords, newGrnRecords, invoices, state.matchResults));
      localStorage.setItem(MATCH_RESULTS_STORAGE_KEY, JSON.stringify(newMatchResults));

      addAuditEntry({
        step_number: 3,
        action_type: "APP1_INVOICE_IMPORT",
        source_filename: filename,
        decision: "SUCCESS",
        decision_reason: `Successfully imported ${invoices.length} invoices from ${filename}`
      });

      setState(prev => ({
        ...prev,
        poRecords: newPoRecords,
        grnRecords: newGrnRecords,
        importedInvoiceRecords: invoices,
        skippedInvoiceRows: skipped,
        app1ImportSummary: summary,
        matchResults: newMatchResults
      }));
      setImportStatus("IMPORTED");
    } else {
      setState(prev => ({
        ...prev,
        poRecords: newPoRecords,
        grnRecords: newGrnRecords
      }));
    }

    setExcelPreview(null);
  };

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [user, setUser] = useState<UserSession | null>(null);
  const [isInactiveWarningOpen, setIsInactiveWarningOpen] = useState(false);
  const [warningCountdown, setWarningCountdown] = useState(60);
  const [isSessionLocked, setIsSessionLocked] = useState(false);

  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetInactivityTimers = () => {
    if (!user || isSessionLocked || isInactiveWarningOpen) return;
    
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // 4 minutes = 240,000 ms
    warningTimerRef.current = setTimeout(() => {
      setIsInactiveWarningOpen(true);
      setWarningCountdown(60);
      addAuditEntry({
        action_type: "SESSION_INACTIVITY_WARNING",
        decision_reason: "5_minute_inactivity_warning"
      });

      countdownIntervalRef.current = setInterval(() => {
        setWarningCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            triggerSessionTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 4 * 60 * 1000);

    // 5 minutes = 300,000 ms
    timeoutTimerRef.current = setTimeout(() => {
      triggerSessionTimeout();
    }, 5 * 60 * 1000);
  };

  const triggerSessionTimeout = () => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setIsInactiveWarningOpen(false);
    setIsSessionLocked(true);

    setApprovalModalKey(null);
    setReviewItem(null);
    setExcelPreview(null);
    setSupportFiles(null);
    setApprovalPasscode("");
    setApprovalError("");

    addAuditEntry({
      action_type: "SESSION_TIMEOUT",
      decision_reason: "5_MINUTE_INACTIVITY_TIMEOUT"
    });
  };

  const handleStaySignedIn = () => {
    setIsInactiveWarningOpen(false);
    setWarningCountdown(60);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    addAuditEntry({
      action_type: "SESSION_REACTIVATED",
      decision_reason: "User clicked Stay Signed In"
    });
    resetInactivityTimers();
  };

  const handleLogOutNow = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
    handleLogout();
  };

  useEffect(() => {
    if (!user || isSessionLocked) return;

    const handleUserActivity = () => {
      if (!isInactiveWarningOpen && !isSessionLocked) {
        resetInactivityTimers();
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    resetInactivityTimers();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [user, isSessionLocked, isInactiveWarningOpen]);
  const [activeScreen, setActiveScreen] = useState<"DASHBOARD" | "WORKFLOW" | "AUDIT" | "SETTINGS" | "PROFILE">("DASHBOARD");
  const [workflowStep, setWorkflowStep] = useState<number>(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authStatus, setAuthStatus] = useState<"IDLE" | "SIGNING_IN" | "AUTHENTICATED" | "ERROR">("IDLE");
  const [authError, setAuthError] = useState<{ message: string, code?: string } | null>(null);
  const [auditTrailData, setAuditTrailData] = useState<App2AuditEntry[]>([]);
  const [reportsData, setReportsData] = useState<GeneratedReport[]>([]);
  const [integrityWarning, setIntegrityWarning] = useState(false);
  const [messageDraft, setMessageDraft] = useState<ExternalMessageDraft | null>(null);
  const [messageDrafts, setMessageDrafts] = useState<ExternalMessageDraft[]>([]);
  const [departmentResponses, setDepartmentResponses] = useState<DepartmentResponse[]>([]);
  const [isResetStep3ModalOpen, setIsResetStep3ModalOpen] = useState(false);
  const [step3SuccessMessage, setStep3SuccessMessage] = useState<string | null>(null);
  const [step3GroupBy, setStep3GroupBy] = useState<string>("PO_REFERENCE");
  const [step3SortBy, setStep3SortBy] = useState<string>("PO_NUMBER_ASC");
  const [step3Search, setStep3Search] = useState<string>("");

  const handleNavigate = (screen: string, step?: number) => {
    const stepMap: Record<string, number> = {
      "purchase-orders": 1,
      "goods-received-notes": 2,
      "import-invoices": 3,
      "three-way-match": 4,
      "STEP1": 1,
      "STEP2": 2,
      "STEP3": 3,
      "STEP4": 4
    };

    if (stepMap[screen] !== undefined) {
      const targetStep = stepMap[screen];
      setActiveScreen("WORKFLOW");
      setWorkflowStep(targetStep);
      setState(prev => ({ ...prev, currentStep: targetStep }));
    } else if (screen === "WORKFLOW") {
      setActiveScreen("WORKFLOW");
      if (step && step >= 1 && step <= 4) {
        setWorkflowStep(step);
        setState(prev => ({ ...prev, currentStep: step }));
      }
    } else if (screen === "EXCEPTIONS" || screen === "REPORTS") {
      setActiveScreen("WORKFLOW");
      setWorkflowStep(4);
      setState(prev => ({ ...prev, currentStep: 4 }));
    } else if (screen.startsWith("STEP")) {
      const stepNum = parseInt(screen.replace("STEP", ""), 10);
      const validStep = (stepNum >= 1 && stepNum <= 4) ? stepNum : 1;
      setActiveScreen("WORKFLOW");
      setWorkflowStep(validStep);
      setState(prev => ({ ...prev, currentStep: validStep }));
    } else if (["DASHBOARD", "WORKFLOW", "AUDIT", "SETTINGS", "PROFILE"].includes(screen)) {
      setActiveScreen(screen as any);
    } else {
      setActiveScreen("DASHBOARD");
    }
  };

  const validPoCount = useMemo(() => {
    return state.poRecords.filter(p => {
      const statusStr = String(p.validationStatus || p.extractionStatus || (p as any).status || "").toUpperCase();
      const validStatuses = ["VALID", "APPROVED", "CLEAR", "READY", "READY_FOR_MATCHING", "IMPORTED", "COMPLETED", "EXTRACTED"];
      if (p.isApproved || validStatuses.includes(statusStr)) return true;
      if (p.poNumber && statusStr !== "REVIEW_REQUIRED" && statusStr !== "REJECTED" && statusStr !== "FAILED") return true;
      return false;
    }).length;
  }, [state.poRecords]);

  const validGrnCount = useMemo(() => {
    return state.grnRecords.filter(g => {
      const statusStr = String(g.reviewStatus || g.review_status || (g as any).status || "").toUpperCase();
      const validStatuses = ["VALID", "APPROVED", "CLEAR", "READY", "REVIEW_APPROVED", "COMPLETED", "EXTRACTED"];
      if (validStatuses.includes(statusStr)) return true;
      if (g.grnNumber && statusStr !== "REVIEW_REQUIRED" && statusStr !== "REJECTED" && statusStr !== "FAILED") return true;
      return false;
    }).length;
  }, [state.grnRecords]);

  const validInvoiceCount = useMemo(() => {
    return state.importedInvoiceRecords.length;
  }, [state.importedInvoiceRecords]);

  const getStep1Status = () => {
    const isProcessing = state.poJobs.some(j => 
      j.status === ExtractionStatus.EXTRACTING || 
      j.status === ExtractionStatus.QUEUED || 
      (j.processingStarted && !j.processingCompleted)
    );
    if (isProcessing) return "Processing";

    const hasReview = activePoRecords.some(p => p.extractionStatus === ExtractionStatus.REVIEW_REQUIRED);
    if (hasReview) return "Review Required";

    if (state.poJobs.length > 0 && activePoRecords.length === 0 && state.poJobs.every(j => j.status === ExtractionStatus.FAILED)) {
      return "Failed";
    }

    if (activePoRecords.length > 0) {
      const hasFailed = state.poJobs.some(j => j.status === ExtractionStatus.PARTIALLY_COMPLETED || j.status === ExtractionStatus.FAILED) ||
                        state.poJobs.reduce((acc, j) => acc + (j.failedPages?.length || 0), 0) > 0;
      if (hasFailed) return "Partially Completed";
      return "Completed";
    }

    return "Not Started";
  };

  const getStep2Status = () => {
    const isProcessing = state.grnJobs.some(j => 
      j.status === ExtractionStatus.EXTRACTING || 
      j.status === ExtractionStatus.QUEUED || 
      (j.processingStarted && !j.processingCompleted)
    );
    if (isProcessing) return "Processing";

    const hasReview = activeGrnRecords.some(g => isGRNReviewRequired(g));
    if (hasReview) return "Review Required";

    if (state.grnJobs.length > 0 && activeGrnRecords.length === 0 && state.grnJobs.every(j => j.status === ExtractionStatus.FAILED)) {
      return "Failed";
    }

    if (activeGrnRecords.length > 0) {
      const hasFailed = state.grnJobs.some(j => j.status === ExtractionStatus.PARTIALLY_COMPLETED || j.status === ExtractionStatus.FAILED) ||
                        state.grnJobs.reduce((acc, j) => acc + (j.failedPages?.length || 0), 0) > 0;
      if (hasFailed) return "Partially Completed";
      return "Completed";
    }

    return "Not Started";
  };

  const getStep3Status = () => {
    if (isLoading && workflowStep === 3) return "Importing";
    if (state.app1ImportSummary !== null && state.importedInvoiceRecords.length > 0) return "Imported";
    if (state.app1ImportSummary !== null && state.importedInvoiceRecords.length === 0) return "Import Failed";
    return "Not Imported";
  };

  const getStep4Status = () => {
    if (isLoading && workflowStep === 4) return "Matching";
    if (state.matchResults.length > 0) {
      const hasReview = state.matchResults.some(r => r.status === MatchStatus.REVIEW_REQUIRED || r.status === MatchStatus.FAIL);
      if (hasReview) return "Review Required";
      return "Completed";
    }
    return "Not Started";
  };

  // Hash-chain logic for audit integrity
  const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  };

  const verifyAuditIntegrity = (trail: App2AuditEntry[]) => {
    if (trail.length === 0) return true;
    let isValid = true;
    for (let i = 1; i < trail.length; i++) {
      const prevHash = trail[i-1].entry_hash;
      if (trail[i].previous_entry_hash !== prevHash) {
        isValid = false;
        break;
      }
    }
    setIntegrityWarning(!isValid);
    return isValid;
  };

  const addAuditEntry = (entry: Partial<App2AuditEntry>) => {
    setAuditTrailData(prev => {
      const prevEntry = prev[prev.length - 1];
      const prevHash = prevEntry ? prevEntry.entry_hash : "0";
      
      const newEntry: App2AuditEntry = {
        audit_id: `AUDIT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        session_id: user?.session_id || "NO_SESSION",
        user_name: user?.user_name || "System",
        user_role: user?.user_role || UserRole.SYSTEM_ADMIN,
        step_number: entry.step_number || null,
        action_type: entry.action_type || "UNKNOWN",
        document_type: entry.document_type || null,
        record_id: entry.record_id || null,
        invoice_number: entry.invoice_number || null,
        po_number: entry.po_number || null,
        grn_number: entry.grn_number || null,
        supplier_name: entry.supplier_name || null,
        source_filename: entry.source_filename || null,
        source_page_number: entry.source_page_number || null,
        previous_status: entry.previous_status || null,
        new_status: entry.new_status || null,
        field_changed: entry.field_changed || null,
        original_value: entry.original_value,
        new_value: entry.new_value,
        matched_fields: entry.matched_fields || null,
        mismatch_fields: entry.mismatch_fields || null,
        assigned_department: entry.assigned_department || null,
        decision: entry.decision || null,
        decision_reason: entry.decision_reason || null,
        related_report_id: entry.related_report_id || null,
        previous_entry_hash: prevHash,
        entry_hash: ""
      };

      const content = JSON.stringify(newEntry);
      newEntry.entry_hash = simpleHash(content + prevHash);
      
      const updated = [...prev, newEntry];
      localStorage.setItem("app2_audit_trail", JSON.stringify(updated));
      return updated;
    });
  };

  // Load persistent data from localStorage on mount
  useEffect(() => {
    const loadPersistence = () => {
      try {
        const storedUser = localStorage.getItem("app2_session");
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          // Sanity check for new schema
          if (parsedUser && parsedUser.user_name && parsedUser.staff_id) {
            setUser(parsedUser);
            setState(prev => ({ ...prev, isAuthorised: true }));
            setAuthStatus("AUTHENTICATED");
            setActiveScreen("DASHBOARD");
          } else {
            // Old session format, clear it
            localStorage.removeItem("app2_session");
          }
        }

        const storedAudit = localStorage.getItem("app2_audit_trail");
        if (storedAudit) {
          const trail = JSON.parse(storedAudit);
          setAuditTrailData(trail);
          verifyAuditIntegrity(trail);
        }

        const storedReports = localStorage.getItem("app2_reports");
        if (storedReports) setReportsData(JSON.parse(storedReports));

        const storedMessages = localStorage.getItem("app2_messages");
        if (storedMessages) setMessageDrafts(JSON.parse(storedMessages));

        const storedResponses = localStorage.getItem("app2_responses");
        if (storedResponses) setDepartmentResponses(JSON.parse(storedResponses));

      } catch (err) {
        console.error("Failed to load persistent data", err);
      } finally {
        setAuthChecking(false);
      }
    };

    const timer = setTimeout(loadPersistence, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = (profile: any) => {
    const newSession: UserSession = {
      session_id: `S_${Date.now()}`,
      user_name: profile.name,
      user_role: profile.role,
      staff_id: profile.staffId,
      signed_in_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      is_authenticated: true,
      status: "ACTIVE",
    };
    
    setUser(newSession);
    localStorage.setItem("app2_session", JSON.stringify(newSession));
    setState(prev => ({ ...prev, isAuthorised: true }));
    setAuthStatus("AUTHENTICATED");
    setActiveScreen("DASHBOARD");
    
    addAuditEntry({
      action_type: "LOCAL_SIGN_IN",
      decision: "SUCCESS",
      decision_reason: `User signed in as ${profile.name} (${profile.role})`
    });
  };

  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);

  const handleLogout = (reason?: string) => {
    if (user) {
      addAuditEntry({
        action_type: reason === "TIMEOUT" ? "SESSION_TIMEOUT_LOGOUT" : "LOCAL_SIGN_OUT",
        decision: "SUCCESS",
        decision_reason: reason === "TIMEOUT" ? `User ${user.user_name} signed out due to inactivity timeout` : `User ${user.user_name} signed out`
      });
    }
    setUser(null);
    localStorage.removeItem("app2_session");
    setState(prev => ({ ...prev, isAuthorised: false }));
    setAuthStatus("IDLE");
    setActiveScreen("DASHBOARD");
    setIsSessionLocked(false);
    setIsInactiveWarningOpen(false);

    if (reason === "TIMEOUT") {
      setLogoutMessage("SESSION EXPIRED: You were signed out after 5 minutes of inactivity for security.");
    } else {
      setLogoutMessage(null);
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeoutId);
      // Only set timer if user is logged in
      if (user) {
        timeoutId = setTimeout(() => {
          handleLogout("TIMEOUT");
        }, 5 * 60 * 1000); // 5 minutes
      }
    };

    if (user) {
      resetTimer();
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);
      window.addEventListener('scroll', resetTimer);
      window.addEventListener('touchstart', resetTimer);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('scroll', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [user]);

  const [confirmState, setConfirmState] = useState<{ 
    isOpen: boolean, 
    title: string, 
    message: string, 
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmText = "Confirm", cancelText = "Cancel") => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmState(prev => ({ ...prev, isOpen: false })),
      confirmText,
      cancelText
    });
  };

  const [isLoading, setIsLoading] = useState(false);
  const [hasRunMatch, setHasRunMatch] = useState(false);
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
  const [isMatchCompleteModalOpen, setIsMatchCompleteModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<{ type: 'PO' | 'GRN' | 'MATCH', id: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [serverHealth, setServerHealth] = useState<{ ok: boolean, geminiConfigured: boolean } | null>(null);
  const [availableFileHashes, setAvailableFileHashes] = useState<Set<string>>(new Set());

  // Derive active records from jobs and source files
  const activePoRecords = useMemo(() => state.poRecords, [state.poRecords]);
  const activeGrnRecords = useMemo(() => state.grnRecords, [state.grnRecords]);

  useEffect(() => {
    // Auto-retry once for jobs that failed with a non-JSON error (which usually means routing issue)
    const failedJobs = [...state.grnJobs, ...state.poJobs].filter(j => 
      j.status === ExtractionStatus.FAILED || j.status === ExtractionStatus.PARTIALLY_COMPLETED
    ).filter(j => 
      j.error?.includes("Unexpected token") || 
      j.error?.includes("webpage instead of extraction data") ||
      j.error?.includes("This operation was aborted") ||
      j.error?.includes("fetch failed")
    );

    failedJobs.forEach(job => {
      if (!autoRetryAttempted.current.has(job.id)) {
        autoRetryAttempted.current.add(job.id);
        processJob(job, false);
      }
    });
  }, [state.grnJobs, state.poJobs]);

  // --- Approval and AI State ---
  type ApprovalDecision = {
    status: "CONFIRMED";
    confirmedBy: string;
    confirmedAt: string;
  };
  const [approvalByResultKey, setApprovalByResultKey] = useState<Record<string, ApprovalDecision>>({});
  const [approvalModalKey, setApprovalModalKey] = useState<string | null>(null);
  const [approvalPasscode, setApprovalPasscode] = useState("");
  const [approvalError, setApprovalError] = useState("");

  type AIStatus = "IDLE" | "GENERATING" | "GENERATED" | "FAILED";
  const [aiStatusByKey, setAiStatusByKey] = useState<Record<string, AIStatus>>({});
  const [aiTextByKey, setAiTextByKey] = useState<Record<string, string>>({});
  const [aiErrorByKey, setAiErrorByKey] = useState<Record<string, string>>({});

  const getResultKey = (result: any): string =>
    String(
      result?.resultId ??
      result?.recordId ??
      `${String(result?.invoiceNumber ?? "").trim()}|${String(
        result?.poReference ??
        result?.poNumber ??
        ""
      ).trim()}`
    );

  const closeApprovalModal = () => {
    setApprovalModalKey(null);
    setApprovalPasscode("");
    setApprovalError("");
  };

  const submitApproval = (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const approvalTarget = state.matchResults.find(r => getResultKey(r) === approvalModalKey);
    if (!approvalTarget) { setApprovalError("The selected invoice could not be found."); return; }
    if (approvalPasscode !== "1111") { setApprovalError("Incorrect passcode. Please try again."); return; }
    
    const status = String(approvalTarget.deterministicStatus ?? approvalTarget.status ?? "");
    const eligible = status === "CLEAN_MATCH_HEADER_VERIFIED" || status === "CLEAN_MATCH_FULLY_VERIFIED";
    if (!eligible) { setApprovalError("This invoice requires review and cannot be approved."); return; }

    const key = getResultKey(approvalTarget);
    setApprovalByResultKey(prev => ({
      ...prev,
      [key]: { status: "CONFIRMED", confirmedBy: "Madam Lim", confirmedAt: new Date().toISOString() }
    }));
    closeApprovalModal();
    // Assuming addAuditEntry exists in scope
    if (typeof (window as any).addAuditEntry === 'function') {
        (window as any).addAuditEntry({
            action: "APPROVAL_RECOMMENDATION_CONFIRMED",
            invoiceNumber: approvalTarget.invoiceNumber,
            poReference: approvalTarget.poReference ?? approvalTarget.poNumber,
            user: "Madam Lim",
            timestamp: new Date().toISOString()
        });
    }
  };


  const generateAIExplanation = async (
    event: React.MouseEvent,
    result: any
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const key = getResultKey(result);

    setAiErrorByKey(prev => ({ ...prev, [key]: "" }));
    setAiStatusByKey(prev => ({ ...prev, [key]: "GENERATING" }));

    try {
      const aiInput = {
        deterministicStatus: result.deterministicStatus ?? result.status ?? null,
        invoiceNumber: result.invoiceNumber ?? null,
        poReference: result.poReference ?? result.poNumber ?? null,
        supplier: result.supplierName ?? result.supplier ?? null,
        quantityOrdered: result.quantityOrdered ?? result.poQuantity ?? null,
        quantityReceived: result.quantityReceived ?? result.grnQuantityReceived ?? null,
        invoiceQuantity: result.invoiceQuantity ?? null,
        poUnitPrice: result.poUnitPrice ?? null,
        invoiceUnitPrice: result.invoiceUnitPrice ?? null,
        poTotal: result.poTotal ?? null,
        invoiceTotal: result.invoiceTotal ?? result.totalAmount ?? null,
        grnCondition: result.grnCondition ?? null,
        grnNotes: result.grnNotes ?? null,
        financialImpact: result.financialImpact ?? null,
        department: result.responsibleDepartment ?? result.department ?? null,
        issues: Array.isArray(result.issues) ? result.issues : []
      };

      const apiResponse = await fetch("/api/generate-match-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchResult: aiInput })
      });

      if (!apiResponse.ok) throw new Error(`AI_HTTP_${apiResponse.status}`);
      const data = await apiResponse.json();
      const text = String(data?.text ?? "").trim();
      if (!text) throw new Error("EMPTY_AI_RESPONSE");

      setAiTextByKey(prev => ({ ...prev, [key]: text }));
      setAiStatusByKey(prev => ({ ...prev, [key]: "GENERATED" }));
    } catch (error) {
      console.error("Generate AI Explanation failed:", error);
      setAiStatusByKey(prev => ({ ...prev, [key]: "FAILED" }));
      setAiErrorByKey(prev => ({ ...prev, [key]: "Live AI explanation could not be generated. The rule-based explanation remains available." }));
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setState(prev => {
        let changed = false;
        const updateJobs = (jobs: ProcessingJob[]) => {
          return jobs.map(j => {
            if (j.processingStarted && !j.processingCompleted && j.startTime && (j.status === ExtractionStatus.EXTRACTING || j.status === ExtractionStatus.EXTRACTING_CHUNKS)) {
              changed = true;
              return { ...j, elapsedTime: Date.now() - j.startTime };
            }
            return j;
          });
        };

        const nextPoJobs = updateJobs(prev.poJobs);
        const nextGrnJobs = updateJobs(prev.grnJobs);

        if (!changed) return prev;
        return { ...prev, poJobs: nextPoJobs, grnJobs: nextGrnJobs };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      console.log("[STARTUP] reference hydration started");
      try {
        // Fresh Session Check
        const initialized = sessionStorage.getItem("BoonHuatApp2-Initialized");
        if (!initialized) {
          await Promise.all([
            clearStore("poRecords"),
            clearStore("grnRecords"),
            clearStore("appState"),
            clearStore("files")
          ]);
          sessionStorage.setItem("BoonHuatApp2-Initialized", "true");
        }

        const [pos, grns, poJobs, grnJobs, appState, files] = await Promise.all([
          getAllRecords("poRecords"),
          getAllRecords("grnRecords"),
          getAllRecords("poJobs"),
          getAllRecords("grnJobs"),
          getAllRecords("appState"),
          getAllRecords("files")
        ]);

        const restoredPos = restoreArray(PO_STORAGE_KEY);
        const restoredGrns = restoreArray(GRN_STORAGE_KEY);
        
        const invoices = appState.find(r => r.id === "invoices")?.data || [];
        const matchResults = appState.find(r => r.id === "matchResults")?.data || [];
        
        const loadedPos = restoredPos.length > 0 ? restoredPos : pos;
        const loadedGrns = restoredGrns.length > 0 ? restoredGrns : grns;

        console.log(`[STARTUP] POs restored: ${loadedPos.length}`);
        console.log(`[STARTUP] GRNs restored: ${loadedGrns.length}`);
        
        const summary = appState.find(r => r.id === "summary")?.data || null;
        const step3State = appState.find(r => r.id === "step3State")?.data || null;
        const storedVersion = appState.find(r => r.id === "version")?.data || 0;

        setAvailableFileHashes(new Set(files.map(f => f.id)));

        const dedup = (records: any[]) => {
          const map = new Map();
          records.forEach(r => {
            const key = r.sourceRecordKey || `${r.sourceFileHash}:${r.poNumber ? 'PO' : 'GRN'}:${r.sourcePageNumber}`;
            if (!map.has(key)) {
              map.set(key, { ...r, sourceRecordKey: key });
            } else {
              const existing = map.get(key);
              const hasCorrection = (rec: any) => rec.extractionStatus !== ExtractionStatus.EXTRACTED && rec.extractionStatus !== ExtractionStatus.SKIPPED;
              if (!hasCorrection(existing) && hasCorrection(r)) {
                map.set(key, { ...r, sourceRecordKey: key });
              }
            }
          });
          return Array.from(map.values()).sort((a: any, b: any) => a.sourcePageNumber - b.sourcePageNumber);
        };

        // Reconciliation
        let finalPos = loadedPos;
        let finalPoJobs = poJobs;
        let finalGrns = loadedGrns;
        let finalGrnJobs = grnJobs;
        let finalInvoices = invoices;
        let finalSummary = summary;
        let finalMatchResults = matchResults;

        // Cleanup broken jobs (COMPLETED but 0 records)
        const cleanupBroken = (jobs: ProcessingJob[], records: any[]) => {
          return jobs.map(j => {
            const isHanging = j.processingStarted && !j.processingCompleted && j.startTime && (Date.now() - j.startTime > 300000); // 5 mins
            if (j.status === ExtractionStatus.COMPLETED || isHanging) {
              const recordCount = records.filter(r => r.jobId === j.id).length;
              if (recordCount === 0) {
                // Check if we have cache we can recover
                if (j.hasCache && j.cacheRecords && j.cacheRecords.length > 0) {
                  // We will recover these in the reconciliation loop below
                  return j;
                }
                if ((j.totalPageCount || 0) > 0) {
                  return { ...j, status: ExtractionStatus.REPROCESS_REQUIRED, currentStep: "The previous extraction finished without producing records. Reprocess required." };
                }
              }
            }
            if (j.status === ExtractionStatus.EXTRACTING_CHUNKS || j.status === ExtractionStatus.CREATING_CHUNKS) {
               return { ...j, status: ExtractionStatus.REPROCESS_REQUIRED, currentStep: "Legacy chunk job detected. Reprocess required." };
            }
            return j;
          });
        };

        // Sync job stats with actual records
        const reconcileStats = (jobs: ProcessingJob[], records: any[]) => {
          return jobs.map(j => {
            const actualCount = records.filter(r => (r.jobId === j.id || r.sourceFileHash === j.sourceFileHash)).length;
            const total = j.totalPageCount || 0;
            const progress = total > 0 ? Math.round((actualCount / total) * 100) : 0;
            
            let nextStatus = j.status;
            if (actualCount === total && total > 0) {
              nextStatus = ExtractionStatus.COMPLETED;
            } else if (actualCount > 0 && total > 0 && j.status !== ExtractionStatus.EXTRACTING) {
              nextStatus = ExtractionStatus.PARTIALLY_COMPLETED;
            }

            return {
              ...j,
              extractedCount: actualCount,
              progress: progress,
              status: nextStatus
            };
          });
        };

        finalPoJobs = reconcileStats(cleanupBroken(finalPoJobs, pos), pos);
        finalGrnJobs = reconcileStats(cleanupBroken(finalGrnJobs, grns), grns);
        
        // Recompute all GRN review statuses on load to apply new robust logic
        finalGrns = recomputeGrnReviewStatuses(grns);

        // Cache Recovery Logic
        const recoverFromCache = async (job: ProcessingJob, currentRecords: (POData | GRNData)[]) => {
          if (job.status === ExtractionStatus.COMPLETED && job.hasCache && job.cacheRecords && job.cacheRecords.length > 0) {
             const existing = currentRecords.filter(r => r.jobId === job.id);
             if (existing.length === 0) {
               console.log(`Recovering ${job.cacheRecords.length} records from cache for job ${job.id}`);
               if (job.type === 'PO') {
                 await commitExtractedPurchaseOrders(job, job.cacheRecords);
               } else {
                 await commitExtractedGrns(job, job.cacheRecords);
               }
             }
          }
        };

        // We run recovery after state is set to avoid missing the newly defined commit functions
        // but for now let's just make sure we don't clear them.

        if (storedVersion < APP2_STATE_VERSION) {
          console.log(`Performing storage migration from version ${storedVersion} to ${APP2_STATE_VERSION}`);
          // Version 10: Complete Step 2 Cleanup and invariant enforcement
          await clearStore("grnRecords");
          await clearStore("grnJobs");
          
          // Optional: Only clear Step 2 related files if we want to be very thorough
          const allFiles = await getAllRecords("files");
          // But we don't know which ones are GRN files without the jobs. 
          // For safety in migration, we can clear all Step 2 state.
          
          finalGrnJobs = [];
          finalGrns = [];
          
          // Re-validate POs just in case
          const poFiles = await getAllRecords("files");
          const validFileIds = new Set(poFiles.map(f => f.id));
          finalPoJobs = poJobs.filter(j => validFileIds.has(j.sourceFileHash || ""));
          finalPos = pos.filter(p => 
            finalPoJobs.some(j => j.id === p.jobId) && validFileIds.has(p.sourceFileHash)
          );
        }

        // Step 3 cleanup if old parser or zero records but summary exists
        let finalStep3State = step3State;
        if (summary && (summary.parserVersion || 0) < APP1_IMPORT_PARSER_VERSION) {
          finalInvoices = [];
          finalSummary = null;
          finalStep3State = null;
        } else if (summary && finalInvoices.length === 0) {
          // Clear stale metadata if no actual records exist
          finalSummary = null;
          finalStep3State = null;
        }

    // Invariant check: if no jobs, clear records from memory (migration handled persistence)
    if (finalGrnJobs.length === 0) {
      finalGrns = [];
    }
    if (finalPoJobs.length === 0) {
      finalPos = [];
    }

    const cleanPos = dedup(finalPos);
        const cleanGrns = dedup(finalGrns);

        // Version 6.1: Clean up invalid records from failed jobs as requested
        const jobIdMap = new Map(
          [...finalPoJobs, ...finalGrnJobs].map(j => [j.id, j.status])
        );

        const filterValid = (records: any[], type: 'PO' | 'GRN') => {
          return records.filter(r => {
            const jobStatus = jobIdMap.get(r.jobId);
            const isFailedJob = jobStatus === ExtractionStatus.FAILED;
            
            const isFake = (
              (r.grnNumber === null || r.grnNumber === "" || r.grnNumber === "N/A") &&
              (r.poNumber === null || r.poNumber === "") &&
              (r.supplierName === null || r.supplierName === "") &&
              (r.quantityOrdered === null) &&
              (r.quantityReceived === null)
            );

            if (isFailedJob && isFake) {
              console.log(`Cleaning up fake ${type} record:`, r.grnRecordId || r.poRecordId);
              return false;
            }
            return true;
          });
        };

        const filteredPos = filterValid(cleanPos, 'PO');
        const filteredGrns = filterValid(cleanGrns, 'GRN');

        // Re-evaluate existing GRN records with updated logic
        const recomputedGrns = filteredGrns.map(g => calculateGRNFields({ ...g }));

        setState(prev => {
          const newState = {
            ...prev,
            poJobs: finalPoJobs,
            poRecords: filteredPos,
            grnJobs: finalGrnJobs,
            grnRecords: recomputedGrns,
            importedInvoiceRecords: finalInvoices,
            matchResults: finalMatchResults,
            app1ImportSummary: finalSummary,
            step3State: finalStep3State || { importStatus: "IDLE" },
          };

          // Re-run matching if Step 4 data exists
          if (newState.importedInvoiceRecords.length > 0) {
            newState.matchResults = newState.importedInvoiceRecords.map(inv => 
              performMatch(inv, newState.poRecords, newState.grnRecords, newState.importedInvoiceRecords || [], matchResults)
            );
          }

          return newState;
        });

        // Run recovery for any completed jobs with no records
        for (const j of finalPoJobs) await recoverFromCache(j, filteredPos);
        for (const j of finalGrnJobs) await recoverFromCache(j, filteredGrns);

        // Clean DB if needed
        if (filteredPos.length !== pos.length) {
          await clearStore("poRecords");
          for (const p of filteredPos) await saveRecord("poRecords", p);
        }
        if (filteredGrns.length !== grns.length) {
          await clearStore("grnRecords");
          for (const g of filteredGrns) await saveRecord("grnRecords", g);
        }
        
        await saveRecord("appState", { id: "version", data: APP2_STATE_VERSION });

      } catch (err) {
        console.error("Failed to load IndexedDB data", err);
      } finally {
        console.log("[STARTUP] reference hydration completed");
        setReferenceDataHydrated(true);
        setInitialDataLoaded(true);
      }
    };
    loadData();
  }, []);

  // Debug tracing for invoice state changes to ensure no resetting
  const prevImportedInvoicesCountRef = useRef(0);
  useEffect(() => {
    const currentCount = state.importedInvoiceRecords.length;
    if (prevImportedInvoicesCountRef.current !== currentCount) {
      console.log(
        "[INVOICE_STATE_CHANGE_TRACE]",
        `[INVOICE STATE CHANGE] ${prevImportedInvoicesCountRef.current} -> ${currentCount}`
      );
      prevImportedInvoicesCountRef.current = currentCount;
    }
  }, [state.importedInvoiceRecords]);

  const convertApp1InvoiceToApp2 = (
    incoming: App1TransferInvoice,
    index: number
  ): InvoiceData => {
    const recordId =
      incoming.app1RecordId ||
      `APP1_${incoming.invoiceNumber}_${incoming.poReference}_${index}`;

    return {
      record_id: recordId,
      status: "READY_FOR_3_WAY_MATCH",
      check_result: "READY",
      supplier_name: String(incoming.supplierName || "").trim(),
      invoice_number: String(incoming.invoiceNumber || "").trim(),
      invoice_date: String(incoming.invoiceDate || "").trim(),
      due_date: String(incoming.dueDate || "").trim(),
      po_number: String(incoming.poReference || "").trim(),
      currency: String(incoming.currency || "SGD").trim(),
      subtotal: Number(incoming.calculatedSubtotal ?? incoming.totalAmount ?? 0),
      tax_amount: Number(incoming.taxAmount ?? 0),
      total_amount: Number(incoming.totalAmount ?? 0),
      source_filename: incoming.sourceFileName || "Transferred from App 1",
      source_invoice_link: "",
      extraction_status: "COMPLETED",
      duplicate_status: "CLEAR",
      human_decision: "APPROVED",
      approval_type: "APP1_APPROVED",
      approved_by: incoming.approvedBy || "Madam Lim",
      approval_date: incoming.approvedAt || new Date().toISOString(),
      review_notes: incoming.reviewNotes || "",
      processing_status: "READY_FOR_3_WAY_MATCH",
      file_format: incoming.sourceFileName?.toLowerCase().endsWith(".pdf") ? "PDF" : "TRANSFER",
      document_style: "APP1_URL_TRANSFER",
      lines: Array.isArray(incoming.lineItems)
          ? incoming.lineItems.map((line, lineIndex) => ({
              record_id: `${recordId}_LINE_${line.lineNumber ?? lineIndex + 1}`,
              line_number: Number(line.lineNumber ?? lineIndex + 1),
              description: String(line.description || ""),
              quantity: Number(line.quantity ?? 0),
              unit_price: Number(line.unitPrice ?? 0),
              line_total: Number(line.lineAmount ?? 0)
            }))
          : [],
      importIssues: [],
      hasLineItems: Array.isArray(incoming.lineItems) && incoming.lineItems.length > 0,
      lineItemStatus: Array.isArray(incoming.lineItems) && incoming.lineItems.length > 0 ? "INCLUDED" : "NOT_INCLUDED"
    };
  };

  const normaliseKeyText = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

  const getInvoiceBusinessKey = (invoice: InvoiceData) => {
    if (invoice.record_id && invoice.record_id.trim()) {
      return `ID:${invoice.record_id}`;
    }
    return "INV:" + normaliseKeyText(invoice.supplier_name) + "|" + normaliseKeyText(invoice.invoice_number);
  };

  const mergeUniqueInvoices = (
    existing: InvoiceData[],
    newInvoices: InvoiceData[]
  ): InvoiceData[] => {
    const combined = [...existing, ...newInvoices];
    const deduped: InvoiceData[] = [];
    const seenKeys = new Set<string>();

    combined.forEach(inv => {
      if (!inv.supplier_name && !inv.invoice_number) {
         console.warn("[APP1 TRANSFER] skipped invalid/empty invoice during deduplication:", inv);
         return;
      }
      const key = getInvoiceBusinessKey(inv);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        deduped.push(inv);
      } else {
        console.log("[APP1 TRANSFER] deduplicated duplicate invoice key:", key);
      }
    });

    return deduped;
  };

  // App1 URL-transfer importer
  useEffect(() => {
    if (referenceDataHydrated && !urlImportProcessedRef.current) {
      urlImportProcessedRef.current = true;
      const payload = parseApp1UrlPayload(window.location.search);
      
      if (payload) {
        console.log("[APP1 TRANSFER] envelope count:", payload.approvedInvoiceCount);
        console.log("[APP1 TRANSFER] raw invoices:", payload.invoices.length);

        const convertedInvoices = payload.invoices.map((invoice, index) =>
          convertApp1InvoiceToApp2(invoice, index)
        );

        console.log(
          "[APP1 TRANSFER] converted invoices:",
          convertedInvoices.map(i => ({
            record_id: i.record_id,
            invoice_number: i.invoice_number,
            supplier_name: i.supplier_name,
            po_number: i.po_number,
            total_amount: i.total_amount
          }))
        );

        // Define transfer summary object conforming to App1ImportSummary interface
        const transferSummary: App1ImportSummary = {
          fileName: "Transferred from App 1",
          structure: "APP1_URL_TRANSFER",
          registerFound: true,
          linesFound: convertedInvoices.some(i => Array.isArray(i.lines) && i.lines.length > 0),
          importTime: new Date().toISOString(),
          recordsRead: convertedInvoices.length,
          readyInvoicesCount: convertedInvoices.length,
          importedCount: convertedInvoices.length,
          linesCount: convertedInvoices.reduce((sum, i) => sum + (Array.isArray(i.lines) ? i.lines.length : 0), 0),
          skippedCount: 0,
          incompleteCount: 0,
          uniquePOs: new Set(convertedInvoices.map(i => normaliseKeyText(i.po_number))).size,
          importStatus: "IMPORTED",
          worksheetSelected: "App 1 Direct Transfer",
          hasFileBlob: false
        };

        setState(prev => {
          if (prev.processedTransferIds.includes(payload.transferId)) {
             // Already processed this transfer ID, ignore
             return prev;
          }

          const deduped = mergeUniqueInvoices(prev.importedInvoiceRecords, convertedInvoices);

          localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify(deduped));
          localStorage.setItem(MATCH_RESULTS_STORAGE_KEY, JSON.stringify([]));

          // Also save to IndexedDB to survive soft refreshes/other load paths
          saveRecord("appState", { id: "invoices", data: deduped });
          saveRecord("appState", { id: "summary", data: transferSummary });

          return {
            ...prev,
            importedInvoiceRecords: deduped,
            app1ImportSummary: transferSummary,
            step3State: {
              ...prev.step3State,
              workbookFilename: "Transferred from App 1",
              workbookStructure: "APP1_URL_TRANSFER",
              worksheetSelected: "App 1 Direct Transfer",
              importStatus: "IMPORTED",
              importedAt: new Date().toISOString()
            },
            matchResults: [], // Invalidate existing results
            processedTransferIds: [...prev.processedTransferIds, payload.transferId]
          };
        });

        console.log(`[APP1 TRANSFER] Step 3 committed: ${convertedInvoices.length}`);

        // Add audit log entries using converted values
        convertedInvoices.forEach(inv => {
          addAuditEntry({
            step_number: 3,
            action_type: "APP1_TRANSFER_RECEIVED",
            invoice_number: inv.invoice_number,
            supplier_name: inv.supplier_name,
            decision: "SUCCESS",
            decision_reason: `Transferred approved invoice ${inv.invoice_number} from Invoice Extraction (Transfer ID: ${payload.transferId})`
          });
          addAuditEntry({
            step_number: 3,
            action_type: "APP1_INVOICE_IMPORTED",
            invoice_number: inv.invoice_number,
            supplier_name: inv.supplier_name,
            decision: "SUCCESS",
            decision_reason: `Imported invoice ${inv.invoice_number} from transfer ${payload.transferId}`
          });
        });

        if (window.opener) {
          window.opener.postMessage({ type: "BOON_HUAT_APP2_IMPORT_ACK", transferId: payload.transferId, importedCount: convertedInvoices.length, success: true }, "*");
        }
        
        alert(`${payload.approvedInvoiceCount} approved invoices received from Invoice Extraction.`);
        clearApp1TransferParams();
      }
    }
  }, [referenceDataHydrated]);

  // Persist PO/GRN to localStorage
  useEffect(() => {
    if (!referenceDataHydrated) return;
    localStorage.setItem(PO_STORAGE_KEY, JSON.stringify(state.poRecords));
    localStorage.setItem(GRN_STORAGE_KEY, JSON.stringify(state.grnRecords));
    localStorage.setItem(REFERENCE_VERSION_KEY, "1");
  }, [state.poRecords, state.grnRecords, referenceDataHydrated]);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/app2/health");
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          console.error("Health check failed: expected JSON but got", contentType);
          setServerHealth({ ok: false, geminiConfigured: false });
          return;
        }
        const data = await res.json();
        setServerHealth(data);
      } catch (err) {
        setServerHealth({ ok: false, geminiConfigured: false });
      }
    };
    checkHealth();
  }, []);

  // Save jobs to DB
  useEffect(() => {
    state.poJobs.forEach(job => saveRecord("poJobs", job));
    state.grnJobs.forEach(job => saveRecord("grnJobs", job));
  }, [state.poJobs, state.grnJobs]);

  const addAudit = async (recordId: string | null, action: string, prev: any, current: any, notes: string = "", extra: any = {}) => {
    addAuditEntry({
      record_id: recordId,
      action_type: action,
      original_value: prev,
      new_value: current,
      decision_reason: notes,
      ...extra
    });
  };

  const handleSendToApp3 = async (results: MatchResult[]) => {
    // Validate eligibility
    const eligibleResults = results.filter(r => 
        (r.approvalRecommendationStatus === "CONFIRMED" || r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW")
    );

    if (eligibleResults.length === 0) {
        alert("No eligible invoices selected for transfer.");
        return;
    }

    // Create payload
    const transferId = `tr_app2_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const payload = {
        type: "BOON_HUAT_APP2_APPROVED_PAYMENTS",
        version: 1,
        sourceApp: "APP2",
        destinationApp: "APP3",
        transferId: transferId,
        sentAt: new Date().toISOString(),
        approvedPaymentCount: eligibleResults.length,
        payments: eligibleResults.map(r => {
             const origInvoice = state.importedInvoiceRecords.find(inv => inv.record_id === r.invoiceRecordId || inv.invoice_number === r.invoiceNumber);
             return {
                  app1RecordId: null,
                  app2MatchId: r.matchRecordId,
                  supplierName: r.supplierName,
                  invoiceNumber: r.invoiceNumber,
                  invoiceDate: origInvoice?.invoice_date || new Date().toISOString().split('T')[0],
                  dueDate: origInvoice?.due_date || new Date().toISOString().split('T')[0],
                  poReference: r.poNumber,
                  currency: "SGD",
                  totalAmount: r.actualInvoiceAmount,
                  matchStatus: r.status,
                  approvalStatus: r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW" ? "APPROVED_AFTER_REVIEW" : "APPROVED",
                  approvedBy: r.approvalConfirmedBy || "SYSTEM",
                  approvedAt: r.approvalConfirmedAt || new Date().toISOString(),
                  reviewResolution: r.reviewResolution || null,
                  reviewReason: r.reviewNotes || null
             };
        })
    };

    // Encode
    const encoded = encodePayload(payload);
    const url = `${APP3_PUBLISHED_URL}?paymentData=${encoded}`;
    
    // Check URL size
    if (url.length > 2000) {
        // Fallback
        alert("TRANSFER TOO LARGE FOR DIRECT LINK. Use export feature.");
    } else {
        window.open(url, "_blank");
    }

    // Audit
    eligibleResults.forEach(r => {
        addAuditEntry({
            step_number: 4,
            action_type: "APP2_TRANSFER_SENT",
            invoice_number: r.invoiceNumber,
            metadata: { transferId, destination: "APP3" }
        });
    });
  };

  const mergeRecords = <T extends { sourceRecordKey: string, sourcePageNumber: number }>(existing: T[], incoming: T[]): T[] => {
    const map = new Map<string, T>();
    existing.forEach(r => map.set(r.sourceRecordKey, r));
    incoming.forEach(r => map.set(r.sourceRecordKey, r));
    return Array.from(map.values()).sort((a, b) => a.sourcePageNumber - b.sourcePageNumber);
  };

  const handleFileUpload = async (type: 'PO' | 'GRN' | 'INVOICE', files: FileList | null | File[]) => {
    const fileArray = files instanceof FileList ? Array.from(files) : (files || []);
    if (fileArray.length === 0) return;
    
    const file = fileArray[0];
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setError("Upload an Excel workbook in XLSX or XLS format.");
      return;
    }
    
    if (type === 'INVOICE') {
      await handleInvoiceImport(file);
      return;
    }

    if (type === 'PO') {
      await handlePOExcelUpload(file);
    } else if (type === 'GRN') {
      await handleGRNExcelUpload(file);
    }
  };

  // Global extraction lock and queue to prevent simultaneous PO/GRN requests
  const isExtractionLockActive = useRef(false);
  const extractionQueue = useRef<string[]>([]);
  const extractionTaskQueue = useRef<{jobId: string, pageNumber: number, type: 'PO' | 'GRN', attempts: number}[]>([]);
  const workerRunningRef = useRef<boolean>(false);
  const lastRequestTime = useRef<number>(0);
  const [globalQuotaCooldown, setGlobalQuotaCooldown] = useState<number>(0);
  const [isProcessingPaused, setIsProcessingPaused] = useState<boolean>(false);

  // Queue Recovery on Mount
  useEffect(() => {
    const recoverQueue = async () => {
      // Wait for auth and initial data load
      if (authChecking) return;
      
      const allJobs = [...stateRef.current.poJobs, ...stateRef.current.grnJobs];
      const processableJobs = allJobs.filter(j => 
        j.status !== ExtractionStatus.COMPLETED && 
        j.status !== ExtractionStatus.CANCELLED &&
        !isProcessingPaused
      );

      if (processableJobs.length > 0) {
        console.log(`Queue Recovery: Found ${processableJobs.length} active jobs to resume.`);
        for (const job of processableJobs) {
          processJob(job, false);
        }
      }
    };
    
    const timer = setTimeout(recoverQueue, 1000); // Give it 1s to load records
    return () => clearTimeout(timer);
  }, [authChecking, isProcessingPaused]);

  // Global Extraction Scheduler
  useEffect(() => {
    const schedulerInterval = setInterval(async () => {
      if (workerRunningRef.current || isProcessingPaused || extractionTaskQueue.current.length === 0) return;

      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime.current;
      
      if (globalQuotaCooldown > 0) {
        setGlobalQuotaCooldown(prev => Math.max(0, prev - 1));
        return;
      }

      // Allow immediate start if it's the first request or a fresh start
      if (lastRequestTime.current !== 0 && timeSinceLastRequest < 15000) return;

      // Take the first task
      const task = extractionTaskQueue.current[0];
      if (!task) return;

      // Helper to update job status in scheduler context
      const updateJobInScheduler = (updates: Partial<ProcessingJob>) => {
        setState(prev => {
          const jobs = task.type === 'PO' ? [...prev.poJobs] : [...prev.grnJobs];
          const idx = jobs.findIndex(j => j.id === task.jobId);
          if (idx !== -1) {
            jobs[idx] = { ...jobs[idx], ...updates };
          }
          return task.type === 'PO' ? { ...prev, poJobs: jobs } : { ...prev, grnJobs: jobs };
        });
      };

      // Start processing task
      workerRunningRef.current = true;
      lastRequestTime.current = Date.now();

      // Change status to STARTING
      updateJobInScheduler({ 
        status: ExtractionStatus.STARTING, 
        currentStep: `Starting extraction for page ${task.pageNumber}...` 
      });

      try {
        await executeExtractionTask(task);
        // If successful, remove from queue
        extractionTaskQueue.current.shift();
      } catch (err: any) {
        console.error("Task execution failed:", err);
        const isQuota = err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED");
        
        if (isQuota) {
          setGlobalQuotaCooldown(60); 
          updateJobInScheduler({ 
            status: ExtractionStatus.PAUSED_BY_QUOTA,
            currentStep: "Processing has temporarily paused because the request limit was reached. Completed records are safe. Processing will resume automatically."
          });
        } else {
          if (task.attempts < 3) {
            task.attempts++;
            const errorMessage = err.name === 'AbortError' 
              ? "This page took too long to process and will be retried."
              : `Retrying page ${task.pageNumber} (Attempt ${task.attempts+1}/4)...`;
            
            updateJobInScheduler({ 
              currentStep: errorMessage
            });
          } else {
            extractionTaskQueue.current.shift(); // Max retries reached
            updateJobInScheduler({ 
              status: ExtractionStatus.FAILED,
              error: "This page could not be extracted after several attempts."
            });
          }
        }
      } finally {
        workerRunningRef.current = false;
      }
    }, 1000);

    return () => clearInterval(schedulerInterval);
  }, [isProcessingPaused, globalQuotaCooldown]);

  const executeExtractionTask = async (task: {jobId: string, pageNumber: number, type: 'PO' | 'GRN', attempts: number}) => {
    // USE stateRef to get latest jobs
    const job = [...stateRef.current.poJobs, ...stateRef.current.grnJobs].find(j => j.id === task.jobId);
    if (!job) return;

    const updateJob = (updates: Partial<ProcessingJob>) => {
      setState(prev => {
        const jobs = task.type === 'PO' ? [...prev.poJobs] : [...prev.grnJobs];
        const idx = jobs.findIndex(j => j.id === task.jobId);
        if (idx !== -1) {
          jobs[idx] = { ...jobs[idx], ...updates };
        }
        return task.type === 'PO' ? { ...prev, poJobs: jobs } : { ...prev, grnJobs: jobs };
      });
    };

    updateJob({ 
      status: ExtractionStatus.PROCESSING, 
      currentStep: `Extracting page ${task.pageNumber}...` 
    });

    // Final check for committed record to prevent duplicates
    const alreadyCommitted = (task.type === 'PO' ? stateRef.current.poRecords : stateRef.current.grnRecords)
      .some(r => r.jobId === task.jobId && r.sourcePageNumber === task.pageNumber);
    
    if (alreadyCommitted) {
      console.log(`Page ${task.pageNumber} already committed for job ${task.jobId}, skipping.`);
      return; // Skip extraction
    }

    let fileToProcess = job.file;
    if (!fileToProcess && job.sourceFileHash) {
      const storedBlob = await getFile(job.sourceFileHash);
      if (storedBlob) {
        fileToProcess = new File([storedBlob], job.fileName, { type: job.fileType });
      }
    }

    if (!fileToProcess) throw new Error("Source file not found.");

    // Split page
    const arrayBuffer = await fileToProcess.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const singlePageDoc = await PDFDocument.create();
    const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [task.pageNumber - 1]);
    singlePageDoc.addPage(copiedPage);
    const pdfBytes = await singlePageDoc.save();
    const pageFile = new File([new Blob([pdfBytes], { type: 'application/pdf' })], `page_${task.pageNumber}.pdf`, { type: 'application/pdf' });

    const formData = new FormData();
    formData.append("page_file", pageFile);
    formData.append("document_type", task.type);
    formData.append("source_filename", job.fileName);
    formData.append("source_page_number", task.pageNumber.toString());
    formData.append("total_page_count", (job.totalPageCount || 0).toString());
    formData.append("job_id", job.id);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const res = await fetch("/api/document-extraction/page", {
        method: "POST",
        body: formData,
        signal: controller.signal
      });

      if (!res.ok) {
        const isQuota = res.status === 429;
        if (isQuota) {
          updateJob({ 
            status: ExtractionStatus.WAITING_FOR_RATE_LIMIT, 
            currentStep: "Rate limit reached. Waiting to retry..." 
          });
          throw new Error("429 RESOURCE_EXHAUSTED");
        }
        throw new Error(`Server error: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        if (task.type === 'PO') {
          await commitExtractedPurchaseOrders(job, [data.record], { model_name: data.model_name, model_config_version: "2026-08" });
        } else {
          await commitExtractedGrns(job, [data.record], undefined, { model_name: data.model_name, model_config_version: "2026-08" });
        }
        
        // Check if job is now complete
        setState(prev => {
          const jobs = task.type === 'PO' ? prev.poJobs : prev.grnJobs;
          const records = task.type === 'PO' ? prev.poRecords : prev.grnRecords;
          const currentJob = jobs.find(j => j.id === task.jobId);
          if (currentJob) {
            const committedPages = records.filter(r => r.jobId === task.jobId).length;
            const total = currentJob.totalPageCount || 0;
            if (committedPages === total) {
              updateJob({ status: ExtractionStatus.COMPLETED, currentStep: "Scan Complete" });
            } else {
              // Check if any other tasks for this job are in queue (excluding the one just finished)
              const otherTasksInQueue = extractionTaskQueue.current.slice(1).some(t => t.jobId === task.jobId);
              if (!otherTasksInQueue) {
                updateJob({ status: ExtractionStatus.PARTIALLY_COMPLETED, currentStep: `Extracted ${committedPages} of ${total} pages` });
              } else {
                updateJob({ status: ExtractionStatus.PROCESSING, currentStep: `Extracted ${committedPages} of ${total} pages. Continuing...` });
              }
            }
          }
          return prev;
        });
      } else {
        throw new Error(data.error_message || "Extraction failed.");
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error("Extraction request timed out after 60 seconds.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const commitExtractedPurchaseOrders = async (job: ProcessingJob, extractedDocuments: any[], modelInfo?: { model_name: string, model_config_version: string }) => {
    if (!extractedDocuments || !Array.isArray(extractedDocuments)) return;

    const mappedRecords: POData[] = extractedDocuments.map(doc => {
      const pageNum = doc.source_page_number || doc.sourcePageNumber || 1;
      const po: POData = {
        poRecordId: crypto.randomUUID(),
        jobId: job.id,
        sourceFileHash: job.sourceFileHash!,
        sourceFileName: job.fileName,
        sourcePageNumber: pageNum,
        sourceRecordKey: `${job.sourceFileHash}:PO:${pageNum}`,
        poNumber: doc.po_number || doc.poNumber || null,
        poDate: doc.po_date || doc.poDate || null,
        supplierName: doc.supplier_name || doc.supplierName || null,
        supplierAddress: doc.supplier_address || doc.supplierAddress || null,
        itemDescription: doc.item_description || doc.itemDescription || null,
        quantityOrdered: doc.quantity_ordered !== undefined ? Number(doc.quantity_ordered) : (doc.quantityOrdered !== undefined ? Number(doc.quantityOrdered) : null),
        unitOfMeasure: doc.unit_of_measure || doc.unitOfMeasure || "Unit",
        unitPrice: doc.unit_price !== undefined ? Number(doc.unit_price) : (doc.unitPrice !== undefined ? Number(doc.unitPrice) : null),
        currency: doc.currency || "SGD",
        totalAmount: doc.total_amount !== undefined ? Number(doc.total_amount) : (doc.totalAmount !== undefined ? Number(doc.totalAmount) : null),
        expectedDeliveryDate: doc.delivery_date || doc.expectedDeliveryDate || null,
        deliveryAddress: doc.delivery_address || doc.deliveryAddress || null,
        paymentTerms: doc.payment_terms || doc.paymentTerms || null,
        authorisedBy: doc.authorised_by || doc.authorisedBy || null,
        extractionConfidence: 0.95,
        fieldConfidence: {},
        extractionStatus: doc.extraction_status === "REVIEW_REQUIRED" ? ExtractionStatus.REVIEW_REQUIRED : ExtractionStatus.EXTRACTED,
        validationIssues: [],
        metadata: {
          model_name: modelInfo?.model_name || job.model_name || "gemini-3.6-flash",
          model_config_version: modelInfo?.model_config_version || job.model_config_version || "2026-08",
          extraction_timestamp: new Date().toISOString()
        }
      };

      if (po.totalAmount === null && po.quantityOrdered !== null && po.unitPrice !== null) {
        po.totalAmount = po.quantityOrdered * po.unitPrice;
      }

      po.validationIssues = validatePO(po, state.poRecords);
      if (po.validationIssues.length > 0) po.extractionStatus = ExtractionStatus.REVIEW_REQUIRED;
      
      return po;
    });

    const uniqueMap = new Map<string, POData>();
    mappedRecords.forEach(r => uniqueMap.set(r.sourceRecordKey, r));
    const finalRecords = Array.from(uniqueMap.values());

    if (finalRecords.length === 0) return;

    for (const r of finalRecords) {
      await saveRecord("poRecords", r);
    }

    setState(prev => {
      const recordsByKey = new Map<string, POData>(prev.poRecords.map(r => [r.sourceRecordKey, r]));
      finalRecords.forEach(r => recordsByKey.set(r.sourceRecordKey, r));
      const newPoRecords = Array.from(recordsByKey.values()).sort((a, b) => a.sourcePageNumber - b.sourcePageNumber);
      
      const newJobs = prev.poJobs.map(j => {
        if (j.id === job.id) {
          const committedCount = newPoRecords.filter(r => r.jobId === job.id).length;
          const isComplete = committedCount === (j.totalPageCount || 0);
          
          // Only update status to COMPLETED if it is actually complete.
          // Otherwise, preserve existing status (which might be PROCESSING or WAITING_FOR_RATE_LIMIT)
          const nextStatus = isComplete ? ExtractionStatus.COMPLETED : j.status;

          return {
            ...j,
            status: nextStatus,
            currentStep: isComplete ? "Scan Complete" : j.currentStep,
            processingCompleted: isComplete,
            successful_pages: committedCount,
            failed_pages_count: (j.totalPageCount || 0) - committedCount,
            elapsedTime: Date.now() - (j.startTime || Date.now()),
            completed_at: isComplete ? new Date().toISOString() : j.completed_at,
            model_name: modelInfo?.model_name || j.model_name,
            model_config_version: modelInfo?.model_config_version || j.model_config_version
          };
        }
        return j;
      });

      return { ...prev, poRecords: newPoRecords, poJobs: newJobs };
    });
    
    addAudit(job.id, "PO_RECORDS_COMMITTED", ExtractionStatus.EXTRACTING, ExtractionStatus.EXTRACTED, `Committed ${finalRecords.length} PO records`);
  };

  const recomputeGrnReviewStatuses = (records: GRNData[]): GRNData[] => {
    return records.map(grn => {
      // Don't recompute if already manually reviewed/approved/assigned
      if (grn.reviewStatus === ReviewStatus.REVIEW_APPROVED || grn.reviewStatus === ReviewStatus.ASSIGNED_TO_WAREHOUSE) {
        return grn;
      }
      
      // Preserve existing data but let calculateGRNFields regenerate reasons
      // Note: calculateGRNFields will update grn.reviewStatus and grn.reviewReasons
      const updated = calculateGRNFields({ ...grn });
      
      // If it was READY but now has reasons, it becomes REVIEW_REQUIRED
      // If it was REVIEW_REQUIRED but now has no reasons, it becomes READY
      // This handles Part B fix where GRN-2026-019 should become READY
      return updated;
    });
  };

  const commitExtractedGrns = async (job: ProcessingJob, extractedDocuments: any[], pageRange?: { start: number; end: number }, modelInfo?: { model_name: string, model_config_version: string }) => {
    if (!extractedDocuments || !Array.isArray(extractedDocuments)) return;

    const mappedRecords: GRNData[] = extractedDocuments.map((doc, idx) => {
      const pageNum = doc.source_page_number || doc.sourcePageNumber || (pageRange ? (pageRange.start + idx) : 1);
      
      let grn: GRNData = {
        grnRecordId: crypto.randomUUID(),
        jobId: job.id,
        sourceFileHash: job.sourceFileHash!,
        sourceFileName: job.fileName,
        sourcePageNumber: pageNum,
        sourceRecordKey: `${job.sourceFileHash}:GRN:${pageNum}`,
        grnNumber: doc.grn_number || doc.grnNumber || null,
        grnDate: doc.grn_date || doc.grnDate || null,
        poNumber: doc.po_number || doc.poNumber || null,
        supplierName: doc.supplier_name || doc.supplierName || null,
        itemDescription: doc.item_description || doc.itemDescription || null,
        quantityOrdered: doc.quantity_ordered !== undefined ? Number(doc.quantity_ordered) : (doc.quantityOrdered !== undefined ? Number(doc.quantityOrdered) : null),
        quantityReceived: doc.quantity_received !== undefined ? Number(doc.quantity_received) : (doc.quantityReceived !== undefined ? Number(doc.quantityReceived) : null),
        damagedQuantity: doc.damaged_quantity !== undefined ? Number(doc.damaged_quantity) : (doc.damagedQuantity !== undefined ? Number(doc.damagedQuantity) : 0),
        rejectedQuantity: doc.rejected_quantity !== undefined ? Number(doc.rejected_quantity) : (doc.rejectedQuantity !== undefined ? Number(doc.rejectedQuantity) : 0),
        acceptedQuantity: 0,
        quantityDifference: 0,
        unitOfMeasure: doc.unit_of_measure || doc.unitOfMeasure || "Unit",
        condition: doc.condition || null,
        receivedBy: doc.received_by || doc.receivedBy || null,
        warehouseNotes: doc.warehouse_notes || doc.warehouseNotes || null,
        signatureDetected: doc.signature_status === "PRESENT" || !!doc.signatureDetected,
        signatureReviewStatus: FieldStatus.CLEAR,
        extractionConfidence: 0.9,
        fieldConfidence: {},
        extractionStatus: doc.extraction_status === "REVIEW_REQUIRED" ? ExtractionStatus.REVIEW_REQUIRED : ExtractionStatus.EXTRACTED,
        reviewStatus: ReviewStatus.READY,
        reviewReasons: doc.review_reasons || [],
        quantityOrderedStatus: (doc.quantity_ordered === null || doc.quantityOrdered === null) ? FieldStatus.NOT_FOUND : FieldStatus.CLEAR,
        quantityReceivedStatus: (doc.quantity_received === null || doc.quantityReceived === null) ? FieldStatus.NOT_FOUND : FieldStatus.CLEAR,
        humanCorrectedFields: [],
        reviewedBy: null,
        reviewedAt: null,
        validationIssues: [],
        metadata: {
          model_name: modelInfo?.model_name || job.model_name || "gemini-3.6-flash",
          model_config_version: modelInfo?.model_config_version || job.model_config_version || "2026-08",
          extraction_timestamp: new Date().toISOString()
        }
      };

      grn = calculateGRNFields(grn);
      const validationIssues = validateGRN(grn, state.grnRecords);
      grn.validationIssues = validationIssues;
      
      const allReasons = Array.from(new Set([...(grn.reviewReasons || []), ...validationIssues]));
      grn.reviewReasons = allReasons;
      grn.reviewStatus = allReasons.length > 0 ? ReviewStatus.REVIEW_REQUIRED : ReviewStatus.READY;

      return grn;
    });

    const uniqueMap = new Map<string, GRNData>();
    mappedRecords.forEach(r => {
      const isFake = !r.grnNumber && !r.poNumber && !r.supplierName && r.quantityReceived === null;
      if (!isFake) uniqueMap.set(r.sourceRecordKey, r);
    });
    const finalRecords = Array.from(uniqueMap.values());

    if (finalRecords.length === 0) return;

    for (const r of finalRecords) {
      await saveRecord("grnRecords", r);
    }

    setState(prev => {
      const recordsByKey = new Map<string, GRNData>(prev.grnRecords.map(r => [r.sourceRecordKey, r]));
      finalRecords.forEach(r => recordsByKey.set(r.sourceRecordKey, r));
      let newGrnRecords = Array.from(recordsByKey.values()).sort((a, b) => a.sourcePageNumber - b.sourcePageNumber);
      
      const newJobs = prev.grnJobs.map(j => {
        if (j.id === job.id) {
          const committedCount = newGrnRecords.filter(r => r.jobId === job.id).length;
          const isComplete = committedCount === (j.totalPageCount || 0);
          
          const nextStatus = isComplete ? ExtractionStatus.COMPLETED : j.status;

          return {
            ...j,
            status: nextStatus,
            extractedCount: committedCount,
            successful_pages: committedCount,
            failed_pages_count: (j.totalPageCount || 0) - committedCount,
            currentStep: isComplete ? "Scan Complete" : j.currentStep,
            processingCompleted: isComplete,
            elapsedTime: Date.now() - (j.startTime || Date.now()),
            completed_at: isComplete ? new Date().toISOString() : j.completed_at,
            model_name: modelInfo?.model_name || j.model_name,
            model_config_version: modelInfo?.model_config_version || j.model_config_version
          };
        }
        return j;
      });

      return { ...prev, grnRecords: newGrnRecords, grnJobs: newJobs };
    });
    
    addAudit(job.id, "GRN_RECORDS_COMMITTED", ExtractionStatus.EXTRACTING, ExtractionStatus.EXTRACTED, `Committed ${finalRecords.length} GRN records`);
  };

  const processJob = async (job: ProcessingJob, forceFresh: boolean = false, retryPages?: number[]) => {
    const isRetry = job.status === ExtractionStatus.FAILED || job.status === ExtractionStatus.TIMED_OUT || job.status === ExtractionStatus.REPROCESS_REQUIRED || job.status === ExtractionStatus.PARTIALLY_COMPLETED || !!retryPages;
    const isResume = job.status === ExtractionStatus.PAUSED_QUOTA && !forceFresh;

    if (isRetry) {
      addAudit(job.id, job.type === 'PO' ? "PO_EXTRACTION_RETRIED" : "GRN_EXTRACTION_RETRIED", job.status, "EXTRACTING", `Retrying ${job.type} extraction using gemini-3.6-flash${retryPages ? ` for pages: ${retryPages.join(', ')}` : ''}`);
    }

    if (!forceFresh && !isRetry && !isResume && (job.processingStarted || job.processingCompleted) && job.status !== ExtractionStatus.PARTIALLY_COMPLETED) return;

    const updateJob = (updates: Partial<ProcessingJob>) => {
      setState(prev => {
        const jobs = job.type === 'PO' ? [...prev.poJobs] : [...prev.grnJobs];
        const idx = jobs.findIndex(j => j.id === job.id);
        if (idx !== -1) {
          jobs[idx] = { ...jobs[idx], ...updates };
        }
        return job.type === 'PO' ? { ...prev, poJobs: jobs } : { ...prev, grnJobs: jobs };
      });
    };

    let fileToProcess = job.file;
    if (!fileToProcess && job.sourceFileHash) {
      const storedBlob = await getFile(job.sourceFileHash);
      if (storedBlob) {
        fileToProcess = new File([storedBlob], job.fileName, { type: job.fileType });
      }
    }

    if (!fileToProcess) {
      updateJob({ status: ExtractionStatus.FAILED, error: "Source file not found." });
      return;
    }

    try {
      updateJob({ currentStep: "VALIDATING_PDF", status: ExtractionStatus.QUEUED });
      const arrayBuffer = await fileToProcess.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const totalPages = pdfDoc.getPageCount();
      updateJob({ totalPageCount: totalPages, processingStarted: true, startTime: Date.now(), started_at: new Date().toISOString() });

      // Determine pages to extract
      // Use stateRef to ensure we have the latest committed records
      const committed = new Set((job.type === 'PO' ? stateRef.current.poRecords : stateRef.current.grnRecords)
        .filter(r => r.jobId === job.id && r.sourceFileHash === job.sourceFileHash)
        .map(r => r.sourcePageNumber));
      
      let pagesToExtract: number[] = [];
      if (retryPages && retryPages.length > 0) {
        pagesToExtract = retryPages;
      } else if (forceFresh) {
        pagesToExtract = Array.from({ length: totalPages }, (_, i) => i + 1);
      } else {
        pagesToExtract = Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => !committed.has(p));
      }

      if (pagesToExtract.length === 0) {
        updateJob({ status: ExtractionStatus.COMPLETED, currentStep: "Scan Complete" });
        return;
      }

      // Add to global task queue
      const tasks = pagesToExtract.map(pageNum => ({
        jobId: job.id,
        pageNumber: pageNum,
        type: job.type,
        attempts: 0
      }));

      // Prevent adding duplicate tasks for same job/page if already in queue
      const existingTaskKeys = new Set(extractionTaskQueue.current.map(t => `${t.jobId}:${t.pageNumber}`));
      const newTasks = tasks.filter(t => !existingTaskKeys.has(`${t.jobId}:${t.pageNumber}`));

      const wasEmpty = extractionTaskQueue.current.length === 0;
      extractionTaskQueue.current = [...extractionTaskQueue.current, ...newTasks];
      
      // If it was empty, nudge the worker by allowing immediate start if idle
      if (wasEmpty && Date.now() - lastRequestTime.current > 15000) {
        lastRequestTime.current = 0; 
      }

      updateJob({ 
        currentStep: `Queued ${pagesToExtract.length} pages for processing.`,
        status: ExtractionStatus.QUEUED 
      });

    } catch (err: any) {
      updateJob({ status: ExtractionStatus.FAILED, error: err.message });
    }
  };

  const handleExtractionResults = async (job: ProcessingJob, rawRecords: any[], totalPageCount: number, updateJob: (updates: Partial<ProcessingJob>) => void) => {
    if (job.type === 'PO') {
      await commitExtractedPurchaseOrders(job, rawRecords);
    } else {
      await commitExtractedGrns(job, rawRecords);
    }
  };

  const handleDeleteJob = async (type: 'PO' | 'GRN', id: string) => {
    const job = (type === 'PO' ? state.poJobs : state.grnJobs).find(j => j.id === id);
    if (!job) return;

    if (type === 'PO') {
      const recordsToDelete = state.poRecords.filter(r => r.jobId === id || r.sourceFileHash === job.sourceFileHash);
      for (const r of recordsToDelete) await deleteRecord("poRecords", r.poRecordId);
      await deleteRecord("poJobs", id);
      
      // Cascade file delete if no other jobs use it
      const otherJobsWithHash = [...state.poJobs, ...state.grnJobs].filter(j => j.id !== id && j.sourceFileHash === job.sourceFileHash);
      if (otherJobsWithHash.length === 0) {
        await deleteRecord("files", job.sourceFileHash);
        setAvailableFileHashes(prev => {
          const next = new Set(prev);
          next.delete(job.sourceFileHash);
          return next;
        });
      }

      setState(prev => ({
        ...prev,
        poJobs: prev.poJobs.filter(j => j.id !== id),
        poRecords: prev.poRecords.filter(r => r.jobId !== id && r.sourceFileHash !== job.sourceFileHash)
      }));
    } else {
      const recordsToDelete = state.grnRecords.filter(r => r.jobId === id || r.sourceFileHash === job.sourceFileHash);
      for (const r of recordsToDelete) await deleteRecord("grnRecords", r.grnRecordId);
      await deleteRecord("grnJobs", id);

      // Cascade file delete
      const otherJobsWithHash = [...state.poJobs, ...state.grnJobs].filter(j => j.id !== id && j.sourceFileHash === job.sourceFileHash);
      if (otherJobsWithHash.length === 0) {
        await deleteRecord("files", job.sourceFileHash);
        setAvailableFileHashes(prev => {
          const next = new Set(prev);
          next.delete(job.sourceFileHash);
          return next;
        });
      }

      setState(prev => ({
        ...prev,
        grnJobs: prev.grnJobs.filter(j => j.id !== id),
        grnRecords: prev.grnRecords.filter(r => r.jobId !== id && r.sourceFileHash !== job.sourceFileHash)
      }));
    }
  };

  const resetStep3Data = async () => {
    const prevCount = state.importedInvoiceRecords.length;
    const prevFile = state.app1ImportSummary?.fileName || "N/A";

    step3GenerationRef.current++;

    // 1. Clear Persistence (IndexedDB)
    localStorage.setItem(INVOICE_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(MATCH_RESULTS_STORAGE_KEY, JSON.stringify([]));
    await saveRecord("appState", { id: "importSummary", data: null });
    await saveRecord("appState", { id: "step3DetectedHeader", data: null });
    await saveRecord("appState", { id: "step3Search", data: "" });
    await saveRecord("appState", { id: "step3GroupBy", data: "PO" });
    await saveRecord("appState", { id: "step3SortBy", data: "PO" });

    if (state.app1ImportSummary?.workbookFileHash) {
      const hash = state.app1ImportSummary.workbookFileHash;
      await deleteRecord("files", hash);
      setAvailableFileHashes(prev => {
        const next = new Set(prev);
        next.delete(hash);
        return next;
      });
    }

    // 2. Clear React State
    setState(prev => ({
      ...prev,
      importedInvoiceRecords: [],
      skippedInvoiceRows: [],
      app1ImportSummary: null,
      step3State: { 
        importStatus: "IDLE",
        workbookFilename: undefined,
        worksheetSelected: undefined,
        importedAt: undefined
      },
      // Remove match results that came from invoices
      matchResults: prev.matchResults.filter(m => !m.invoiceRecordId.startsWith("INV_"))
    }));

    setStep3GroupBy("PO_REFERENCE");
    setStep3SortBy("PO_NUMBER_ASC");
    setStep3Search("");

    setExcelPreview(null);
    setStep3Error(null);
    setImportStatus("IDLE");
    setIsResetStep3ModalOpen(false);

    // Reset file input so the same file can be uploaded again
    if (step3WorkbookInputRef.current) {
      step3WorkbookInputRef.current.value = "";
    }

    // 3. Add Audit Entry
    addAuditEntry({
      step_number: 3,
      action_type: "STEP_3_DATA_RESET",
      decision: "SUCCESS",
      decision_reason: `Step 3 data was reset successfully. Madam Lim removed ${prevCount} invoices from workbook: ${prevFile}.`,
      source_filename: prevFile
    });

    // 4. Show success message
    setStep3SuccessMessage("Step 3 data was reset successfully. Upload an App 1 workbook to continue.");
    setTimeout(() => setStep3SuccessMessage(null), 5000);
  };

  const handleResetStep = async (step: number) => {
    if (step === 1) {
      showConfirm(
        "Reset Step 1 Data",
        "This will remove the uploaded Purchase Order files and all extracted PO records from this browser. It will not affect Steps 2 or 3. Continue?",
        async () => {
          const hashes = new Set(state.poJobs.map(j => j.sourceFileHash).filter((h): h is string => !!h));
          await clearStore("poJobs");
          await clearStore("poRecords");
          localStorage.removeItem(PO_STORAGE_KEY);
          
          for (const h of Array.from(hashes)) {
            if (!state.grnJobs.some(j => j.sourceFileHash === h)) {
              await deleteRecord("files", h as string);
              setAvailableFileHashes(prev => {
                const next = new Set(prev);
                next.delete(h as string);
                return next;
              });
            }
          }
          
          setState(prev => ({ ...prev, poJobs: [], poRecords: [] }));
        }
      );
    } else if (step === 2) {
      showConfirm(
        "Reset Step 2 Data",
        "This will remove all uploaded Goods Received Notes and extracted GRN records. Continue?",
        async () => {
          const hashes = new Set(state.grnJobs.map(j => j.sourceFileHash).filter((h): h is string => !!h));
          await clearStore("grnJobs");
          await clearStore("grnRecords");
          localStorage.removeItem(GRN_STORAGE_KEY);
          
          for (const h of Array.from(hashes)) {
            if (!state.poJobs.some(j => j.sourceFileHash === h)) {
              await deleteRecord("files", h as string);
              setAvailableFileHashes(prev => {
                const next = new Set(prev);
                next.delete(h as string);
                return next;
              });
            }
          }
          
          setState(prev => ({ ...prev, grnJobs: [], grnRecords: [] }));
        }
      );
    } else if (step === 3) {
      setIsResetStep3ModalOpen(true);
    }
  };

  const [importStatus, setImportStatus] = useState<"IDLE" | "READING_WORKBOOK" | "FAILED" | "IMPORTED">("IDLE");
  const [step3Error, setStep3Error] = useState<string | null>(null);

  const openStep3WorkbookPicker = () => {
    const input = step3WorkbookInputRef.current;
    if (!input) {
      setStep3Error("The workbook selector could not be opened.");
      return;
    }
    input.value = "";
    input.click();
  };

  async function handleStep3WorkbookSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    try {
      setStep3Error(null);
      setImportStatus("READING_WORKBOOK");

      const filename = String(file.name ?? "").trim();
      const lowercaseFilename = filename.toLowerCase();

      const validFile = lowercaseFilename.endsWith(".xlsx") || lowercaseFilename.endsWith(".xls");

      if (!validFile) {
        throw new Error("Upload an Excel workbook in XLSX or XLS format.");
      }

      const arrayBuffer = await file.arrayBuffer();
      await handleInvoiceImport(file, arrayBuffer);
    } catch (error) {
      setImportStatus("FAILED");
      setStep3Error(error instanceof Error ? error.message : "The App 1 workbook could not be imported.");
    } finally {
      input.value = "";
    }
  }

  const handleResetStep3 = () => {
    setIsResetStep3ModalOpen(true);
  };

  const handleInvoiceImport = async (file: File, arrayBuffer?: ArrayBuffer) => {
    const parseGeneration = step3GenerationRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = arrayBuffer || await file.arrayBuffer();
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: true,
        raw: false
      });

      if (parseGeneration !== step3GenerationRef.current) return;

      const approvedSheetName = workbook.SheetNames.find(
        name => String(name ?? "").trim().toUpperCase() === "APPROVED INVOICE"
      );

      if (!approvedSheetName) {
        throw new Error("The Approved Invoice worksheet could not be found.");
      }

      const worksheet = workbook.Sheets[approvedSheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        range: 6,
        defval: null,
        blankrows: false,
        raw: false
      }) as unknown[][];

      const dataRows = rows.slice(1);

      const parseNullableNumber = (value: any): number | null => {
        if (value === null || value === undefined || String(value).trim() === "") {
          return null;
        }
        const parsed = Number(String(value).replace(/[$,\s]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const normaliseStatus = (value: unknown): string =>
        String(value ?? "")
          .trim()
          .toUpperCase()
          .replace(/[_-]+/g, " ")
          .replace(/\s+/g, " ");

      const acceptedStatuses = new Set([
        "READY FOR APP 2",
        "READY FOR 3 WAY MATCH",
        "APPROVED",
        "APPROVED FOR APP 2"
      ]);

      const mappedInvoices = dataRows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row, index) => ({
          sourceStatus: String(row[0] ?? "").trim(),
          checkResult: String(row[1] ?? "").trim(),
          supplierName: String(row[2] ?? "").trim(),
          invoiceNumber: String(row[3] ?? "").trim(),
          invoiceDate: String(row[4] ?? "").trim(),
          dueDate: String(row[5] ?? "").trim(),
          poReference: String(row[6] ?? "").trim(),
          currency: String(row[7] ?? "SGD").trim(),
          subtotal: parseNullableNumber(row[8]),
          taxAmount: parseNullableNumber(row[9]),
          totalAmount: parseNullableNumber(row[10]),
          fileFormat: String(row[11] ?? "").trim(),
          documentStyle: String(row[12] ?? "").trim(),
          sourceFilename: String(row[13] ?? "").trim(),
          approvalType: String(row[14] ?? "").trim(),
          approvedBy: String(row[15] ?? "").trim(),
          approvalDate: String(row[16] ?? "").trim(),
          reviewNotes: String(row[17] ?? "").trim(),
          recordId: String(row[18] ?? "").trim(),
          sourceSheet: "Approved Invoice",
          sourceRowNumber: index + 8,
          lineItems: [],
          hasLineItems: false,
          lineItemStatus: "NOT_INCLUDED_IN_APP1_EXPORT",
          importStatus: "READY_FOR_3_WAY_MATCH"
        }));

      const acceptedInvoices = mappedInvoices.filter(invoice => {
        const status = normaliseStatus(invoice.sourceStatus);
        const hasRequiredFields =
          invoice.supplierName.length > 0 &&
          invoice.invoiceNumber.length > 0 &&
          invoice.poReference.length > 0 &&
          invoice.totalAmount !== null;
        return acceptedStatuses.has(status) && hasRequiredFields;
      });

      const finalInvoicePresent = acceptedInvoices.some(
        invoice =>
          invoice.invoiceNumber === "RF-2026-211" &&
          invoice.poReference === "PO-2026-012"
      );

      const importedInvoicesMap = new Map<string, InvoiceData>();
      const skippedRows: SkippedRecord[] = [];

      acceptedInvoices.forEach(inv => {
        const dedupKey = inv.recordId || `${normaliseSupplier(inv.supplierName)}|${normaliseInvoiceNumber(inv.invoiceNumber)}`;
        
        const invoice: InvoiceData = {
          record_id: inv.recordId || `INV_${normaliseSupplier(inv.supplierName)}_${normaliseInvoiceNumber(inv.invoiceNumber)}_${normalisePOReference(inv.poReference)}`,
          status: "READY_FOR_3_WAY_MATCH",
          check_result: inv.checkResult || "READY",
          supplier_name: inv.supplierName,
          invoice_number: inv.invoiceNumber,
          invoice_date: inv.invoiceDate,
          due_date: inv.dueDate,
          po_number: inv.poReference,
          currency: inv.currency,
          subtotal: inv.subtotal ?? inv.totalAmount ?? 0,
          tax_amount: inv.taxAmount ?? 0,
          total_amount: inv.totalAmount ?? 0,
          file_format: inv.fileFormat || "XLSX",
          document_style: inv.documentStyle || "LEGACY_EXPORT",
          source_filename: inv.sourceFilename || file.name,
          source_invoice_link: "",
          extraction_status: "COMPLETED",
          duplicate_status: "CLEAR",
          human_decision: null,
          approval_type: inv.approvalType || "NONE",
          approved_by: inv.approvedBy || "App 1 System",
          approval_date: inv.approvalDate || new Date().toISOString(),
          review_notes: inv.reviewNotes || "App 1 Approved Invoice Register",
          processing_status: inv.sourceStatus,
          lines: [],
          importIssues: [],
          hasLineItems: false,
          lineItemStatus: "NOT_INCLUDED_IN_APP1_EXPORT"
        };
        importedInvoicesMap.set(dedupKey, invoice);
      });

      const finalImportedInvoices = Array.from(importedInvoicesMap.values());

      if (parseGeneration !== step3GenerationRef.current) return;

      if (finalImportedInvoices.length === 0) {
        throw new Error("No approved invoices were extracted from the Approved Invoice worksheet.");
      }

      setExcelPreview({
        invoiceResult: {
          invoices: finalImportedInvoices,
          summary: {
            fileName: file.name,
            importTime: new Date().toISOString(),
            totalRows: rows.length,
            recordsRead: mappedInvoices.length,
            readyInvoicesCount: finalImportedInvoices.length,
            importedCount: finalImportedInvoices.length,
            linesCount: 0,
            skippedCount: mappedInvoices.length - acceptedInvoices.length,
            incompleteCount: 0,
            uniquePOs: new Set(finalImportedInvoices.map(inv => inv.po_number)).size,
            worksheetSelected: approvedSheetName,
            workbookFileHash: "manual_upload_" + Date.now(),
            parserVersion: APP1_IMPORT_PARSER_VERSION,
            structure: "APP1_APPROVED_INVOICE_LEGACY",
            registerFound: true,
            linesFound: false
          },
          skipped: skippedRows
        },
        filename: file.name,
        show: true
      });
    } catch (error) {
      setImportStatus("FAILED");
      setStep3Error(error instanceof Error ? error.message : "The App 1 workbook could not be imported.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAiExplanation = async (matchRecordId: string) => {
    const result = state.matchResults.find(r => r.matchRecordId === matchRecordId);
    if (!result) {
      setError("Run the three-way match before generating an explanation.");
      return;
    }

    const explanationPayload = {
      resultId: result.matchRecordId || null,
      deterministicStatus: result.deterministicStatus || result.status || null,
      humanReviewStatus: result.humanReviewStatus || null,
      holdReason: result.holdReason || null,
      supplierName: result.supplierName || null,
      invoiceNumber: result.invoiceNumber || null,
      poReference: result.poNumber || null,
      poQuantity: result.poQuantityOrdered ?? null,
      grnQuantityReceived: result.grnQuantityReceived ?? null,
      invoiceQuantity: result.invoiceQuantity ?? null,
      poUnitPrice: result.poUnitPrice ?? null,
      invoiceUnitPrice: result.invoiceUnitPrice ?? null,
      poTotal: result.expectedInvoiceAmount ?? null,
      invoiceTotal: result.actualInvoiceAmount || 0,
      grnCondition: result.grnCondition ?? null,
      grnNotes: result.grnCondition ?? null, // Fallback
      issues: Array.isArray(result.issues) ? result.issues : [],
      checksCompleted: result.checks ? Object.keys(result.checks).filter(k => (result.checks as any)[k] === CheckStatus.PASS) : [],
      checksNotCompleted: result.checks ? Object.keys(result.checks).filter(k => (result.checks as any)[k] !== CheckStatus.PASS) : [],
      financialImpact: result.potentialFinancialImpact ?? null,
      responsibleDepartment: result.assignedDepartment || "Accounts",
      recommendedActions: Array.isArray(result.issues) ? result.issues.map(i => i.recommendedAction) : [result.recommendedAction],
      approvalEligible: Boolean(result.autoApprove)
    };

    setState(prev => ({
      ...prev,
      matchResults: prev.matchResults.map(r => 
        r.matchRecordId === matchRecordId 
          ? { ...r, aiExplanationStatus: "GENERATING", aiExplanationError: null, aiExplanationTechDetails: null } 
          : r
      )
    }));

    addAudit(matchRecordId, "AI_EXPLANATION_REQUESTED", null, {
      invoice_number: result.invoiceNumber,
      po_number: result.poNumber
    }, "AI analysis requested for match result");

    try {
      const response = await fetch("/api/explain-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchResult: explanationPayload })
      });

      const data = await response.json();
      if (data.ok) {
        setState(prev => ({
          ...prev,
          matchResults: prev.matchResults.map(r => 
            r.matchRecordId === matchRecordId 
              ? { 
                  ...r, 
                  aiExplanationStatus: "SUCCESS", 
                  aiExplanation: data.explanation,
                  aiExplanationError: null
                } 
              : r
          )
        }));
        
        addAudit(matchRecordId, "AI_EXPLANATION_GENERATED", null, {
          invoice_number: result.invoiceNumber
        }, "AI analysis successfully generated");
      } else {
        throw new Error(data.error || data.message || "Failed to generate explanation");
      }
    } catch (err: any) {
      console.error("AI Generation Error:", err);
      setState(prev => ({
        ...prev,
        matchResults: prev.matchResults.map(r => 
          r.matchRecordId === matchRecordId 
            ? { 
                ...r, 
                aiExplanationStatus: "FAILED", 
                aiExplanationError: "Live AI explanation could not be generated. The rule-based explanation is shown instead.",
                aiExplanationTechDetails: {
                  endpoint: "/api/explain-match",
                  method: "POST",
                  status: 0,
                  errorCode: err.message || "UNKNOWN_ERROR",
                  requestId: `req-${Date.now()}`,
                  timestamp: new Date().toISOString()
                }
              } 
            : r
        )
      }));
    }
  };

  const handleHoldForReview = (result: MatchResult, reason: string, note?: string) => {
    const timestamp = new Date().toLocaleString();
    const user_name = user?.user_name || "Madam Lim";
    const fullReason = note ? `${reason}: ${note}` : reason;
    
    setState(prev => ({
      ...prev,
      matchResults: prev.matchResults.map(r => 
        r.matchRecordId === result.matchRecordId || getResultKey(r) === getResultKey(result)
          ? { 
              ...r, 
              humanReviewStatus: ApprovalStatus.ON_HOLD,
              holdReason: fullReason,
              holdTimestamp: timestamp,
              holdUser: user_name
            } 
          : r
      )
    }));

    addAudit(result.matchRecordId, "INVOICE_ON_HOLD", null, {
      invoice_number: result.invoiceNumber,
      po_number: result.poNumber,
      decision_reason: fullReason
    }, `Invoice ${result.invoiceNumber} placed on hold: ${fullReason}`);
  };

  const handleResolveReview = (
    result: MatchResult, 
    decision: "KEEP_ON_HOLD" | "APPROVE_AFTER_REVIEW", 
    justification: string, 
    passcode: string,
    supportingEvidence?: SupportingEvidence
  ) => {
    if (decision === "APPROVE_AFTER_REVIEW") {
      const timestamp = new Date().toLocaleString();
      const user_name = user?.user_name || "Madam Lim";

      // 1. Audit SUPPORTING_GRN_UPLOADED if evidence attached
      if (supportingEvidence) {
        addAuditEntry({
          step_number: 4,
          action_type: "SUPPORTING_GRN_UPLOADED",
          invoice_number: result.invoiceNumber,
          po_number: result.poNumber,
          grn_number: supportingEvidence.grnNumber || "GRN-2026-021",
          supplier_name: result.supplierName,
          source_filename: supportingEvidence.filename,
          decision: "EVIDENCE_ATTACHED",
          decision_reason: `Supporting GRN ${supportingEvidence.grnNumber || "GRN-2026-021"} uploaded (+${supportingEvidence.additionalQuantityReceived} units, ${supportingEvidence.condition}).`
        });
      }

      // 2. Audit HELD_INVOICE_REVIEWED and INVOICE_APPROVED_AFTER_REVIEW
      addAuditEntry({
        step_number: 4,
        action_type: "HELD_INVOICE_REVIEWED",
        invoice_number: result.invoiceNumber,
        po_number: result.poNumber,
        supplier_name: result.supplierName,
        decision: "APPROVED_AFTER_REVIEW",
        decision_reason: justification
      });

      addAuditEntry({
        step_number: 4,
        action_type: "INVOICE_APPROVED_AFTER_REVIEW",
        invoice_number: result.invoiceNumber,
        po_number: result.poNumber,
        supplier_name: result.supplierName,
        decision: "APPROVED",
        decision_reason: `Invoice approved after review by ${user_name}. Justification: ${justification}`
      });

      // 3. Update state - Preserve original match result history!
      const updatedResults = state.matchResults.map(r => {
        if (r.matchRecordId === result.matchRecordId || getResultKey(r) === getResultKey(result)) {
          const updatedEvidence = supportingEvidence 
            ? [...(r.supportingEvidence || []), supportingEvidence] 
            : r.supportingEvidence;

          return {
            ...r,
            humanReviewStatus: ApprovalStatus.RESOLVED,
            reviewResolution: "APPROVED_AFTER_REVIEW",
            approvalRecommendationStatus: "CONFIRMED_AFTER_REVIEW",
            approvalJustification: justification,
            approvalConfirmedBy: user_name,
            approvalConfirmedAt: timestamp,
            supportingEvidence: updatedEvidence,
            // Keep original deterministic status intact
          } as MatchResult;
        }
        return r;
      });

      setState(prev => ({ ...prev, matchResults: updatedResults }));
    }
  };

  const handleRemoveHold = (result: MatchResult) => {
    setState(prev => ({
      ...prev,
      matchResults: prev.matchResults.map(r => 
        r.matchRecordId === result.matchRecordId 
          ? { 
              ...r, 
              humanReviewStatus: undefined,
              holdReason: undefined,
              holdTimestamp: undefined,
              holdUser: undefined
            } 
          : r
      )
    }));

    addAudit(result.matchRecordId, "INVOICE_HOLD_REMOVED", null, {
      invoice_number: result.invoiceNumber
    }, `Hold removed for invoice ${result.invoiceNumber}`);
  };

  const runThreeWayMatch = () => {
    setIsLoading(true);
    const existingResults = state.matchResults;

    const results = state.importedInvoiceRecords.map(inv => {
      const newResult = performMatch(inv, state.poRecords, state.grnRecords, state.importedInvoiceRecords, state.matchResults);
      
      const isClean = newResult.deterministicStatus === MatchStatus.CLEAN_MATCH_FULLY_VERIFIED || 
                      newResult.deterministicStatus === MatchStatus.CLEAN_MATCH_HEADER_VERIFIED;
      const isOnHold = newResult.humanReviewStatus === "ON_HOLD";
      const isRejected = newResult.humanReviewStatus === "REJECTED";

      if (isClean && !isOnHold && !isRejected && !newResult.approvalRecommendationStatus) {
        newResult.approvalRecommendationStatus = "CONFIRMED";
        newResult.approvalType = "AUTO_APPROVED_CLEAN_MATCH";
        newResult.approvedBy = "SYSTEM — CLEAN MATCH";
        newResult.approvedAt = new Date().toISOString();
        newResult.humanDecision = "APPROVE_FOR_PAYMENT";
      }
      return newResult;
    });

    setState(prev => ({ ...prev, matchResults: results, hasRunMatch: true }));
    setLastRunTimestamp(new Date().toLocaleString());
    setIsMatchCompleteModalOpen(true);
    
    addAuditEntry({
      step_number: 4,
      action_type: "THREE_WAY_MATCH_RUN",
      decision: "SUCCESS",
      decision_reason: `Three-way match performed across ${state.importedInvoiceRecords.length} invoices. Clean matches auto-approved.`
    });

    addAuditEntry({
      step_number: 4,
      action_type: "CLEAN_MATCH_AUTO_APPROVED",
      decision: "SUCCESS",
      decision_reason: `Genuine clean matches automatically approved by system.`
    });
    
    setIsLoading(false);
  };

  const verifyPasscode = async (passcode: string) => {
    const res = await fetch("/api/verify-passcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode })
    });
    const data = await res.json();
    if (data.success) {
      setState(prev => ({ ...prev, isAuthorised: true }));
      return true;
    }
    return false;
  };

  const downloadExcel = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/export-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pos: state.poRecords,
          grns: state.grnRecords,
          invoices: state.importedInvoiceRecords,
          matchResults: state.matchResults
        })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Boon_Huat_Three_Way_Match_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
    } catch (err: any) {
      setError("Failed to download Excel");
    } finally {
      setIsLoading(false);
    }
  };

  const isStepComplete = (step: number) => {
    if (step === 1) return activePoRecords.length > 0;
    if (step === 2) return activeGrnRecords.length > 0;
    if (step === 3) return state.importedInvoiceRecords.length > 0;
    if (step === 4) return state.matchResults.length > 0;
    return false;
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-6">
          <RefreshCcw className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Checking Microsoft sign-in...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen 
        onLogin={handleLogin} 
        authStatus={authStatus}
      />
    );
  }

  if (isSessionLocked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">SESSION EXPIRED</h2>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              “You were signed out after 5 minutes of inactivity to protect Accounts Payable information.”
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => {
                setIsSessionLocked(false);
                handleLogout();
              }}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all"
            >
              SIGN IN AGAIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-[#F4F6FA] text-[#111827]">
        {/* Sidebar */}
        <Sidebar 
          activeScreen={activeScreen}
          onNavigate={handleNavigate}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        {/* Right Main Container */}
        <div className="flex-1 ml-0 md:ml-60 flex flex-col min-h-screen min-w-0">
          {/* Header */}
          <Header 
            activeScreen={activeScreen}
            user={user}
            onNavigate={handleNavigate}
            onLogout={handleLogout}
            onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)}
          />

          {/* Main Content Area */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <AnimatePresence mode="wait">
          {activeScreen === "DASHBOARD" && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <Dashboard 
                state={state} 
                auditTrail={auditTrailData} 
                reports={reportsData}
                onNavigate={handleNavigate}
                step1Status={getStep1Status()}
                step2Status={getStep2Status()}
                step3Status={getStep3Status()}
                step4Status={getStep4Status()}
                onReviewItem={(type, id) => setReviewItem({ type, id })}
              />
            </motion.div>
          )}

          {(activeScreen === "WORKFLOW" || activeScreen.startsWith("STEP")) && (
            <motion.div key="workflow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <WorkflowStepper 
                currentStep={workflowStep}
                onSelectStep={(step) => {
                  setWorkflowStep(step);
                  setState(prev => ({ ...prev, currentStep: step }));
                }}
                step1Status={getStep1Status()}
                step2Status={getStep2Status()}
                step3Status={getStep3Status()}
                step4Status={getStep4Status()}
              />

              {/* Global Error Banner */}
              {error && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-4 shadow-sm">
                  <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                  <div>
                    <h3 className="text-red-900 font-bold text-sm">Action Failed</h3>
                    <p className="text-red-700 text-sm mt-1">{error}</p>
                  </div>
                  <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
                </motion.div>
              )}

              <AnimatePresence mode="wait">
          {(workflowStep === 1 || activeScreen === "STEP1") && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <SectionHeader title="Step 1 – Purchase Orders" description="Load and validate the Purchase Order reference records." />
              
              {!excelPreview?.show || !excelPreview.poResult ? (
                <div className="space-y-4">
                  <div className="flex bg-slate-100 p-1 rounded-lg w-max">
                      <button onClick={() => setPoImportMode('EXCEL')} className={cn("px-4 py-2 text-sm font-bold rounded-md", poImportMode === 'EXCEL' ? "bg-white shadow-sm" : "text-slate-500")}>Excel Import</button>
                      <button onClick={() => setPoImportMode('DATABASE')} className={cn("px-4 py-2 text-sm font-bold rounded-md", poImportMode === 'DATABASE' ? "bg-white shadow-sm" : "text-slate-500")}>Database Import</button>
                  </div>
                  <ExcelUploadCard 
                    title={poImportMode === 'EXCEL' ? "UPLOAD PURCHASE ORDER DATA" : "UPLOAD PO DATABASE"}
                    subtitle={poImportMode === 'EXCEL' ? "Upload Boon Huat’s structured Purchase Order reference database." : "Upload Boon Huat’s consolidated PO database file."}
                    uploadText={poImportMode === 'EXCEL' ? "UPLOAD PURCHASE ORDER DATA" : "UPLOAD PO DATABASE"}
                    supportingText={poImportMode === 'EXCEL' ? "Upload Boon Huat’s structured Purchase Order reference database." : "Upload Boon Huat’s consolidated PO database file."}
                    buttonText={poImportMode === 'EXCEL' ? "SELECT PURCHASE ORDER DATA" : "SELECT PO DATABASE"}
                    onExcelUpload={(files) => handleFileUpload('PO', files)}
                    onPdfUpload={(files) => handleSupportFileUpload('PO', files)}
                    isLoading={isLoading}
                    onReset={() => handleResetStep(1)}
                    step={1}
                  />
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tighter">PURCHASE ORDER IMPORT PREVIEW: {excelPreview.filename}</h3>
                      <p className="text-sm text-slate-500 font-medium">Worksheet: {excelPreview.poResult.sheetName}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setExcelPreview(null)}
                        className="px-6 py-2 border border-slate-200 rounded font-bold hover:bg-slate-50 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={commitExcelImport}
                        className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 text-sm flex items-center gap-2"
                      >
                        <FileCheck className="w-4 h-4" /> Confirm Import
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 mt-2">
                     <SummaryCard label="Rows Detected" value={excelPreview.poResult.rowCount} color="indigo" />
                     <SummaryCard label="Valid Records" value={excelPreview.poResult.valid.length} color="emerald" />
                     <SummaryCard label="Review Required" value={excelPreview.poResult.review.length} color="amber" />
                     <SummaryCard label="Rejected" value={excelPreview.poResult.rejected.length} color="rose" />
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard label="Data Files Processed" value={state.poJobs.length > 0 ? 1 : 0} color="indigo" />
                <SummaryCard label="POs Extracted" value={activePoRecords.length} color="emerald" />
                <SummaryCard label="Review Required" value={activePoRecords.filter(p => p.extractionStatus === ExtractionStatus.REVIEW_REQUIRED).length} color="rose" />
              </div>

              {state.poJobs.length > 0 && (
                <div className="bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold flex items-center gap-2"><RefreshCcw className="w-5 h-5 text-blue-600" /> PO Processing Queue ({state.poJobs.length})</h3>
                  </div>
                  <ProcessingTable 
                    jobs={state.poJobs} 
                    grnRecords={state.grnRecords}
                    poRecords={state.poRecords}
                    onRetry={processJob} 
                    onDelete={(id) => handleDeleteJob('PO', id)} 
                    isPaused={isProcessingPaused}
                    onPause={() => setIsProcessingPaused(true)}
                    onResume={() => setIsProcessingPaused(false)}
                    quotaCooldown={globalQuotaCooldown}
                  />
                </div>
              )}

              <div className="bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600" /> Extracted Purchase Orders ({activePoRecords.length})</h3>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" placeholder="Search POs..." className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                  </div>
                </div>
                {activePoRecords.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-medium italic">No Purchase Orders have been extracted yet.</div>
                ) : (
                    <POTable 
                      pos={activePoRecords.filter(p => p.poNumber?.includes(searchTerm) || p.supplierName?.includes(searchTerm))} 
                      onReview={(id) => setReviewItem({ type: 'PO', id })} 
                      onDelete={async (id) => {
                        await deleteRecord("poRecords", id);
                        setState(prev => ({ ...prev, poRecords: prev.poRecords.filter(p => p.poRecordId !== id) }));
                      }}
                    />
                )}
              </div>

              <div className="flex items-center justify-between pt-6">
                <div>
                  {validPoCount === 0 && (
                    <div className="px-4 py-3 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>No valid Purchase Orders are currently loaded. You may continue to Step 2, but Step 4 cannot complete matching until PO data is available.</span>
                    </div>
                  )}
                </div>
                <button 
                  type="button"
                  onClick={() => handleNavigate("goods-received-notes")} 
                  className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 group shrink-0"
                >
                  Proceed to Step 2 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {(workflowStep === 2 || activeScreen === "STEP2") && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <SectionHeader title="Step 2 – Goods Received Notes" description="Load and validate the Goods Received Note reference records." />
              
              {!excelPreview?.show || !excelPreview.grnResult ? (
                <div className="space-y-4">
                  <div className="flex bg-slate-100 p-1 rounded-lg w-max">
                      <button onClick={() => setGrnImportMode('EXCEL')} className={cn("px-4 py-2 text-sm font-bold rounded-md", grnImportMode === 'EXCEL' ? "bg-white shadow-sm" : "text-slate-500")}>Excel Import</button>
                      <button onClick={() => setGrnImportMode('DATABASE')} className={cn("px-4 py-2 text-sm font-bold rounded-md", grnImportMode === 'DATABASE' ? "bg-white shadow-sm" : "text-slate-500")}>Database Import</button>
                  </div>
                  <ExcelUploadCard 
                    title={grnImportMode === 'EXCEL' ? "UPLOAD GOODS RECEIVED NOTE DATA" : "UPLOAD GRN DATABASE"}
                    subtitle={grnImportMode === 'EXCEL' ? "Upload Boon Huat’s structured warehouse receiving database." : "Upload Boon Huat’s consolidated GRN database file."}
                    uploadText={grnImportMode === 'EXCEL' ? "UPLOAD GOODS RECEIVED NOTE DATA" : "UPLOAD GRN DATABASE"}
                    supportingText={grnImportMode === 'EXCEL' ? "Upload Boon Huat’s structured warehouse receiving database." : "Upload Boon Huat’s consolidated GRN database file."}
                    buttonText={grnImportMode === 'EXCEL' ? "SELECT GRN DATA" : "SELECT GRN DATABASE"}
                    onExcelUpload={(files) => handleFileUpload('GRN', files)}
                    onPdfUpload={(files) => handleSupportFileUpload('GRN', files)}
                    isLoading={isLoading}
                    onReset={() => handleResetStep(2)}
                    step={2}
                  />
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tighter">GRN IMPORT PREVIEW: {excelPreview.filename}</h3>
                      <p className="text-sm text-slate-500 font-medium">Worksheet: {excelPreview.grnResult.sheetName}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setExcelPreview(null)}
                        className="px-6 py-2 border border-slate-200 rounded font-bold hover:bg-slate-50 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={commitExcelImport}
                        className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 text-sm flex items-center gap-2"
                      >
                        <FileCheck className="w-4 h-4" /> Confirm Import
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 mt-2">
                     <SummaryCard label="Rows Detected" value={excelPreview.grnResult.rowCount} color="indigo" />
                     <SummaryCard label="Valid Records" value={excelPreview.grnResult.valid.length} color="emerald" />
                     <SummaryCard label="Review Required" value={excelPreview.grnResult.review.length} color="amber" />
                     <SummaryCard label="Rejected" value={excelPreview.grnResult.rejected.length} color="rose" />
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard label="Data Files Processed" value={state.grnJobs.length > 0 ? 1 : 0} color="indigo" />
                <SummaryCard label="GRNs Extracted" value={activeGrnRecords.length} color="emerald" />
                <SummaryCard label="Review Required" value={activeGrnRecords.filter(isGRNReviewRequired).length} color="rose" />
              </div>

              {state.grnJobs.length > 0 && (
                <div className="bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold flex items-center gap-2"><RefreshCcw className="w-5 h-5 text-blue-600" /> GRN Processing Queue ({state.grnJobs.length})</h3>
                  </div>
                  <ProcessingTable 
                    jobs={state.grnJobs} 
                    grnRecords={state.grnRecords}
                    poRecords={state.poRecords}
                    onRetry={processJob} 
                    onDelete={(id) => handleDeleteJob('GRN', id)} 
                    isPaused={isProcessingPaused}
                    onPause={() => setIsProcessingPaused(true)}
                    onResume={() => setIsProcessingPaused(false)}
                    quotaCooldown={globalQuotaCooldown}
                  />
                </div>
              )}

              <div className="bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-amber-600" /> Extracted Goods Received Notes ({activeGrnRecords.length})</h3>
                  {activeGrnRecords.length > 0 && state.grnJobs.length > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Showing {activeGrnRecords.length} unique GRNs.
                    </span>
                  )}
                  {activeGrnRecords.length === 0 && state.grnJobs.length === 0 && (
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">No Goods Received Notes have been uploaded.</span>
                  )}
                </div>
                {activeGrnRecords.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-medium italic">No Goods Received Notes have been extracted yet.</div>
                ) : (
                  <GRNTableRefactored 
                    grns={activeGrnRecords} 
                    onReview={(id) => setReviewItem({ type: 'GRN', id })} 
                    onDelete={async (id) => {
                      await deleteRecord("grnRecords", id);
                      setState(prev => ({ ...prev, grnRecords: prev.grnRecords.filter(g => g.grnRecordId !== id) }));
                    }}
                  />
                )}
              </div>

              <div className="flex justify-between items-center pt-6">
                <button 
                  type="button" 
                  onClick={() => handleNavigate("purchase-orders")} 
                  className="px-6 py-3 border-2 border-slate-900 rounded font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-all shrink-0"
                >
                  Back
                </button>
                <div className="flex items-center gap-4">
                  {validGrnCount === 0 && (
                    <div className="px-4 py-3 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>No valid Goods Received Notes are currently loaded. You may continue to Step 3, but Step 4 cannot complete matching until GRN data is available.</span>
                    </div>
                  )}
                  <button 
                    type="button" 
                    onClick={() => handleNavigate("import-invoices")} 
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 group shrink-0"
                  >
                    Proceed to Step 3 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {(workflowStep === 3 || activeScreen === "STEP3") && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <SectionHeader title="Step 3 – Import App 1 Invoices" description="Upload the Excel workbook produced by App 1. Only invoices ready for three-way matching will be imported." />
              
              {step3SuccessMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm font-bold shadow-sm"
                >
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{step3SuccessMessage}</span>
                </motion.div>
              )}

              <Step3InvoiceSection
                invoices={state.importedInvoiceRecords}
                summary={state.app1ImportSummary}
                skippedRows={state.skippedInvoiceRows}
                isLoading={isLoading}
                onReset={handleResetStep3}
                onUploadClick={openStep3WorkbookPicker}
                importStatus={importStatus}
                importError={step3Error}
                excelPreview={excelPreview}
                setExcelPreview={setExcelPreview}
                commitExcelImport={commitExcelImport}
                sortBy={step3SortBy}
                setSortBy={setStep3SortBy}
                groupBy={step3GroupBy}
                setGroupBy={setStep3GroupBy}
                searchTerm={step3Search}
                setSearchTerm={setStep3Search}
              />

              <input 
                ref={step3WorkbookInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleStep3WorkbookSelected}
                className="hidden"
              />

              <div className="flex justify-between items-center pt-6">
                <button 
                  type="button" 
                  onClick={() => handleNavigate("goods-received-notes")} 
                  className="px-6 py-3 border-2 border-slate-900 rounded font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-all shrink-0"
                >
                  Back
                </button>
                <div className="flex items-center gap-4">
                  {validInvoiceCount === 0 && (
                    <div className="px-4 py-3 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>No approved App 1 invoices are currently loaded. You may continue to Step 4, but matching cannot run until invoice records are imported.</span>
                    </div>
                  )}
                  <button 
                    type="button" 
                    onClick={() => handleNavigate("three-way-match")} 
                    className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 group shrink-0"
                  >
                    Proceed to Step 4 <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {(workflowStep === 4 || activeScreen === "STEP4") && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10">
              <SectionHeader title="Step 4 – Conduct Three-Way Match" description="Run the deterministic matching engine across Purchase Orders, Goods Received Notes, and Invoices." />
              
              <Step4MatchSection
                matchResults={state.matchResults}
                poRecords={state.poRecords}
                grnRecords={state.grnRecords}
                invoiceRecords={state.importedInvoiceRecords}
                isLoading={state.isMatching}
                hasRunMatch={state.hasRunMatch}
                lastRunTimestamp={state.lastRunTimestamp}
                onRunMatch={runThreeWayMatch}
                onDownloadExcel={() => {}}
                onHoldForReview={handleHoldForReview}
                onRemoveHold={handleRemoveHold}
                onResolveReview={handleResolveReview}
                approvalByResultKey={approvalByResultKey}
                approvalModalKey={approvalModalKey}
                setApprovalModalKey={setApprovalModalKey}
                approvalPasscode={approvalPasscode}
                setApprovalPasscode={setApprovalPasscode}
                approvalError={approvalError}
                setApprovalError={setApprovalError}
                submitApproval={submitApproval}
                closeApprovalModal={closeApprovalModal}
                aiStatusByKey={aiStatusByKey}
                aiTextByKey={aiTextByKey}
                aiErrorByKey={aiErrorByKey}
                generateAIExplanation={generateAIExplanation}
                getResultKey={getResultKey}
                onSendToApp3={handleSendToApp3}
                referenceDataHydrated={referenceDataHydrated}
                addAuditEntry={addAuditEntry}
                isMatchCompleteModalOpen={isMatchCompleteModalOpen}
                setIsMatchCompleteModalOpen={setIsMatchCompleteModalOpen}
              />
            </motion.div>
          )}
          </AnimatePresence>
        </motion.div>
      )}
          {activeScreen === "AUDIT" && (
            <motion.div key="audit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <AuditTrailScreen 
                trail={auditTrailData} 
                integrityWarning={integrityWarning} 
              />
            </motion.div>
          )}

          {activeScreen === "SETTINGS" && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SettingsScreen user={user} />
            </motion.div>
          )}

          {activeScreen === "PROFILE" && (
            <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ProfileScreen user={user} onLogout={handleLogout} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  </div>

      {/* Review Side Modal */}
      <ReviewModal 
        isOpen={!!reviewItem} 
        onClose={() => setReviewItem(null)} 
        onVerify={verifyPasscode}
        title={reviewItem?.type === 'MATCH' ? "Human Match Review" : "Document Extraction Review"}
      >
        {reviewItem?.type === 'PO' && (
          <POReview 
            data={state.poRecords.find(p => p.poRecordId === reviewItem.id)!} 
            onSave={async (updated) => {
              const po = state.poRecords.find(p => p.poRecordId === reviewItem.id)!;
              const newPo = { ...po, ...updated, validationIssues: validatePO({ ...po, ...updated }, state.poRecords) };
              const newPos = state.poRecords.map(p => p.poRecordId === reviewItem.id ? newPo : p);
              setState(prev => ({ ...prev, poRecords: newPos }));
              await saveRecord("poRecords", newPo);
              addAudit(reviewItem.id, "UPDATE_PO", null, updated, "Manual correction by Madam Lim");
              setReviewItem(null);
            }} 
          />
        )}
        {reviewItem?.type === 'GRN' && (
          <GRNReview 
            data={state.grnRecords.find(g => g.grnRecordId === reviewItem.id)!} 
            auditLog={state.auditLog.filter(a => a.recordId === reviewItem.id)}
            onAction={async (action, updatedData, reason) => {
              if (action === 'CANCEL') {
                setReviewItem(null);
                return;
              }

              if (action === 'DELETE') {
                showConfirm(
                  "Delete GRN Record",
                  "Are you sure you want to delete this Goods Received Note record? This action cannot be undone.",
                  async () => {
                    const newGrns = state.grnRecords.filter(g => g.grnRecordId !== reviewItem.id);
                    setState(prev => ({ ...prev, grnRecords: newGrns }));
                    await deleteRecord("grnRecords", reviewItem.id);
                    addAudit(reviewItem.id, "DELETE_GRN", null, null, reason || "Record deleted by Madam Lim");
                    setReviewItem(null);
                  }
                );
                return;
              }

              const grn = state.grnRecords.find(g => g.grnRecordId === reviewItem.id)!;
              let newGrn = { ...grn, ...updatedData };
              
              if (action === 'SAVE_CORRECTIONS' || action === 'APPROVE') {
                // Mark human corrected fields
                const corrected: string[] = [...(newGrn.humanCorrectedFields || [])];
                Object.keys(updatedData).forEach(key => {
                  if ((updatedData as any)[key] !== (grn as any)[key] && !corrected.includes(key)) {
                    corrected.push(key);
                  }
                });
                newGrn.humanCorrectedFields = corrected;
                
                newGrn = calculateGRNFields(newGrn);
                
                if (action === 'APPROVE') {
                  newGrn.reviewStatus = ReviewStatus.REVIEW_APPROVED;
                  newGrn.reviewedBy = "Madam Lim";
                  newGrn.reviewedAt = new Date().toISOString();
                }
              } else if (action === 'SEND_TO_WAREHOUSE') {
                newGrn.reviewStatus = ReviewStatus.ASSIGNED_TO_WAREHOUSE;
              } else if (action === 'KEEP_FOR_REVIEW') {
                newGrn.reviewStatus = ReviewStatus.REVIEW_REQUIRED;
              } else if (action === 'MARK_SIGNATURE_UNCLEAR') {
                newGrn.signatureReviewStatus = FieldStatus.UNCLEAR;
                newGrn = calculateGRNFields(newGrn);
              }

              const newGrns = state.grnRecords.map(g => g.grnRecordId === reviewItem.id ? newGrn : g);
              setState(prev => {
                const newState = { ...prev, grnRecords: newGrns };
                
                // Rerun match for affected PO if it exists in current results
                if (newGrn.poNumber && prev.matchResults.length > 0) {
                  newState.matchResults = prev.matchResults.map(res => {
                    if (res.poNumber === newGrn.poNumber) {
                      const inv = prev.importedInvoiceRecords.find(i => i.invoice_number === res.invoiceNumber);
                      if (inv) return performMatch(inv, prev.poRecords, newGrns);
                    }
                    return res;
                  });
                }
                return newState;
              });

              await saveRecord("grnRecords", newGrn);
              
              addAudit(reviewItem.id, action, grn.reviewStatus, newGrn.reviewStatus, reason || "Manual review action");
              
              // If approved or corrections saved, we might want to close if it's a final action
              if (action === 'APPROVE' || action === 'SEND_TO_WAREHOUSE' || action === 'SAVE_CORRECTIONS') {
                setReviewItem(null);
              }
            }} 
          />
        )}
        {reviewItem?.type === 'MATCH' && <MatchReview 
          data={state.matchResults.find(r => r.matchRecordId === reviewItem.id)!} 
          onQuery={setMessageDraft} 
          onAssign={(dept) => {
            const newResults = state.matchResults.map(r => r.matchRecordId === reviewItem.id ? { ...r, assignedDepartment: dept, assignmentDate: new Date().toISOString() } : r);
            setState(prev => ({ ...prev, matchResults: newResults }));
            addAudit(reviewItem.id, "ASSIGNED", null, dept, `Assigned to ${dept} for clarification`);
          }}
          onSave={(decision, notes) => {
            const newResults = state.matchResults.map(r => r.matchRecordId === reviewItem.id ? { ...r, status: decision === 'APPROVE' ? MatchStatus.APPROVED_EXCEPTION : decision === 'REJECT' ? MatchStatus.REJECTED : r.status, humanDecision: decision, reviewNotes: notes, reviewedBy: "Madam Lim", reviewDate: new Date().toISOString() } : r);
            setState(prev => ({ ...prev, matchResults: newResults }));
            addAudit(reviewItem.id, "MATCH_DECISION", null, decision, notes);
            setReviewItem(null);
          }} 
          onGenerateAi={handleGenerateAiExplanation}
        />}
      </ReviewModal>

      <AnimatePresence>
        {supportFiles && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSupportFiles(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">
                    Supporting {supportFiles.type} Documents
                  </h3>
                  <button onClick={() => setSupportFiles(null)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-sm font-medium text-slate-500">
                  These original documents show the manual records used by Boon Huat. Three-way matching uses the validated structured reference data.
                </p>
              </div>
              <div className="p-6 overflow-y-auto flex-1 bg-slate-100 flex gap-6 snap-x snap-mandatory">
                {supportFiles.files.map((file, i) => (
                  <div key={i} className="min-w-full md:min-w-[500px] shrink-0 snap-center bg-white rounded-xl shadow p-4 border border-slate-200 flex flex-col">
                     <p className="font-bold text-sm text-slate-500 mb-4">{file.name}</p>
                     <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-50 border border-slate-100 rounded-lg">
                       {file.type === "application/pdf" ? (
                          <Document file={file} className="max-w-full">
                            <Page pageNumber={1} width={400} renderTextLayer={false} renderAnnotationLayer={false} />
                          </Document>
                       ) : (
                          <img src={URL.createObjectURL(file)} alt="Preview" className="max-w-full max-h-[600px] object-contain" />
                       )}
                     </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {messageDraft && (
          <DraftMessageDialog 
            draft={messageDraft} 
            onClose={() => setMessageDraft(null)} 
            onSend={async (finalDraft) => {
              const res = await fetch("/api/message-drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalDraft)
              });
              const saved = await res.json();
              await fetch(`/api/message-drafts/${saved.message_id}/send`, { method: "POST" });
              setMessageDraft(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmState.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={confirmState.onCancel}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-8 overflow-hidden"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">{confirmState.title}</h3>
              </div>
              <p className="text-slate-600 mb-8 leading-relaxed font-medium text-sm">{confirmState.message}</p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={confirmState.onCancel}
                  className="px-6 py-2 rounded-lg border border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-colors"
                >
                  {confirmState.cancelText}
                </button>
                <button 
                  onClick={confirmState.onConfirm}
                  className="px-6 py-2 rounded-lg bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-colors shadow-lg"
                >
                  {confirmState.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isResetStep3ModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsResetStep3ModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-8 overflow-hidden"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Reset Step 3 data?</h3>
              </div>
              <p className="text-slate-600 mb-8 leading-relaxed font-medium text-sm">
                This will remove the current App 1 workbook and all imported invoice records from Step 3. Purchase Orders and Goods Received Notes will not be affected.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsResetStep3ModalOpen(false)}
                  className="px-6 py-2 rounded-lg border border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  type="button"
                  onClick={resetStep3Data}
                  className="px-6 py-2 rounded-lg bg-rose-600 text-white font-black uppercase text-[10px] tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20"
                >
                  RESET STEP 3
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isInactiveWarningOpen && (
        <div className="fixed inset-0 z-[150] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-6 text-center animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">SESSION EXPIRING</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                “For security, this session will end in 1 minute due to inactivity.”
              </p>
              <div className="py-3 px-4 bg-amber-50 rounded-2xl border border-amber-200 inline-block mt-2">
                <span className="text-2xl font-black text-amber-700 font-mono tracking-tight">{warningCountdown}</span>
                <span className="text-[10px] font-black uppercase text-amber-600 block mt-0.5">Seconds Remaining</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleLogOutNow}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                LOG OUT NOW
              </button>
              <button
                onClick={handleStaySignedIn}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 transition-all"
              >
                STAY SIGNED IN
              </button>
            </div>
          </div>
        </div>
      )}

      {approvalModalKey !== null && (() => {
        const approvalTarget = state.matchResults.find(r => getResultKey(r) === approvalModalKey);
        if (!approvalTarget) return null;
        return (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b pb-4">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Confirm Approval Recommendation
                </h3>
                <button onClick={closeApprovalModal} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-700">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase text-[10px]">Invoice:</span> <span className="font-black text-slate-900">{approvalTarget.invoiceNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase text-[10px]">PO:</span> <span className="font-bold text-indigo-600">{approvalTarget.poReference || approvalTarget.poNumber || 'N/A'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase text-[10px]">Supplier:</span> <span className="font-bold text-slate-900">{approvalTarget.supplierName}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase text-[10px]">Calculated Result:</span> <span className="font-bold text-emerald-600">{approvalTarget.deterministicStatus || approvalTarget.status}</span></div>
                </div>

                <p className="text-slate-600 font-medium italic">
                  “This confirms an approval recommendation only. No payment will be made.”
                </p>

                <form onSubmit={submitApproval} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Enter 4-Digit Passcode (1111)</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={approvalPasscode}
                      onChange={(e) => setApprovalPasscode(e.target.value)}
                      placeholder="••••"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>

                  {approvalError && (
                    <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                      {approvalError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeApprovalModal}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20"
                    >
                      Confirm Approval
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer / Status Bar */}
      <footer className="fixed bottom-0 right-0 left-0 md:left-60 bg-white border-t border-[#E2E8F0] px-6 py-2.5 flex justify-between items-center shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-20">
        <div className="flex items-center gap-4 text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
          <History className="w-3.5 h-3.5 text-[#5B3DF5]" /> Audit Trail Active
          <span className="text-[#E2E8F0]">|</span>
          <span>{state.auditLog.length} Actions Recorded</span>
        </div>
        <div className="text-[11px] text-[#94A3B8] font-medium">
          © 2026 Boon Huat Integrated Systems. All rights reserved.
        </div>
      </footer>
    </ErrorBoundary>
  );
}

// Sub-components

function Sidebar({ 
  activeScreen, 
  onNavigate, 
  mobileOpen,
  onCloseMobile
}: { 
  activeScreen: string, 
  onNavigate: (screen: string) => void, 
  mobileOpen: boolean,
  onCloseMobile: () => void
}) {
  const navItems = [
    { id: "DASHBOARD", label: "Dashboard", icon: LayoutGrid },
    { id: "WORKFLOW", label: "Workflow", icon: GitMerge },
    { id: "AUDIT", label: "Audit Trail", icon: History },
    { id: "SETTINGS", label: "Settings", icon: Settings },
  ];

  const content = (
    <aside className="w-60 bg-[#0F172A] text-slate-300 flex flex-col h-full border-r border-slate-800">
      {/* Brand Logo & Title */}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3">
        <div className="w-9 h-9 bg-[#5B3DF5] rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-purple-900/40">
          <PackageCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-black text-white uppercase tracking-tight leading-none">Boon Huat</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Payment Priority Tracker</p>
        </div>
      </div>

      {/* Main Navigation Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Navigation
        </p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id || (item.id === "WORKFLOW" && activeScreen.startsWith("STEP"));
          return (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                onCloseMobile();
              }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all",
                isActive
                  ? "bg-[#5B3DF5] text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("w-4 h-4", isActive ? "text-white" : "text-slate-400")} />
                <span>{item.label}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500">
        <p className="font-bold text-slate-400">Three-Way Match v2.4</p>
        <p className="mt-0.5">AI Studio Integrated Edition</p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar (Fixed) */}
      <div className="hidden md:block fixed left-0 top-0 bottom-0 z-40 w-60">
        {content}
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="relative z-10 w-60 h-full">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

function Header({
  activeScreen,
  user,
  onNavigate,
  onLogout,
  onToggleMobile
}: {
  activeScreen: string,
  user: UserSession,
  onNavigate: (screen: string) => void,
  onLogout: () => void,
  onToggleMobile: () => void
}) {
  const getScreenTitle = () => {
    switch (activeScreen) {
      case "DASHBOARD": return "Dashboard";
      case "EXCEPTIONS":
      case "REPORTS":
      case "WORKFLOW":
      case "STEP1":
      case "STEP2":
      case "STEP3":
      case "STEP4": return "Three-Way Match Workflow";
      case "AUDIT": return "System Audit Trail";
      case "SETTINGS": return "System Settings";
      case "PROFILE": return "User Profile";
      default: return "Dashboard";
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#E2E8F0] px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button 
          onClick={onToggleMobile} 
          className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          title="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base font-black text-[#111827] uppercase tracking-tight">{getScreenTitle()}</h1>
          <p className="text-[11px] font-medium text-[#64748B]">Boon Huat Hardware & Supplies Pte Ltd</p>
        </div>
      </div>

      {/* Middle Search Input */}
      <div className="hidden lg:flex items-center relative w-72">
        <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input 
          type="text" 
          placeholder="Global search PO, GRN or Invoice..." 
          className="w-full pl-9 pr-4 py-1.5 bg-[#F4F6FA] border border-[#E2E8F0] rounded-xl text-xs font-medium text-[#111827] outline-none focus:border-[#5B3DF5] focus:bg-white transition-all"
        />
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Status Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#ECFDF5] border border-emerald-200 text-[#10B981] rounded-full text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          <span>System Online</span>
        </div>

        {/* User Pill / Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#E2E8F0]">
          <button 
            onClick={() => onNavigate("PROFILE")}
            className="flex items-center gap-2 text-left p-1 hover:bg-[#F4F6FA] rounded-xl transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#5B3DF5] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {user.user_name ? user.user_name.charAt(0).toUpperCase() : "M"}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-[#111827] leading-none">{user.user_name || "Madam Lim"}</p>
              <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mt-0.5">
                {user.user_role ? user.user_role.replace(/_/g, ' ') : "ACCOUNTS EXECUTIVE"}
              </p>
            </div>
          </button>
          <button 
            onClick={onLogout}
            className="p-2 text-slate-400 hover:text-[#DC2626] hover:bg-rose-50 rounded-xl transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function LoginScreen({ 
  onLogin, 
  authStatus,
  logoutMessage
}: { 
  onLogin: (profile: any) => void, 
  authStatus: "IDLE" | "SIGNING_IN" | "AUTHENTICATED" | "ERROR",
  logoutMessage?: string | null
}) {
  const [selectedProfile, setSelectedProfile] = useState<typeof PROFILES[0] | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = () => {
    if (!selectedProfile) return;
    if (password === selectedProfile.password) {
      onLogin(selectedProfile);
    } else {
      setError("Incorrect password.");
    }
  };

  const handleClear = () => {
    setSelectedProfile(null);
    setPassword("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20"
          >
            <PackageCheck className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none mb-2">Boon Huat App 2</h1>
          <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Integrated Three-Way Match</p>
        </div>

        {logoutMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl flex items-start gap-3"
          >
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm font-medium">{logoutMessage}</div>
          </motion.div>
        )}

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-white rounded-3xl p-10 shadow-2xl space-y-8"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Sign In</h2>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Select your staff profile and enter the password to access the Integrated Three-Way Match system.
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Staff Profile</label>
              <div className="relative group">
                <select 
                  value={selectedProfile?.role || ""}
                  onChange={(e) => {
                    const profile = PROFILES.find(p => p.role === e.target.value);
                    setSelectedProfile(profile || null);
                    setError(null);
                  }}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-900 appearance-none focus:border-blue-600 focus:bg-white outline-none transition-all pr-12"
                >
                  <option value="" disabled>Select Profile...</option>
                  {PROFILES.map((p) => (
                    <option key={p.role} value={p.role}>{p.name} — {p.role.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 rotate-90 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Password</label>
              <div className="relative group">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••"
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:border-blue-600 focus:bg-white outline-none transition-all pr-12"
                />
                <button 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-[11px] font-bold text-red-700">{error}</span>
              </motion.div>
            )}

            <div className="pt-4 grid grid-cols-2 gap-4">
              <button 
                onClick={handleClear}
                className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-200 transition-all"
              >
                Clear
              </button>
              <button 
                onClick={handleSignIn}
                disabled={authStatus === "SIGNING_IN" || !selectedProfile || !password}
                className="flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 group disabled:opacity-50"
              >
                {authStatus === "SIGNING_IN" ? (
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {authStatus === "SIGNING_IN" ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </div>
          
          <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-relaxed">
            Contact the System Administrator if you have forgotten your password.<br/>
            Prototype Sign-In — Local Session Only
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function WorkflowStepper({ 
  currentStep, 
  onSelectStep,
  step1Status,
  step2Status,
  step3Status,
  step4Status
}: { 
  currentStep: number, 
  onSelectStep: (step: number) => void,
  step1Status: string,
  step2Status: string,
  step3Status: string,
  step4Status: string
}) {
  const steps = [
    { num: 1, title: "PURCHASE ORDERS", desc: "Load PO reference records", status: step1Status },
    { num: 2, title: "GOODS RECEIVED NOTES", desc: "Load warehouse receiving records", status: step2Status },
    { num: 3, title: "IMPORT INVOICES", desc: "Import App 1 results", status: step3Status },
    { num: 4, title: "THREE-WAY MATCH", desc: "Compare and explain variances", status: step4Status },
  ];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Completed":
      case "Imported":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "Review Required":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "Processing":
      case "Importing":
      case "Matching":
        return "bg-blue-100 text-blue-800 border-blue-200 animate-pulse";
      case "Partially Completed":
        return "bg-sky-100 text-sky-800 border-sky-200";
      case "Failed":
      case "Import Failed":
        return "bg-rose-100 text-rose-800 border-rose-200";
      case "Not Started":
      case "Not Imported":
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
          <RefreshCcw className="w-4 h-4 text-blue-600" /> Workflow Stepper
        </h2>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Step {currentStep} of 4
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s) => {
          const isActive = currentStep === s.num;
          return (
            <button
              key={s.num}
              onClick={() => onSelectStep(s.num)}
              className={cn(
                "p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 group relative overflow-hidden",
                isActive 
                  ? "bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-900/10" 
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-400 hover:bg-white"
              )}
            >
              <div className="flex justify-between items-start w-full">
                <span className={cn(
                  "w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center border shrink-0",
                  isActive 
                    ? "bg-blue-600 text-white border-blue-500" 
                    : "bg-white text-slate-900 border-slate-200 group-hover:border-blue-400"
                )}>
                  {s.num}
                </span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider shrink-0",
                  getStatusBadgeClass(s.status)
                )}>
                  {s.status}
                </span>
              </div>

              <div>
                <h3 className={cn("text-xs font-black uppercase tracking-wide", isActive ? "text-white" : "text-slate-900")}>
                  {s.title}
                </h3>
                <p className={cn("text-[10px] font-medium mt-0.5", isActive ? "text-slate-400" : "text-slate-500")}>
                  {s.desc}
                </p>
              </div>

              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard({ 
  state, 
  auditTrail, 
  onNavigate,
  step1Status,
  step2Status,
  step3Status,
  step4Status,
  onReviewItem
}: { 
  state: AppState, 
  auditTrail: App2AuditEntry[], 
  reports: GeneratedReport[],
  onNavigate: (screen: string, step?: number) => void,
  step1Status: string,
  step2Status: string,
  step3Status: string,
  step4Status: string,
  onReviewItem: (type: 'PO' | 'GRN' | 'MATCH', id: string) => void
}) {
  const [filterDept, setFilterDept] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const activePoRecords = useMemo(() => state.poRecords, [state.poRecords]);
  const activeGrnRecords = useMemo(() => state.grnRecords, [state.grnRecords]);

  const approvedPaymentCount = useMemo(() => {
    return state.matchResults.filter(isApprovedResult).length;
  }, [state.matchResults]);

  const matchPendingCount = useMemo(() => {
    const REVIEW_REQUIRED_STATUSES = new Set([
      "QUANTITY MISMATCH",
      "PRICE MISMATCH",
      "TOTAL MISMATCH",
      "CONDITION ISSUE",
      "SUPPLIER MISMATCH",
      "POSSIBLE DUPLICATE",
      "NO PO FOUND",
      "NO GRN FOUND",
      "MULTIPLE ISSUES",
      "INVALID INVOICE DATA"
    ]);
    return state.matchResults.filter(r => {
      const s = String(r.deterministicStatus || r.status || "").trim().toUpperCase();
      return REVIEW_REQUIRED_STATUSES.has(s);
    }).length;
  }, [state.matchResults]);

  const totalPendingActions = useMemo(() => {
    const poPending = activePoRecords.filter(p => p.extractionStatus === ExtractionStatus.REVIEW_REQUIRED).length;
    const grnPending = activeGrnRecords.filter(isGRNReviewRequired).length;
    return state.hasRunMatch ? (poPending + grnPending + matchPendingCount) : (poPending + grnPending);
  }, [activePoRecords, activeGrnRecords, matchPendingCount, state.hasRunMatch]);

  const pendingItems = useMemo(() => {
    const list: Array<{
      id: string;
      supplier: string;
      recordRef: string;
      variance: string;
      impact: string;
      department: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
      status: string;
      type: 'PO' | 'GRN' | 'MATCH';
      stepNum: number;
    }> = [];

    // Pending POs
    activePoRecords.forEach(p => {
      if (p.extractionStatus === ExtractionStatus.REVIEW_REQUIRED) {
        list.push({
          id: p.poRecordId,
          supplier: p.supplierName || "Boon Huat Vendor",
          recordRef: p.poNumber ? `PO #${p.poNumber}` : `PO Record`,
          variance: "Extracted PO field confidence threshold review required",
          impact: p.totalAmount ? `$${p.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : "Pending Valuation",
          department: "Procurement",
          priority: "HIGH",
          status: "Review Required",
          type: 'PO',
          stepNum: 1
        });
      }
    });

    // Pending GRNs
    activeGrnRecords.forEach(g => {
      if (isGRNReviewRequired(g)) {
        list.push({
          id: g.grnRecordId,
          supplier: g.supplierName || "Hardware Supplier",
          recordRef: g.grnNumber ? `GRN #${g.grnNumber}` : `GRN Record`,
          variance: "Handwritten GRN scan variance / verification required",
          impact: "Quantity Verification",
          department: "Warehouse",
          priority: "HIGH",
          status: "Review Required",
          type: 'GRN',
          stepNum: 2
        });
      }
    });

    // Pending Matches
    if (state.hasRunMatch) {
      const REVIEW_REQUIRED_STATUSES = new Set([
        "QUANTITY MISMATCH",
        "PRICE MISMATCH",
        "TOTAL MISMATCH",
        "CONDITION ISSUE",
        "SUPPLIER MISMATCH",
        "POSSIBLE DUPLICATE",
        "NO PO FOUND",
        "NO GRN FOUND",
        "MULTIPLE ISSUES",
        "INVALID INVOICE DATA"
      ]);
      state.matchResults.forEach(r => {
        const s = String(r.deterministicStatus || r.status || "").trim().toUpperCase();
        if (REVIEW_REQUIRED_STATUSES.has(s)) {
          const issueText = r.issues.map(i => i.type || i.recommendedAction).filter(Boolean).join("; ") || "Match variance detected";
          const totalImpact = r.potentialFinancialImpact ? `$${r.potentialFinancialImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : "$0.00";
          list.push({
            id: r.matchRecordId,
            supplier: r.poNumber ? `PO #${r.poNumber}` : "Supplier Record",
            recordRef: `PO #${r.poNumber || "N/A"} / Inv #${r.invoiceNumber || "N/A"}`,
            variance: issueText,
            impact: totalImpact,
            department: r.assignedDepartment || "Accounts",
            priority: "MEDIUM",
            status: "Review Required",
            type: 'MATCH',
            stepNum: 4
          });
        }
      });
    }

    return list;
  }, [activePoRecords, activeGrnRecords, state.matchResults]);

  const filteredPendingItems = useMemo(() => {
    return pendingItems.filter(item => {
      if (filterDept === "ACCOUNTS" && item.department !== "Accounts" && item.department !== "Finance / AP") return false;
      if (filterDept === "PROCUREMENT" && item.department !== "Procurement" && item.department !== "Purchasing") return false;
      if (filterDept === "WAREHOUSE" && item.department !== "Warehouse" && item.department !== "Warehouse / Store") return false;
      if (filterDept === "HIGH_PRIORITY" && item.priority !== "HIGH") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.supplier.toLowerCase().includes(q) ||
          item.recordRef.toLowerCase().includes(q) ||
          item.variance.toLowerCase().includes(q)
        );
      }
      return true;
    }).slice(0, 5);
  }, [pendingItems, filterDept, searchQuery]);

  const recentAudit = useMemo(() => {
    return auditTrail.slice(-5).reverse();
  }, [auditTrail]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Completed":
      case "Imported":
        return <span className="px-2.5 py-0.5 bg-[#ECFDF5] text-[#10B981] text-[10px] font-bold rounded-full border border-emerald-200">Completed</span>;
      case "Review Required":
        return <span className="px-2.5 py-0.5 bg-[#FFF7ED] text-[#F97316] text-[10px] font-bold rounded-full border border-orange-200">Review Required</span>;
      case "Processing":
      case "Importing":
      case "Matching":
        return <span className="px-2.5 py-0.5 bg-[#EEEAFE] text-[#5B3DF5] text-[10px] font-bold rounded-full border border-purple-200 animate-pulse">{status}</span>;
      default:
        return <span className="px-2.5 py-0.5 bg-slate-100 text-[#64748B] text-[10px] font-bold rounded-full border border-slate-200">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Heading & Status Badge */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#111827] uppercase tracking-tight">Executive Dashboard</h2>
          <p className="text-xs font-medium text-[#64748B]">
            Purchase Orders, GRNs and approved invoices ready for three-way matching
          </p>
        </div>
        <div>
          {totalPendingActions === 0 ? (
            <span className="px-3 py-1 bg-[#ECFDF5] text-[#10B981] border border-emerald-200 text-xs font-black uppercase rounded-full tracking-wider shadow-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> ALL RECORDS VERIFIED
            </span>
          ) : (
            <span className="px-3 py-1 bg-[#FFF7ED] text-[#F97316] border border-orange-200 text-xs font-black uppercase rounded-full tracking-wider shadow-sm flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {totalPendingActions} RECORDS REQUIRE REVIEW
            </span>
          )}
        </div>
      </div>

      {/* Dark Navy Notification Banner */}
      <div className="bg-[#0F172A] rounded-2xl p-4 sm:p-5 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 bg-[#5B3DF5] rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-purple-900/50">
            <PackageCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide text-white">Live Match Pipeline Summary</h3>
            <p className="text-xs text-slate-300 leading-snug mt-0.5">
              {activePoRecords.length} Purchase Orders and {activeGrnRecords.length} GRNs extracted. {totalPendingActions} exception records require human verification before final payment approval.
            </p>
          </div>
        </div>
        <button 
          onClick={() => onNavigate("WORKFLOW", 4)}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
        >
          View Details <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Five Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard 
          label="PURCHASE ORDERS" 
          value={activePoRecords.length} 
          supportingText="Ready for matching"
          color="purple" 
        />
        <SummaryCard 
          label="GRNS RECEIVED" 
          value={activeGrnRecords.length} 
          supportingText="Delivery records extracted"
          color="green" 
        />
        <SummaryCard 
          label="APPROVED INVOICES" 
          value={state.importedInvoiceRecords.length} 
          supportingText="Imported from App 1"
          color="white-purple" 
        />
        <SummaryCard 
          label="REVIEW REQUIRED" 
          value={matchPendingCount} 
          supportingText="Human action required"
          color="orange" 
        />
        <SummaryCard 
          label="APPROVALS CONFIRMED" 
          value={approvedPaymentCount} 
          supportingText="Human-approved records"
          color="navy" 
        />
      </div>

      {/* Workflow Status Panel */}
      <div className="bg-white rounded-2xl p-6 border border-[#E2E8F0] shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-base font-black text-[#111827] uppercase tracking-tight flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-[#5B3DF5]" />
              Three-Way Match Workflow
            </h3>
            <p className="text-xs font-medium text-[#64748B]">Real-time pipeline across extraction and matching steps</p>
          </div>
          <button 
            onClick={() => onNavigate("WORKFLOW", 1)}
            className="text-xs font-bold text-[#5B3DF5] hover:underline flex items-center gap-1"
          >
            Go to Workflow <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Stage 1 */}
          <div 
            onClick={() => onNavigate("WORKFLOW", 1)}
            className="bg-[#F4F6FA] p-4 rounded-xl border border-[#E2E8F0] hover:border-[#5B3DF5] cursor-pointer transition-all space-y-2 group"
          >
            <div className="flex justify-between items-center">
              <span className="w-6 h-6 rounded-lg bg-[#5B3DF5] text-white text-xs font-bold flex items-center justify-center">1</span>
              {getStatusBadge(step1Status)}
            </div>
            <div>
              <p className="text-xs font-black text-[#111827] uppercase">Purchase Orders</p>
              <p className="text-[11px] text-[#64748B] font-bold">{activePoRecords.length} records</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#5B3DF5] group-hover:underline pt-1">
              <span>Open Stage</span> <ChevronRight className="w-3 h-3" />
            </div>
          </div>

          {/* Stage 2 */}
          <div 
            onClick={() => onNavigate("WORKFLOW", 2)}
            className="bg-[#F4F6FA] p-4 rounded-xl border border-[#E2E8F0] hover:border-[#5B3DF5] cursor-pointer transition-all space-y-2 group"
          >
            <div className="flex justify-between items-center">
              <span className="w-6 h-6 rounded-lg bg-[#5B3DF5] text-white text-xs font-bold flex items-center justify-center">2</span>
              {getStatusBadge(step2Status)}
            </div>
            <div>
              <p className="text-xs font-black text-[#111827] uppercase">Goods Received Notes</p>
              <p className="text-[11px] text-[#64748B] font-bold">{activeGrnRecords.length} records</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#5B3DF5] group-hover:underline pt-1">
              <span>Open Stage</span> <ChevronRight className="w-3 h-3" />
            </div>
          </div>

          {/* Stage 3 */}
          <div 
            onClick={() => onNavigate("WORKFLOW", 3)}
            className="bg-[#F4F6FA] p-4 rounded-xl border border-[#E2E8F0] hover:border-[#5B3DF5] cursor-pointer transition-all space-y-2 group"
          >
            <div className="flex justify-between items-center">
              <span className="w-6 h-6 rounded-lg bg-[#5B3DF5] text-white text-xs font-bold flex items-center justify-center">3</span>
              {getStatusBadge(step3Status)}
            </div>
            <div>
              <p className="text-xs font-black text-[#111827] uppercase">Import Invoices</p>
              <p className="text-[11px] text-[#64748B] font-bold">{state.importedInvoiceRecords.length} invoices</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#5B3DF5] group-hover:underline pt-1">
              <span>Open Stage</span> <ChevronRight className="w-3 h-3" />
            </div>
          </div>

          {/* Stage 4 */}
          <div 
            onClick={() => onNavigate("WORKFLOW", 4)}
            className="bg-[#F4F6FA] p-4 rounded-xl border border-[#E2E8F0] hover:border-[#5B3DF5] cursor-pointer transition-all space-y-2 group"
          >
            <div className="flex justify-between items-center">
              <span className="w-6 h-6 rounded-lg bg-[#5B3DF5] text-white text-xs font-bold flex items-center justify-center">4</span>
              {getStatusBadge(step4Status)}
            </div>
            <div>
              <p className="text-xs font-black text-[#111827] uppercase">Three-Way Match</p>
              <p className="text-[11px] text-[#64748B] font-bold">{state.matchResults.length} results</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#5B3DF5] group-hover:underline pt-1">
              <span>Open Stage</span> <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Pending Exceptions Table + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 cols): Pending Exceptions Table */}
        <div className="lg:col-span-2 space-y-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-base font-black text-[#111827] uppercase tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#F97316]" />
                Pending Exceptions
              </h3>
              <p className="text-xs font-medium text-[#64748B]">Variances and unapproved items requiring human action</p>
            </div>
            <button 
              onClick={() => onNavigate("EXCEPTIONS")}
              className="text-xs font-bold text-[#5B3DF5] hover:underline flex items-center gap-1"
            >
              View All Exceptions <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Pill Filters & Search Box */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: "ALL", label: "All" },
                { id: "ACCOUNTS", label: "Accounts" },
                { id: "PROCUREMENT", label: "Procurement" },
                { id: "WAREHOUSE", label: "Warehouse" },
                { id: "HIGH_PRIORITY", label: "High Priority" },
              ].map(pill => (
                <button
                  key={pill.id}
                  onClick={() => setFilterDept(pill.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold transition-all",
                    filterDept === pill.id
                      ? "bg-[#5B3DF5] text-white shadow-sm"
                      : "bg-[#F4F6FA] text-[#64748B] hover:bg-slate-200"
                  )}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search supplier, invoice, PO or GRN..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#F4F6FA] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#111827] outline-none focus:border-[#5B3DF5] focus:bg-white transition-all"
              />
            </div>
          </div>

          {filteredPendingItems.length === 0 ? (
            <div className="p-8 text-center text-[#94A3B8] text-xs font-medium italic bg-[#F4F6FA] rounded-xl border border-[#E2E8F0]">
              No pending exceptions matching search/filter. All records in good standing!
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F6FA] text-[#64748B] font-bold uppercase text-[10px] tracking-wider border-b border-[#E2E8F0]">
                  <tr>
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Invoice / PO / GRN</th>
                    <th className="p-3">Exact Variance</th>
                    <th className="p-3">Financial Impact</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredPendingItems.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-[#111827]">{item.supplier}</td>
                      <td className="p-3 font-bold text-[#5B3DF5]">{item.recordRef}</td>
                      <td className="p-3 text-[#111827] max-w-xs truncate" title={item.variance}>{item.variance}</td>
                      <td className="p-3 font-bold text-[#DC2626]">{item.impact}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-[#64748B] rounded text-[10px] font-bold">
                          {item.department}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                          item.priority === "HIGH" ? "bg-rose-100 text-[#DC2626]" : "bg-amber-100 text-[#F59E0B]"
                        )}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-orange-100 text-[#F97316] rounded text-[10px] font-bold">
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            onNavigate("WORKFLOW", item.stepNum);
                            onReviewItem(item.type, item.id);
                          }}
                          className="px-3 py-1 bg-[#5B3DF5] hover:bg-[#4B2EE8] text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column (1 col): Recent Activity */}
        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-black text-[#111827] uppercase tracking-tight flex items-center gap-2">
                <History className="w-4 h-4 text-[#64748B]" />
                Recent Activity
              </h3>
              <p className="text-[10px] font-medium text-[#64748B]">Latest 5 Audit Trail events</p>
            </div>
            <button 
              onClick={() => onNavigate("AUDIT")} 
              className="text-xs font-bold text-[#5B3DF5] hover:underline flex items-center gap-0.5"
            >
              View Full <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentAudit.length === 0 ? (
            <div className="p-6 text-center text-[#94A3B8] text-xs font-medium italic bg-[#F4F6FA] rounded-xl">
              No recent activity logged yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentAudit.map((log) => (
                <div key={log.audit_id} className="p-3 bg-[#F4F6FA] rounded-xl border border-[#E2E8F0] space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-[#64748B]">{formatDate(log.timestamp)}</span>
                    <span className="font-black text-[#5B3DF5] uppercase tracking-wide">{log.user_role}</span>
                  </div>
                  <p className="text-xs font-bold text-[#111827] leading-tight">
                    {log.user_name} performed <span className="text-[#5B3DF5] font-black">{log.action_type.replace(/_/g, ' ')}</span>
                  </p>
                  {log.related_record_id && (
                    <p className="text-[10px] font-mono text-[#64748B]">Record: {log.related_record_id}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function ExceptionsScreen({ 
  state, 
  onReviewItem,
  onNavigate
}: { 
  state: AppState, 
  onReviewItem: (type: 'PO' | 'GRN' | 'MATCH', id: string) => void,
  onNavigate: (screen: string, step?: number) => void
}) {
  const [filterDept, setFilterDept] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const allExceptions = useMemo(() => {
    const list: Array<{
      id: string;
      supplier: string;
      recordRef: string;
      variance: string;
      impact: string;
      department: string;
      priority: "HIGH" | "MEDIUM" | "LOW";
      status: string;
      type: 'PO' | 'GRN' | 'MATCH';
      stepNum: number;
    }> = [];

    // Pending POs
    state.poRecords.forEach(p => {
      if (p.extractionStatus === ExtractionStatus.REVIEW_REQUIRED) {
        list.push({
          id: p.poRecordId,
          supplier: p.supplierName || "Boon Huat Vendor",
          recordRef: p.poNumber ? `PO #${p.poNumber}` : `PO Record`,
          variance: "Extracted PO field confidence threshold review required",
          impact: p.totalAmount ? `$${p.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : "Pending Valuation",
          department: "Procurement",
          priority: "HIGH",
          status: "Review Required",
          type: 'PO',
          stepNum: 1
        });
      }
    });

    // Pending GRNs
    state.grnRecords.forEach(g => {
      if (g.reviewStatus === ReviewStatus.REVIEW_REQUIRED) {
        list.push({
          id: g.grnRecordId,
          supplier: g.supplierName || "Hardware Supplier",
          recordRef: g.grnNumber ? `GRN #${g.grnNumber}` : `GRN Record`,
          variance: "Handwritten GRN scan variance / verification required",
          impact: "Quantity Verification",
          department: "Warehouse",
          priority: "HIGH",
          status: "Review Required",
          type: 'GRN',
          stepNum: 2
        });
      }
    });

    // Pending Matches
    if (state.hasRunMatch) {
      const REVIEW_REQUIRED_STATUSES = new Set([
        "QUANTITY MISMATCH",
        "PRICE MISMATCH",
        "TOTAL MISMATCH",
        "CONDITION ISSUE",
        "SUPPLIER MISMATCH",
        "POSSIBLE DUPLICATE",
        "NO PO FOUND",
        "NO GRN FOUND",
        "MULTIPLE ISSUES",
        "INVALID INVOICE DATA"
      ]);
      state.matchResults.forEach(r => {
        const s = String(r.deterministicStatus || r.status || "").trim().toUpperCase();
        if (REVIEW_REQUIRED_STATUSES.has(s)) {
          const issueText = r.issues.map(i => i.type || i.recommendedAction).filter(Boolean).join("; ") || "Match variance detected";
          const totalImpact = r.potentialFinancialImpact ? `$${r.potentialFinancialImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : "$0.00";
          list.push({
            id: r.matchRecordId,
            supplier: r.poNumber ? `PO #${r.poNumber}` : "Supplier Record",
            recordRef: `PO #${r.poNumber || "N/A"} / Inv #${r.invoiceNumber || "N/A"}`,
            variance: issueText,
            impact: totalImpact,
            department: r.assignedDepartment || "Accounts",
            priority: "MEDIUM",
            status: "Review Required",
            type: 'MATCH',
            stepNum: 4
          });
        }
      });
    }

    return list;
  }, [state.poRecords, state.grnRecords, state.matchResults]);

  const filtered = useMemo(() => {
    return allExceptions.filter(item => {
      if (filterDept === "ACCOUNTS" && item.department !== "Accounts" && item.department !== "Finance / AP") return false;
      if (filterDept === "PROCUREMENT" && item.department !== "Procurement" && item.department !== "Purchasing") return false;
      if (filterDept === "WAREHOUSE" && item.department !== "Warehouse" && item.department !== "Warehouse / Store") return false;
      if (filterDept === "HIGH_PRIORITY" && item.priority !== "HIGH") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.supplier.toLowerCase().includes(q) ||
          item.recordRef.toLowerCase().includes(q) ||
          item.variance.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allExceptions, filterDept, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-[#111827] uppercase tracking-tight">Exceptions Review Center</h2>
        <p className="text-xs font-medium text-[#64748B]">
          Human review queue for variances, unmatched records, and manual verification
        </p>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "ALL", label: "All Exceptions" },
              { id: "ACCOUNTS", label: "Accounts" },
              { id: "PROCUREMENT", label: "Procurement" },
              { id: "WAREHOUSE", label: "Warehouse" },
              { id: "HIGH_PRIORITY", label: "High Priority" },
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => setFilterDept(pill.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all",
                  filterDept === pill.id
                    ? "bg-[#5B3DF5] text-white shadow-sm"
                    : "bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-slate-50"
                )}
              >
                {pill.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search supplier, invoice, PO or GRN..."
              className="w-full pl-9 pr-4 py-2 bg-[#F4F6FA] border border-[#E2E8F0] rounded-xl text-xs font-bold text-[#111827] outline-none focus:border-[#5B3DF5] focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-[#94A3B8] text-xs font-medium bg-[#F4F6FA] rounded-xl border border-[#E2E8F0]">
            No unresolved exceptions found for the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F6FA] text-[#64748B] font-bold uppercase text-[10px] tracking-wider border-b border-[#E2E8F0]">
                <tr>
                  <th className="p-3.5">Supplier</th>
                  <th className="p-3.5">Invoice / PO / GRN</th>
                  <th className="p-3.5">Exact Variance</th>
                  <th className="p-3.5">Financial Impact</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5">Priority</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filtered.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-[#111827]">{item.supplier}</td>
                    <td className="p-3.5 font-bold text-[#5B3DF5]">{item.recordRef}</td>
                    <td className="p-3.5 text-[#111827] max-w-xs leading-snug">{item.variance}</td>
                    <td className="p-3.5 font-bold text-[#DC2626]">{item.impact}</td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 bg-slate-100 text-[#64748B] rounded-lg text-[10px] font-bold">
                        {item.department}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase",
                        item.priority === "HIGH" ? "bg-rose-100 text-[#DC2626]" : "bg-amber-100 text-[#F59E0B]"
                      )}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-1 bg-orange-100 text-[#F97316] rounded-lg text-[10px] font-bold">
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => {
                          onNavigate("WORKFLOW", item.stepNum);
                          onReviewItem(item.type, item.id);
                        }}
                        className="px-3.5 py-1.5 bg-[#5B3DF5] hover:bg-[#4B2EE8] text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ user }: { user: UserSession }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-[#111827] uppercase tracking-tight">System Settings & Permissions</h2>
        <p className="text-xs font-medium text-[#64748B]">
          Accounts Payable department rules, staff profile, and verification parameters
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <h3 className="text-sm font-black text-[#111827] uppercase tracking-wide flex items-center gap-2">
            <User className="w-4 h-4 text-[#5B3DF5]" /> Accounts Executive Profile
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-2 border-b border-[#E2E8F0]">
              <span className="text-[#64748B] font-medium">Name</span>
              <span className="font-bold text-[#111827]">{user.user_name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E2E8F0]">
              <span className="text-[#64748B] font-medium">Role</span>
              <span className="font-bold text-[#111827]">{user.user_role ? user.user_role.replace(/_/g, ' ') : "ACCOUNTS EXECUTIVE"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#E2E8F0]">
              <span className="text-[#64748B] font-medium">Access Code</span>
              <span className="font-bold text-[#10B981]">1111 (Authorized)</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#64748B] font-medium">Organization</span>
              <span className="font-bold text-[#111827]">Boon Huat Hardware & Supplies Pte Ltd</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
          <h3 className="text-sm font-black text-[#111827] uppercase tracking-wide flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" /> Department Routing Rules
          </h3>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#F4F6FA] rounded-xl border border-[#E2E8F0]">
              <p className="font-bold text-[#111827]">Procurement / Purchasing</p>
              <p className="text-[11px] text-[#64748B] mt-0.5">PO price variances and unapproved line item changes</p>
            </div>
            <div className="p-3 bg-[#F4F6FA] rounded-xl border border-[#E2E8F0]">
              <p className="font-bold text-[#111827]">Warehouse / Store</p>
              <p className="text-[11px] text-[#64748B] mt-0.5">Handwritten GRN quantity shortfalls and damaged goods</p>
            </div>
            <div className="p-3 bg-[#F4F6FA] rounded-xl border border-[#E2E8F0]">
              <p className="font-bold text-[#111827]">Finance / AP</p>
              <p className="text-[11px] text-[#64748B] mt-0.5">Three-way match exceptions and payment approvals</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-sm space-y-4">
        <h3 className="text-sm font-black text-[#111827] uppercase tracking-wide flex items-center gap-2">
          <Lock className="w-4 h-4 text-blue-600" /> Auto Session Timeout (Internal Security Control)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-[#F4F6FA] rounded-xl border border-[#E2E8F0] space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#111827]">Inactivity Duration</span>
              <span className="font-black text-blue-600">5 Minutes</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#111827]">Warning Threshold</span>
              <span className="font-black text-amber-600">4 Minutes (60s Countdown)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#111827]">Status</span>
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-black text-[10px] uppercase tracking-wider">ENABLED</span>
            </div>
          </div>
          <div className="p-4 bg-[#F4F6FA] rounded-xl border border-[#E2E8F0] flex flex-col justify-center">
            <p className="text-[11px] text-[#64748B] italic leading-relaxed">
              “Automatically locks the Accounts Payable application after 5 minutes without user activity to protect sensitive financial records.”
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string, value: number, icon: any, color: string }) {
  const colorMap: any = {
    blue: "bg-blue-600 shadow-blue-500/20",
    slate: "bg-slate-900 shadow-slate-900/10",
    green: "bg-green-600 shadow-green-500/20"
  };
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-6">
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl", colorMap[color])}>
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
        <p className="text-3xl font-black text-slate-900 tracking-tighter leading-none">{value}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string, value: number, color: string }) {
  const colorMap: any = {
    green: "text-green-600",
    yellow: "text-amber-500",
    orange: "text-orange-500",
    red: "text-rose-500"
  };
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      <p className={cn("text-2xl font-black leading-none", colorMap[color])}>{value}</p>
    </div>
  );
}

function AuditTrailScreen({ trail, integrityWarning }: { trail: App2AuditEntry[], integrityWarning: boolean }) {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedUser, setSelectedUser] = useState<string>("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<App2AuditEntry | null>(null);

  const isReviewRequiredEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    const decision = (entry.decision || "").toUpperCase();
    const newStatus = (entry.new_status || "").toUpperCase();
    const prevStatus = (entry.previous_status || "").toUpperCase();
    const metaStr = entry.metadata ? JSON.stringify(entry.metadata).toUpperCase() : "";
    const reason = (entry.decision_reason || "").toUpperCase();

    // If explicit Clean Match without review needed, exclude
    if (
      act === "CLEAN_MATCH_HEADER_VERIFIED" ||
      act === "CLEAN_MATCH_FULL_VERIFIED" ||
      (act.includes("CLEAN_MATCH") && !act.includes("REVIEW"))
    ) {
      if (!act.includes("REVIEW") && !decision.includes("REVIEW")) {
        return false;
      }
    }

    const reviewKeywords = [
      "REVIEW_REQUIRED",
      "QUANTITY_MISMATCH",
      "PRICE_MISMATCH",
      "TOTAL_MISMATCH",
      "CONDITION_ISSUE",
      "SUPPLIER_MISMATCH",
      "POSSIBLE_DUPLICATE",
      "NO_PO_FOUND",
      "NO_GRN_FOUND",
      "MULTIPLE_ISSUES",
      "INVALID_INVOICE_DATA",
      "REVIEW_REOPENED",
      "PREVIOUSLY_HELD_INVOICE_RESUBMITTED",
      "REVALIDATION_REQUIRED",
      "PREVIOUS APPROVAL REQUIRES REVALIDATION"
    ];

    const hasKeyword = reviewKeywords.some(kw =>
      act.includes(kw) ||
      decision.includes(kw) ||
      newStatus.includes(kw) ||
      prevStatus.includes(kw) ||
      metaStr.includes(kw) ||
      reason.includes(kw)
    );

    if (hasKeyword) return true;
    if (entry.mismatch_fields && entry.mismatch_fields.length > 0) return true;

    return false;
  }, []);

  const isReviewHoldEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    const decision = (entry.decision || "").toUpperCase();
    const reason = (entry.decision_reason || "").toUpperCase();

    return (
      act.includes("HOLD") ||
      act.includes("ASSIGN") ||
      act.includes("REVIEW_NOTE") ||
      act.includes("KEEP_ON_HOLD") ||
      decision.includes("HOLD") ||
      reason.includes("HOLD")
    );
  }, []);

  const isApprovedEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    const decision = (entry.decision || "").toUpperCase();
    const newStatus = (entry.new_status || "").toUpperCase();

    return (
      (act.includes("APPROVE") || act.includes("CONFIRM") || decision.includes("APPROVE") || decision.includes("CONFIRM") || newStatus.includes("APPROVE") || newStatus.includes("CONFIRM")) &&
      !act.includes("REJECT") && !decision.includes("REJECT")
    );
  }, []);

  const isDocumentEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    const docType = (entry.document_type || "").toUpperCase();

    return (
      act.includes("IMPORT") ||
      act.includes("UPLOAD") ||
      act.includes("WORKBOOK") ||
      act.includes("PO_RECORDS") ||
      act.includes("GRN_RECORDS") ||
      docType.includes("INVOICE") ||
      docType.includes("PO") ||
      docType.includes("GRN")
    );
  }, []);

  const isThreeWayMatchEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    return act.includes("MATCH") || act.includes("THREE_WAY");
  }, []);

  const isAIEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    return act.includes("AI_") || act.includes("EXPLANATION") || act.includes("SPARKLE");
  }, []);

  const isSecurityEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    const decision = (entry.decision || "").toUpperCase();
    return (
      act.includes("SIGN_IN") ||
      act.includes("SIGN_OUT") ||
      act.includes("SECURITY") ||
      act.includes("TIMEOUT") ||
      act.includes("PASSCODE") ||
      act.includes("AUTH") ||
      decision.includes("SECURITY")
    );
  }, []);

  const isFailedEntry = useCallback((entry: App2AuditEntry): boolean => {
    if (!entry) return false;
    const act = (entry.action_type || "").toUpperCase();
    const decision = (entry.decision || "").toUpperCase();
    const newStatus = (entry.new_status || "").toUpperCase();
    return (
      act.includes("FAIL") ||
      act.includes("REJECT") ||
      act.includes("COMPROMISED") ||
      act.includes("ERROR") ||
      decision.includes("FAIL") ||
      decision.includes("REJECT") ||
      newStatus.includes("FAIL")
    );
  }, []);

  // Summary counts
  const summary = useMemo(() => {
    let approval = 0;
    let reviewHold = 0;
    let documentAct = 0;
    let security = 0;
    let ai = 0;

    trail.forEach(e => {
      if (isApprovedEntry(e)) approval++;
      else if (isReviewHoldEntry(e)) reviewHold++;
      else if (isDocumentEntry(e) || isThreeWayMatchEntry(e)) documentAct++;
      else if (isAIEntry(e)) ai++;
      else if (isSecurityEntry(e) || isFailedEntry(e)) security++;
    });

    return {
      total: trail.length,
      approval,
      reviewHold,
      documentAct,
      security,
      ai
    };
  }, [trail, isApprovedEntry, isReviewHoldEntry, isDocumentEntry, isThreeWayMatchEntry, isAIEntry, isSecurityEntry, isFailedEntry]);

  const categoryCounts = useMemo(() => {
    return {
      ALL: trail.length,
      Document: trail.filter(isDocumentEntry).length,
      "Three-Way Match": trail.filter(isThreeWayMatchEntry).length,
      REVIEW_REQUIRED: trail.filter(isReviewRequiredEntry).length,
      "Review / Hold": trail.filter(isReviewHoldEntry).length,
      Approved: trail.filter(isApprovedEntry).length,
      AI: trail.filter(isAIEntry).length,
      Security: trail.filter(isSecurityEntry).length,
      Failed: trail.filter(isFailedEntry).length,
    };
  }, [trail, isDocumentEntry, isThreeWayMatchEntry, isReviewRequiredEntry, isReviewHoldEntry, isApprovedEntry, isAIEntry, isSecurityEntry, isFailedEntry]);

  const filteredTrail = useMemo(() => {
    return trail.filter(entry => {
      const act = (entry.action_type || "").toUpperCase();

      if (selectedCategory === "Document" && !isDocumentEntry(entry)) return false;
      if (selectedCategory === "Three-Way Match" && !isThreeWayMatchEntry(entry)) return false;
      if (selectedCategory === "REVIEW_REQUIRED" && !isReviewRequiredEntry(entry)) return false;
      if (selectedCategory === "Review / Hold" && !isReviewHoldEntry(entry)) return false;
      if (selectedCategory === "Approved" && !isApprovedEntry(entry)) return false;
      if (selectedCategory === "AI" && !isAIEntry(entry)) return false;
      if (selectedCategory === "Security" && !isSecurityEntry(entry)) return false;
      if (selectedCategory === "Failed" && !isFailedEntry(entry)) return false;

      if (selectedUser !== "ALL" && entry.user_name !== selectedUser) return false;

      if (selectedStatusFilter === "SUCCESSFUL" && !act.includes("SUCCESS") && !act.includes("APPROVE") && !act.includes("CONFIRM")) return false;
      if (selectedStatusFilter === "REVIEW_ACTION" && !act.includes("HOLD") && !act.includes("REVIEW") && !isReviewRequiredEntry(entry)) return false;
      if (selectedStatusFilter === "SECURITY" && !act.includes("SECURITY") && !act.includes("SIGN_IN") && !act.includes("TIMEOUT")) return false;
      if (selectedStatusFilter === "FAILED" && !act.includes("FAIL") && !act.includes("REJECT") && !act.includes("COMPROMISED")) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inv = (entry.invoice_number || "").toLowerCase();
        const po = (entry.po_number || "").toLowerCase();
        const grn = (entry.grn_number || "").toLowerCase();
        const user = (entry.user_name || "").toLowerCase();
        const action = (entry.action_type || "").toLowerCase();
        const reason = (entry.decision_reason || "").toLowerCase();
        const dec = (entry.decision || "").toLowerCase();
        const supp = (entry.supplier_name || "").toLowerCase();

        if (
          !inv.includes(q) &&
          !po.includes(q) &&
          !grn.includes(q) &&
          !user.includes(q) &&
          !action.includes(q) &&
          !reason.includes(q) &&
          !dec.includes(q) &&
          !supp.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [trail, selectedCategory, selectedUser, selectedStatusFilter, searchTerm, isDocumentEntry, isThreeWayMatchEntry, isReviewRequiredEntry, isReviewHoldEntry, isApprovedEntry, isAIEntry, isSecurityEntry, isFailedEntry]);

  const getAuditTheme = (entry: App2AuditEntry) => {
    const action = (entry.action_type || "").toUpperCase();
    const decision = (entry.decision || "").toUpperCase();

    if (isReviewRequiredEntry(entry)) {
      return { bg: "bg-amber-50 text-amber-800 border-amber-200", icon: AlertTriangle, textCol: "text-amber-600", label: "⚠️ REVIEW REQUIRED" };
    }
    if (action.includes("HOLD") || action.includes("ASSIGN") || action.includes("REVIEW_NOTE")) {
      return { bg: "bg-amber-50 text-amber-700 border-amber-200", icon: Lock, textCol: "text-amber-600", label: "Review / Hold" };
    }
    if (action.includes("APPROVE") || action.includes("CONFIRM") || decision.includes("APPROVE")) {
      return { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, textCol: "text-emerald-600", label: "Approved" };
    }
    if (action.includes("COMMITTED") || action.includes("IMPORT") || action.includes("DOCUMENT") || action.includes("UPLOAD") || action.includes("MATCH")) {
      return { bg: "bg-blue-50 text-blue-700 border-blue-200", icon: action.includes("MATCH") ? RefreshCcw : FileSpreadsheet, textCol: "text-blue-600", label: "Document" };
    }
    if (action.includes("AI_") || action.includes("EXPLANATION")) {
      return { bg: "bg-purple-50 text-purple-700 border-purple-200", icon: Sparkles, textCol: "text-purple-600", label: "AI Activity" };
    }
    if (action.includes("FAIL") || action.includes("SECURITY") || action.includes("TIMEOUT") || action.includes("REJECT") || action.includes("COMPROMISED")) {
      return { bg: "bg-rose-50 text-rose-700 border-rose-200", icon: ShieldAlert, textCol: "text-rose-600", label: "Security / Alert" };
    }
    return { bg: "bg-slate-50 text-slate-700 border-slate-200", icon: Info, textCol: "text-slate-600", label: "System" };
  };

  const uniqueUsers = useMemo(() => {
    const set = new Set(trail.map(e => e.user_name));
    return Array.from(set);
  }, [trail]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">Audit Trail</h2>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Immutable Transaction Log & Compliance History</p>
        </div>
        {integrityWarning && (
          <div className="bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">Integrity Warning: Chain Compromised</span>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Events</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-slate-900">{summary.total}</span>
            <span className="text-[10px] font-bold text-slate-400">Logged</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Approval Actions</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-emerald-600">{summary.approval}</span>
            <span className="text-[10px] font-bold text-emerald-500">Confirmed</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Review / Hold</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-amber-600">{summary.reviewHold}</span>
            <span className="text-[10px] font-bold text-amber-500">Flagged</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">Document Actions</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-blue-600">{summary.documentAct}</span>
            <span className="text-[10px] font-bold text-blue-500">Imports/Matches</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Security Events</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-rose-600">{summary.security}</span>
            <span className="text-[10px] font-bold text-rose-500">Access/Timeouts</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">AI Actions</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-purple-600">{summary.ai}</span>
            <span className="text-[10px] font-bold text-purple-500">Explanations</span>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Quick Filters</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: "ALL", label: `All (${categoryCounts.ALL})` },
              { id: "Document", label: `Document (${categoryCounts.Document})` },
              { id: "Three-Way Match", label: `Three-Way Match (${categoryCounts["Three-Way Match"]})` },
              { id: "REVIEW_REQUIRED", label: `⚠️ Review Required (${categoryCounts.REVIEW_REQUIRED})` },
              { id: "Review / Hold", label: `Review / Hold (${categoryCounts["Review / Hold"]})` },
              { id: "Approved", label: `Approved (${categoryCounts.Approved})` },
              { id: "AI", label: `AI (${categoryCounts.AI})` },
              { id: "Security", label: `Security (${categoryCounts.Security})` },
              { id: "Failed", label: `Failed (${categoryCounts.Failed})` },
            ].map(pill => (
              <button
                key={pill.id}
                onClick={() => setSelectedCategory(pill.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  selectedCategory === pill.id
                    ? pill.id === "REVIEW_REQUIRED"
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-[#5B3DF5] text-white shadow-sm"
                    : pill.id === "REVIEW_REQUIRED"
                      ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">User</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
            >
              <option value="ALL">All Users</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Status / Outcome</label>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-600"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESSFUL">Successful</option>
              <option value="REVIEW_ACTION">Review Action</option>
              <option value="SECURITY">Security / Auth</option>
              <option value="FAILED">Failed / Rejected</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Search Log</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search invoice, PO, action..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Event</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Document / Ref</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">User</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Result</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTrail.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-slate-400 font-medium italic">
                    {selectedCategory === "REVIEW_REQUIRED"
                      ? "No Review Required audit events match the selected filters."
                      : "No audit records match the selected filters."}
                  </td>
                </tr>
              ) : (
                [...filteredTrail].reverse().map((entry) => {
                  const theme = getAuditTheme(entry);
                  const IconComp = theme.icon;
                  return (
                    <tr key={entry.audit_id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-bold text-slate-900">{formatDate(entry.timestamp)}</p>
                        <p className="text-[9px] font-mono text-slate-400 uppercase">{entry.audit_id}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center border ${theme.bg}`}>
                            <IconComp className="w-3.5 h-3.5" />
                          </span>
                          <span className="text-[11px] font-black uppercase tracking-tight text-slate-800">
                            {entry.action_type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {entry.invoice_number && <p className="text-[10px] font-black text-blue-600 uppercase">Inv: {entry.invoice_number}</p>}
                        {entry.po_number && <p className="text-[10px] font-bold text-slate-600">PO: {entry.po_number}</p>}
                        {!entry.invoice_number && !entry.po_number && <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{entry.user_name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{entry.user_role?.replace(/_/g, ' ') || "AP"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${theme.bg}`}>
                          {entry.decision || theme.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedEntry(entry)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Details Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  Audit Log Details
                </span>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mt-1">
                  {selectedEntry.action_type.replace(/_/g, ' ')}
                </h3>
                <p className="text-xs font-mono text-slate-400 uppercase">ID: {selectedEntry.audit_id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[10px] font-black uppercase text-slate-400">Timestamp</span>
                  <strong className="text-slate-900">{formatDate(selectedEntry.timestamp)}</strong>
                </div>
                <div>
                  <span className="block text-[10px] font-black uppercase text-slate-400">User / Role</span>
                  <strong className="text-slate-900 uppercase">{selectedEntry.user_name} ({selectedEntry.user_role})</strong>
                </div>
              </div>

              {(selectedEntry.invoice_number || selectedEntry.po_number) && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                  {selectedEntry.invoice_number && (
                    <div>
                      <span className="block text-[10px] font-black uppercase text-slate-400">Invoice Number</span>
                      <strong className="text-blue-600">{selectedEntry.invoice_number}</strong>
                    </div>
                  )}
                  {selectedEntry.po_number && (
                    <div>
                      <span className="block text-[10px] font-black uppercase text-slate-400">PO Number</span>
                      <strong className="text-slate-900">{selectedEntry.po_number}</strong>
                    </div>
                  )}
                </div>
              )}

              {selectedEntry.decision_reason && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="block text-[10px] font-black uppercase text-slate-400">Reason / Notes</span>
                  <p className="text-slate-800 font-medium mt-1 leading-relaxed">{selectedEntry.decision_reason}</p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200">
                <span className="block text-[10px] font-black uppercase text-slate-400">Cryptographic Hash Chain</span>
                <p className="font-mono text-[10px] text-slate-500 break-all bg-white p-2 rounded-lg border border-slate-200 mt-1">
                  {selectedEntry.entry_hash}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportsScreen({ reports }: { reports: GeneratedReport[] }) {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">Generated Reports</h2>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Document Export Archive</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-400">
            <FileText className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-black uppercase tracking-widest text-xs">No reports generated yet</p>
          </div>
        ) : (
          [...reports].reverse().map((report) => (
            <div key={report.report_id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <button className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                  <Download className="w-5 h-5 text-slate-400 group-hover:text-blue-600" />
                </button>
              </div>
              <h3 className="text-sm font-black text-slate-900 uppercase truncate mb-1">{report.file_name}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{formatDate(report.generated_at)}</p>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Records</p>
                  <p className="text-sm font-black text-slate-900">{report.record_count}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Size</p>
                  <p className="text-sm font-black text-slate-900">{report.file_size}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NavBtn({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
        active ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" : "text-slate-500 hover:bg-slate-100"
      )}
    >
      {children}
    </button>
  );
}

function UserCard({ user, onLogout, onNavigate }: { user: UserSession, onLogout: () => void, onNavigate: (screen: any) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const getRoleLabel = (role: string) => {
    return role.replace(/_/g, ' ');
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-1.5 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors"
      >
        <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xs">
          {(user.user_name || "User").split(' ').map(n => n[0]).join('').toUpperCase()}
        </div>
        <div className="text-left pr-2 hidden sm:block">
          <p className="text-xs font-black uppercase tracking-tight text-slate-900 leading-none mb-0.5">{user.user_name}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none">{getRoleLabel(user.user_role)}</p>
            <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
            >
              <div className="p-6 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">User Profile</p>
                <p className="font-black text-slate-900 text-lg leading-tight mb-1">{user.user_name}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">ID: {user.staff_id}</p>
              </div>
              <div className="p-2 space-y-1">
                <div className="p-3 bg-blue-50 rounded-xl mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Assigned Role</p>
                  <p className="text-sm font-black text-blue-900 uppercase">{getRoleLabel(user.user_role)}</p>
                </div>
                <button 
                  onClick={() => { onNavigate("PROFILE"); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                >
                  <User className="w-4 h-4" />
                  View Full Profile
                </button>
                <button 
                  onClick={() => { onLogout(); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                >
                  <LogIn className="w-4 h-4 rotate-180" />
                  Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}




function DraftMessageDialog({ draft, onClose, onSend }: { draft: ExternalMessageDraft, onClose: () => void, onSend: (draft: ExternalMessageDraft) => void }) {
  const [editedDraft, setEditedDraft] = useState(draft);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Approve Microsoft Teams Message</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Step 5: Madam Lim's Final Approval</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recipient Channel</label>
               <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-100 font-black text-xs uppercase tracking-widest">
                 <Lock className="w-3.5 h-3.5" /> Microsoft Teams
               </div>
             </div>
             <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recipient Team</label>
               <div className="p-3 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 font-bold text-sm">
                 {draft.recipient} ({draft.recipient_department})
               </div>
             </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message Subject</label>
            <input 
              className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-bold text-sm"
              value={editedDraft.subject}
              onChange={(e) => setEditedDraft({ ...editedDraft, subject: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Message Content (Teams)</label>
            <textarea 
              className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-medium text-sm min-h-[200px] leading-relaxed"
              value={editedDraft.message}
              onChange={(e) => setEditedDraft({ ...editedDraft, message: e.target.value })}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 font-medium leading-relaxed">
              <strong>Control Notice:</strong> Clicking "Approve & Send" will immediately dispatch this message to the target Microsoft Teams channel. This action will be recorded in the audit trail.
            </p>
          </div>
        </div>

        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-3 border-2 border-slate-200 rounded-xl font-black uppercase text-xs tracking-widest text-slate-500 hover:bg-white"
          >
            Cancel Draft
          </button>
          <button 
            onClick={() => onSend(editedDraft)}
            className="px-10 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100"
          >
            Approve & Send to Teams
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const formatDuration = (ms?: number) => {
  if (!ms) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

function SectionHeader({ title, description }: { title: string, description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">{title}</h2>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{description}</p>
    </div>
  );
}

function UploadBox({ type, onUpload, isLoading, label }: { type: string, onUpload: (files: FileList | null) => void, isLoading: boolean, label?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div 
      className={cn(
        "border-2 border-dashed rounded-xl p-12 transition-all flex flex-col items-center justify-center gap-6 cursor-pointer",
        isDragging ? "border-blue-600 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50/50"
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => { setIsDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); onUpload(e.dataTransfer.files); }}
      onClick={() => { fileRef.current?.click(); }}
    >
      <input type="file" multiple={type !== 'XLSX'} accept={type === 'XLSX' ? ".xlsx" : "image/*,application/pdf"} className="hidden" ref={fileRef} onChange={(e) => onUpload(e.target.files)} />
      <div className="w-16 h-16 bg-slate-900 text-white rounded flex items-center justify-center shadow-lg">
        <FileUp className="w-8 h-8" />
      </div>
      <div className="text-center">
        <h3 className="text-2xl font-black uppercase tracking-tighter mb-1">{label || `Drag & Drop ${type} Files`}</h3>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">or click to browse from your computer</p>
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-blue-600 font-black uppercase tracking-widest text-xs bg-white px-4 py-2 rounded border border-blue-100 shadow-sm">
          <RefreshCcw className="w-3 h-3 animate-spin" /> Processing Documents...
        </div>
      )}
    </div>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur rounded-lg text-sm font-bold border border-white/20">
      {icon} {label}
    </div>
  );
}

function SummaryCard({ 
  label, 
  value, 
  supportingText,
  color,
  badge
}: { 
  label: string, 
  value: string | number, 
  supportingText?: string,
  color: 'purple' | 'green' | 'white-purple' | 'orange' | 'navy' | 'indigo' | 'emerald' | 'rose' | 'amber' | 'blue',
  badge?: string
}) {
  const styles: any = {
    purple: "bg-white border-[#E2E8F0] border-l-4 border-l-[#5B3DF5]",
    green: "bg-white border-[#E2E8F0] border-l-4 border-l-[#10B981]",
    "white-purple": "bg-white border-2 border-[#5B3DF5]",
    orange: "bg-white border-[#E2E8F0] border-l-4 border-l-[#F97316]",
    navy: "bg-[#0F172A] text-white border-none",
    indigo: "bg-white border-[#E2E8F0] border-l-4 border-l-[#5B3DF5]",
    emerald: "bg-white border-[#E2E8F0] border-l-4 border-l-[#10B981]",
    amber: "bg-white border-[#E2E8F0] border-l-4 border-l-[#F59E0B]",
    rose: "bg-white border-[#E2E8F0] border-l-4 border-l-[#DC2626]",
    blue: "bg-white border-[#E2E8F0] border-l-4 border-l-[#0F172A]",
  };

  const isDarkNavy = color === "navy";

  return (
    <div className={cn(
      "rounded-2xl p-4 sm:p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-h-[105px]",
      styles[color] || styles.purple
    )}>
      <div className="flex justify-between items-start mb-2">
        <p className={cn("text-[10px] font-bold uppercase tracking-widest", isDarkNavy ? "text-slate-400" : "text-[#64748B]")}>
          {label}
        </p>
        {badge && (
          <span className={cn(
            "px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-full",
            isDarkNavy ? "bg-white/10 text-white" : "bg-[#EEEAFE] text-[#5B3DF5]"
          )}>
            {badge}
          </span>
        )}
      </div>

      <div>
        <p className={cn("text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1", isDarkNavy ? "text-white" : "text-[#111827]")}>
          {value}
        </p>
        {supportingText && (
          <p className={cn("text-[11px] font-medium", isDarkNavy ? "text-slate-400" : "text-[#94A3B8]")}>
            {supportingText}
          </p>
        )}
      </div>
    </div>
  );
}

function ProcessingTable({ jobs, grnRecords, poRecords, onRetry, onDelete, isPaused, onPause, onResume, quotaCooldown }: { 
  jobs: ProcessingJob[], 
  grnRecords: GRNData[],
  poRecords: POData[],
  onRetry: (job: ProcessingJob, forceFresh?: boolean, retryPages?: number[]) => void,
  onDelete: (id: string) => void,
  isPaused: boolean,
  onPause: () => void,
  onResume: () => void,
  quotaCooldown: number
}) {
  return (
    <div className="overflow-x-auto">
      {quotaCooldown > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-black text-amber-900 uppercase tracking-widest">Quota Pause Active</p>
              <p className="text-xs text-amber-700">The extraction service is cooling down. Processing will resume automatically.</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-amber-900">{quotaCooldown}s</p>
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Resume In</p>
          </div>
        </div>
      )}

      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-100 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
          <tr>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Filename / Progress</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-slate-400">Processing Stats</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((job) => {
            const totalPages = job.totalPageCount || 1;
            const allRecords = job.type === 'PO' ? poRecords : grnRecords;
            const recordsExtracted = allRecords.filter(r => r.jobId === job.id && r.sourceFileHash === job.sourceFileHash).length;
            const progress = (recordsExtracted / totalPages) * 100;
            const isCompleted = recordsExtracted === totalPages && totalPages > 0;
            
            const committedPages = new Set(allRecords.filter(r => r.jobId === job.id && r.sourceFileHash === job.sourceFileHash).map(r => r.sourcePageNumber));
            const expectedPages = Array.from({ length: totalPages }, (_, i) => i + 1);
            const missingPagesList = expectedPages.filter(p => !committedPages.has(p));
            
            const showRetry = (job.status === ExtractionStatus.FAILED || job.status === ExtractionStatus.PARTIALLY_COMPLETED || job.status === ExtractionStatus.COMPLETED) && missingPagesList.length > 0;

            const isQuotaError = job.error?.includes("429") || job.error?.includes("RESOURCE_EXHAUSTED");

            return (
              <tr key={job.id} className="group hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : job.status === ExtractionStatus.FAILED || job.status === ExtractionStatus.PARTIALLY_COMPLETED ? (
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                    ) : job.status === ExtractionStatus.WAITING_FOR_RATE_LIMIT || job.status === ExtractionStatus.PAUSED_BY_QUOTA ? (
                      <Lock className="w-4 h-4 text-amber-500" />
                    ) : job.status === ExtractionStatus.QUEUED ? (
                      <History className="w-4 h-4 text-slate-400" />
                    ) : (
                      <RefreshCcw className="w-4 h-4 text-blue-500 animate-spin" />
                    )}
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest",
                      isCompleted ? "bg-emerald-100 text-emerald-700" :
                      job.status === ExtractionStatus.FAILED || job.status === ExtractionStatus.PARTIALLY_COMPLETED ? "bg-rose-100 text-rose-700" :
                      job.status === ExtractionStatus.WAITING_FOR_RATE_LIMIT || job.status === ExtractionStatus.PAUSED_BY_QUOTA ? "bg-amber-100 text-amber-700" :
                      isPaused ? "bg-amber-100 text-amber-700" :
                      job.status === ExtractionStatus.QUEUED || job.status === ExtractionStatus.STARTING ? "bg-slate-100 text-slate-600" :
                      "bg-blue-100 text-blue-700"
                    )}>
                      {isCompleted ? "COMPLETED" : 
                       isPaused ? "PAUSED" :
                       job.status === ExtractionStatus.QUEUED || job.status === ExtractionStatus.STARTING ? "STARTING" :
                       job.status === ExtractionStatus.EXTRACTING || job.status === ExtractionStatus.PROCESSING ? "PROCESSING" :
                       job.status === ExtractionStatus.WAITING_FOR_RATE_LIMIT || job.status === ExtractionStatus.PAUSED_BY_QUOTA ? "PAUSED BY QUOTA" :
                       job.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900">{job.fileName}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{job.currentStep}</span>
                    
                    <div className="mt-2 flex items-center gap-3">
                       <div className="flex-1 h-1.5 min-w-[200px] bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              isCompleted ? "bg-emerald-500" : "bg-blue-600"
                            )}
                            style={{ width: `${progress}%` }}
                          />
                       </div>
                       <span className="text-[10px] font-black text-slate-400">{Math.round(progress)}%</span>
                    </div>

                    {isQuotaError && (
                      <div className="mt-3 p-4 bg-amber-50 border border-amber-100 rounded-xl shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Quota Limit Reached</p>
                        <p className="text-xs text-amber-700 mt-1 font-medium leading-relaxed">
                          Processing is temporarily paused because the extraction service reached its request limit. Completed records are safe. Processing will resume automatically.
                        </p>
                        <details className="mt-2">
                          <summary className="text-[9px] font-bold text-amber-400 cursor-pointer uppercase tracking-widest hover:text-amber-600 transition-colors">View Technical Details</summary>
                          <pre className="mt-2 p-2 bg-slate-900 text-slate-300 rounded text-[9px] overflow-x-auto">
                            {job.error}
                          </pre>
                        </details>
                      </div>
                    )}

                    {!isQuotaError && job.error && (
                      <div className="mt-3 p-3 bg-rose-50 border border-rose-100 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-rose-800">Extraction Error</p>
                          <p className="text-xs text-rose-700 mt-0.5 font-medium leading-relaxed">{job.error}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 uppercase font-bold">Document:</span>
                      <span className="font-black text-slate-700">{totalPages} Pages</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 uppercase font-bold">Extracted:</span>
                      <span className="font-black text-emerald-600">{recordsExtracted}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 uppercase font-bold">Remaining:</span>
                      <span className="font-black text-slate-700">{totalPages - recordsExtracted}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400 uppercase font-bold">Elapsed:</span>
                      <span className="font-black text-slate-900">{formatDuration(Date.now() - (job.startTime || Date.now()))}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 items-center">
                    {(job.status === ExtractionStatus.PROCESSING || job.status === ExtractionStatus.STARTING || job.status === ExtractionStatus.QUEUED || job.status === ExtractionStatus.WAITING_FOR_RATE_LIMIT || job.status === ExtractionStatus.PAUSED_BY_QUOTA || isPaused) && !isCompleted ? (
                      isPaused ? (
                        <button 
                          onClick={onResume}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm"
                        >
                          <RefreshCcw className="w-3.5 h-3.5" /> Resume Processing
                        </button>
                      ) : (
                        <button 
                          onClick={onPause}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-sm"
                        >
                          <Lock className="w-3.5 h-3.5" /> Pause Processing
                        </button>
                      )
                    ) : null}

                    {showRetry && (
                      <button 
                        onClick={() => onRetry(job, false, missingPagesList)} 
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-sm"
                      >
                        <RefreshCcw className="w-3.5 h-3.5" /> Retry Remaining Pages
                      </button>
                    )}

                    {(job.status === ExtractionStatus.FAILED || job.status === ExtractionStatus.PARTIALLY_COMPLETED || job.status === ExtractionStatus.COMPLETED) && (
                      <button 
                        onClick={() => onRetry(job, true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restart Entire Scan
                      </button>
                    )}

                    <button 
                      onClick={() => onDelete(job.id)}
                      className="p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors group/delete"
                      title="Delete Queue Job"
                    >
                      <Trash2 className="w-4 h-4 group-hover/delete:scale-110 transition-transform" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Tables

function POTable({ pos, onReview, onDelete }: { pos: POData[], onReview: (id: string) => void, onDelete: (id: string) => void }) {
  const sortedPos = [...pos].sort((a, b) => {
    if (a.sourceFileName !== b.sourceFileName) return a.sourceFileName.localeCompare(b.sourceFileName);
    return a.sourcePageNumber - b.sourcePageNumber;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
          <tr>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Data Source</th>
            <th className="px-6 py-4">PO Number</th>
            <th className="px-6 py-4">PO Date</th>
            <th className="px-6 py-4">Supplier</th>
            <th className="px-6 py-4">Item</th>
            <th className="px-6 py-4 text-right">Qty</th>
            <th className="px-6 py-4 text-right">Unit Price</th>
            <th className="px-6 py-4 text-right">Total</th>
            <th className="px-6 py-4">Delivery</th>
            <th className="px-6 py-4 text-right">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedPos.map((po) => (
            <tr key={po.poRecordId} className="group hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                  po.extractionStatus === ExtractionStatus.REVIEW_REQUIRED ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                )}>
                  {po.extractionStatus === ExtractionStatus.REVIEW_REQUIRED ? "Review" : "Ready"}
                </span>
              </td>
              <td className="px-6 py-4 font-black text-slate-400 text-xs">Boon Huat Reference Database</td>
              <td className="px-6 py-4 font-black text-slate-900">{po.poNumber || "N/A"}</td>
              <td className="px-6 py-4 text-xs font-bold text-slate-400">{formatDate(po.poDate)}</td>
              <td className="px-6 py-4 text-slate-600 font-bold">{po.supplierName}</td>
              <td className="px-6 py-4 text-slate-400 text-xs italic">{po.itemDescription}</td>
              <td className="px-6 py-4 text-right font-black text-indigo-600">{po.quantityOrdered}</td>
              <td className="px-6 py-4 text-right text-slate-500">{formatCurrency(po.unitPrice, po.currency || "SGD")}</td>
              <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">{formatCurrency(po.totalAmount, po.currency || "SGD")}</td>
              <td className="px-6 py-4 text-xs font-bold text-slate-400">{formatDate(po.expectedDeliveryDate)}</td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <button onClick={() => onReview(po.poRecordId)} className="bg-slate-900 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest hover:bg-slate-800">Review</button>
                  <button onClick={() => onDelete(po.poRecordId)} className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GRNTable({ grns, onReview, onDelete }: { grns: GRNData[], onReview: (id: string) => void, onDelete: (id: string) => void }) {
  const sortedGrns = [...grns].sort((a, b) => {
    if (a.sourceFileName !== b.sourceFileName) return a.sourceFileName.localeCompare(b.sourceFileName);
    return a.sourcePageNumber - b.sourcePageNumber;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse min-w-[1500px]">
        <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
          <tr>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Data Source</th>
            <th className="px-6 py-4">GRN Number</th>
            <th className="px-6 py-4">Date</th>
            <th className="px-6 py-4">PO Number</th>
            <th className="px-6 py-4">Supplier</th>
            <th className="px-6 py-4">Item</th>
            <th className="px-6 py-4 text-right">Ordered</th>
            <th className="px-6 py-4 text-right">Received</th>
            <th className="px-6 py-4 text-right">Diff</th>
            <th className="px-6 py-4 text-right">Damaged</th>
            <th className="px-6 py-4 text-right">Rejected</th>
            <th className="px-6 py-4 text-right">Accepted</th>
            <th className="px-6 py-4">Condition</th>
            <th className="px-6 py-4">Received By</th>
            <th className="px-6 py-4">Notes</th>
            <th className="px-6 py-4">Signature</th>
            <th className="px-6 py-4 text-right">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedGrns.map((g) => {
            const diff = (g.quantityDifference || 0);
            const statusColor = diff === 0 ? "text-emerald-600" : diff > 0 ? "text-amber-600" : "text-red-600";
            
            return (
              <tr key={g.grnRecordId} className="group hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                    g.reviewStatus === ReviewStatus.REVIEW_REQUIRED ? "bg-amber-100 text-amber-600" : 
                    g.reviewStatus === ReviewStatus.REVIEW_APPROVED ? "bg-emerald-100 text-emerald-600" :
                    g.reviewStatus === ReviewStatus.ASSIGNED_TO_WAREHOUSE ? "bg-blue-100 text-blue-600" :
                    "bg-slate-100 text-slate-600"
                  )}>
                    {g.reviewStatus?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 font-black text-slate-400 text-xs">Boon Huat Reference Database</td>
                <td className="px-6 py-4 font-black text-slate-900">{g.grnNumber || "N/A"}</td>
                <td className="px-6 py-4 text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatDate(g.grnDate)}</td>
                <td className="px-6 py-4 font-bold text-indigo-600">{g.poNumber}</td>
                <td className="px-6 py-4 text-slate-600 font-bold truncate max-w-[120px]">{g.supplierName}</td>
                <td className="px-6 py-4 text-slate-400 text-[10px] italic truncate max-w-[120px]">{g.itemDescription}</td>
                <td className="px-6 py-4 text-right font-bold text-slate-400">{g.quantityOrdered}</td>
                <td className="px-6 py-4 text-right font-black text-slate-900">{g.quantityReceived}</td>
                <td className={cn("px-6 py-4 text-right font-black whitespace-nowrap", statusColor)}>
                  {diff === 0 ? "0" : diff > 0 ? `${diff} short` : `${Math.abs(diff)} extra`}
                </td>
                <td className="px-6 py-4 text-right text-red-500 font-bold">{g.damagedQuantity || 0}</td>
                <td className="px-6 py-4 text-right text-red-600 font-bold">{g.rejectedQuantity || 0}</td>
                <td className="px-6 py-4 text-right font-black text-emerald-600">{g.acceptedQuantity}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      (g.condition || "").toUpperCase().includes("GOOD") ? "bg-emerald-500" : "bg-amber-500"
                    )} />
                    <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">{g.condition}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-slate-500 italic text-[10px] whitespace-nowrap">{g.receivedBy}</td>
                <td className="px-6 py-4 text-[10px] text-slate-400 max-w-[150px] truncate" title={g.warehouseNotes || "No additional notes"}>
                  {g.warehouseNotes || <span className="italic text-slate-300">No additional notes</span>}
                </td>
                <td className="px-6 py-4 text-center">
                  {g.signatureDetected ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-300 mx-auto" />}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onReview(g.grnRecordId)} className="bg-slate-900 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest hover:bg-slate-800">Review</button>
                    <button onClick={() => onDelete(g.grnRecordId)} className="p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: InvoiceData[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
          <tr>
            <th className="px-6 py-4">Status</th>
            <th className="px-6 py-4">Record ID</th>
            <th className="px-6 py-4">Invoice #</th>
            <th className="px-6 py-4">Supplier</th>
            <th className="px-6 py-4">PO Ref</th>
            <th className="px-6 py-4">Invoice Date</th>
            <th className="px-6 py-4">Due Date</th>
            <th className="px-6 py-4 text-right">Total Amount</th>
            <th className="px-6 py-4">Approved By</th>
            <th className="px-6 py-4">Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map((inv, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4">
                {inv.importIssues.length > 0 ? (
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-black uppercase" title={inv.importIssues.join(', ')}>Review Required</span>
                ) : (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-black uppercase">✓ Imported</span>
                )}
              </td>
              <td className="px-6 py-4 font-mono text-[10px] text-slate-400">{inv.record_id}</td>
              <td className="px-6 py-4 font-black text-slate-900">{inv.invoice_number}</td>
              <td className="px-6 py-4 text-slate-600 font-bold">{inv.supplier_name}</td>
              <td className="px-6 py-4 font-bold text-indigo-600">{inv.po_number}</td>
              <td className="px-6 py-4 text-xs font-bold text-slate-400">{formatDate(inv.invoice_date)}</td>
              <td className="px-6 py-4 text-xs font-bold text-slate-400">{formatDate(inv.due_date)}</td>
              <td className="px-6 py-4 text-right font-black text-slate-900">{formatCurrency(inv.total_amount, inv.currency)}</td>
              <td className="px-6 py-4">
                <span className="bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-tight">{inv.approved_by || "System"}</span>
              </td>
              <td className="px-6 py-4">
                <button className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline">View</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchTable({ results, onReview }: { results: MatchResult[], onReview: (id: string) => void }) {
  const getStatusBadge = (status: MatchStatus) => {
    switch (status) {
      case MatchStatus.CLEAN_MATCH:
      case MatchStatus.MATCHED:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">✓ CLEAN MATCH</span>;
      case MatchStatus.PASS_WITH_LIMITATION:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200">⚠ PASS WITH LIMITATION</span>;
      case MatchStatus.QUANTITY_MISMATCH:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-red-100 text-red-800 border border-red-200">▼ QTY MISMATCH</span>;
      case MatchStatus.PRICE_MISMATCH:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-red-100 text-red-800 border border-red-200">▲ PRICE MISMATCH</span>;
      case MatchStatus.CONDITION_ISSUE:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">● CONDITION ISSUE</span>;
      case MatchStatus.POSSIBLE_DUPLICATE:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200">⚠ DUPLICATE</span>;
      case MatchStatus.NO_PO_FOUND:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-slate-100 text-slate-800 border border-slate-200">■ NO PO FOUND</span>;
      case MatchStatus.NO_GRN_FOUND:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-slate-100 text-slate-800 border border-slate-200">■ NO GRN FOUND</span>;
      case MatchStatus.SUPPLIER_MISMATCH:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-red-100 text-red-800 border border-red-200">■ SUPPLIER MISMATCH</span>;
      case MatchStatus.MULTIPLE_ISSUES:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-red-100 text-red-800 border border-red-200">■ MULTIPLE ISSUES</span>;
      case MatchStatus.INVALID_INVOICE_DATA:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-200">■ INVALID INVOICE</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-slate-100 text-slate-800 border border-slate-200">{String(status).replace(/_/g, ' ')}</span>;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1300px]">
        <thead className="bg-white sticky top-0 z-10 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
          <tr>
            <th className="p-4 w-[170px] min-w-[170px] sticky left-0 bg-white z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Status</th>
            <th className="p-4 w-[120px] min-w-[120px]">Invoice</th>
            <th className="p-4 w-[180px] min-w-[180px]">Supplier</th>
            <th className="p-4 w-[130px] min-w-[130px]">PO Reference</th>
            <th className="p-4 min-w-[320px] flex-1">Match Summary</th>
            <th className="p-4 w-[120px] min-w-[120px] text-right">Financial Impact</th>
            <th className="p-4 w-[130px] min-w-[130px]">Responsible Department</th>
            <th className="p-4 w-[140px] min-w-[140px]">Approval Status</th>
            <th className="p-4 w-[150px] min-w-[150px] text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {results.map(res => (
            <tr key={res.matchRecordId} className={cn(
              "hover:bg-slate-50 transition-colors",
              res.status !== MatchStatus.CLEAN_MATCH && res.status !== MatchStatus.PASS_WITH_LIMITATION && "bg-amber-50/20"
            )}>
              <td className="p-4 sticky left-0 bg-inherit z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                {getStatusBadge(res.status)}
              </td>
              <td className="p-4 font-black text-slate-900 text-xs">{res.invoiceNumber}</td>
              <td className="p-4">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-800 text-xs">{res.supplierName}</span>
                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-[160px]">{res.itemDescription}</span>
                </div>
              </td>
              <td className="p-4 font-mono font-bold text-xs text-indigo-600">{res.poNumber || "N/A"}</td>
              <td className="p-4 text-xs font-medium text-slate-600 leading-relaxed min-w-[320px]">{res.shortReason}</td>
              <td className="p-4 text-right font-mono text-xs font-bold text-slate-800">
                {res.potentialFinancialImpact && res.potentialFinancialImpact > 0 ? (
                  <span className="text-rose-600">+${res.potentialFinancialImpact.toFixed(2)}</span>
                ) : res.potentialFinancialImpact === 0 ? (
                  <span className="text-emerald-600">$0.00</span>
                ) : "N/A"}
              </td>
              <td className="p-4">
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded text-[10px] font-black uppercase">
                  {res.assignedDepartment || "ACCOUNTS"}
                </span>
              </td>
              <td className="p-4">
                {res.humanDecision ? (
                  <span className="px-2 py-0.5 bg-blue-100 border border-blue-200 text-blue-800 rounded text-[10px] font-black uppercase">
                    Decision Recorded
                  </span>
                ) : res.status === MatchStatus.CLEAN_MATCH ? (
                  <span className="px-2 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded text-[10px] font-black uppercase">
                    Eligible for Approval
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 rounded text-[10px] font-black uppercase">
                    Pending Review
                  </span>
                )}
              </td>
              <td className="p-4 text-center">
                <button 
                  onClick={() => onReview(res.matchRecordId)} 
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase rounded-lg shadow-sm transition-all"
                >
                  View Explanation
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Review Components

function PDFPagePreview({ fileId, pageNumber, fileName }: { fileId: string, pageNumber: number, fileName: string }) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [reviewPdfUrl, setReviewPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>(PreviewState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'none'>('width');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchBlob = async () => {
      if (!fileId) return;
      setPreviewState(PreviewState.LOADING_SOURCE);
      try {
        const file = await getFile(fileId);
        if (file) {
          setPdfBlob(file);
          setPreviewState(PreviewState.LOADING_DOCUMENT);
        } else {
          setPreviewState(PreviewState.SOURCE_NOT_FOUND);
        }
      } catch (err: any) {
        setError(err.message);
        setPreviewState(PreviewState.RENDER_ERROR);
      }
    };
    fetchBlob();
  }, [fileId]);

  useEffect(() => {
    if (!pdfBlob) return;
    const objectUrl = URL.createObjectURL(pdfBlob);
    setReviewPdfUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [pdfBlob]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    if (pageNumber < 1 || pageNumber > numPages) {
      setError(`Source page ${pageNumber} could not be found in this PDF (Total pages: ${numPages}).`);
      setPreviewState(PreviewState.RENDER_ERROR);
    } else {
      setPreviewState(PreviewState.RENDERING_PAGE);
    }
  };

  const onDocumentLoadError = (err: Error) => {
    setError(err.message);
    setPreviewState(PreviewState.RENDER_ERROR);
  };

  const onPageRenderSuccess = () => {
    setPreviewState(PreviewState.READY);
  };

  const handleLocateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (hash === fileId) {
      await saveFile(hash, file);
      setPdfBlob(file);
      setError(null);
      setPreviewState(PreviewState.LOADING_DOCUMENT);
    } else {
      alert("Selected file does not match the expected source document. Please select the correct PDF.");
    }
  };

  const renderStatus = () => {
    switch (previewState) {
      case PreviewState.LOADING_SOURCE:
        return (
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <RefreshCcw className="w-8 h-8 animate-spin" />
            <span className="font-bold">Retrieving Source...</span>
          </div>
        );
      case PreviewState.LOADING_DOCUMENT:
        return (
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <RefreshCcw className="w-8 h-8 animate-spin" />
            <span className="font-bold">Loading Document...</span>
          </div>
        );
      case PreviewState.RENDERING_PAGE:
        return (
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <RefreshCcw className="w-8 h-8 animate-spin" />
            <span className="font-bold">Rendering Page {pageNumber}...</span>
          </div>
        );
      case PreviewState.SOURCE_NOT_FOUND:
        return (
          <div className="p-8 text-center space-y-6">
            <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <div className="space-y-2">
              <h5 className="text-white font-black uppercase tracking-tight text-xl">Original document is unavailable</h5>
              <p className="text-slate-400 text-sm">We couldn't find the source file in local storage.</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-left space-y-1">
              <div className="flex justify-between text-[10px] uppercase font-black tracking-widest text-slate-500">
                <span>Expected File</span>
                <span>Page</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-300">
                <span className="truncate max-w-[200px]">{fileName}</span>
                <span>{pageNumber}</span>
              </div>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 mx-auto"
            >
              <FileSearch className="w-4 h-4" /> Locate Source File
            </button>
            <input type="file" ref={fileInputRef} onChange={handleLocateFile} className="hidden" accept="application/pdf" />
          </div>
        );
      case PreviewState.RENDER_ERROR:
        return (
          <div className="p-8 text-center space-y-4">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <p className="text-white font-bold">{error || "Failed to render PDF page."}</p>
            <details className="text-[10px] text-slate-500 text-left bg-slate-900 p-2 rounded max-w-xs mx-auto">
              <summary className="cursor-pointer">Technical Details</summary>
              <pre className="mt-2 whitespace-pre-wrap">{error}</pre>
            </details>
            <button onClick={() => setPreviewState(PreviewState.LOADING_SOURCE)} className="text-blue-400 text-xs font-bold hover:underline">Retry Loading</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
      <div className="bg-slate-950 px-4 py-3 flex justify-between items-center border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-2 rounded-lg">
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1 truncate max-w-[120px]">{fileName}</span>
            <span className="text-white font-bold text-xs">Page {pageNumber} {numPages && `of ${numPages}`}</span>
          </div>
        </div>
        
        {previewState === PreviewState.READY && (
          <div className="flex items-center gap-1">
            <button onClick={() => setRotation(r => r - 90)} title="Rotate Left" className="p-2 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={() => setRotation(r => r + 90)} title="Rotate Right" className="p-2 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors">
              <RotateCw className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1" />
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} title="Zoom Out" className="p-2 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-black text-slate-500 w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(3, s + 0.1))} title="Zoom In" className="p-2 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors">
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1" />
            <button 
              onClick={() => { setScale(1); setFitMode('width'); }} 
              title="Fit Width" 
              className={cn("p-2 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors", fitMode === 'width' && "text-blue-400 bg-blue-400/10")}
            >
              <Maximize className="w-4 h-4" />
            </button>
            {reviewPdfUrl && (
              <a href={reviewPdfUrl} target="_blank" rel="noopener noreferrer" className="ml-2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors" title="Open Original PDF">
                <Eye className="w-4 h-4" />
              </a>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 relative overflow-auto bg-slate-950/50 p-6 flex items-start justify-center">
        {previewState !== PreviewState.READY && (
          <div className="absolute inset-0 z-10 bg-slate-950 flex items-center justify-center">
            {renderStatus()}
          </div>
        )}
        
        {reviewPdfUrl && (
          <div className={cn("transition-all duration-300 shadow-2xl bg-white", previewState === PreviewState.READY ? "opacity-100 scale-100" : "opacity-0 scale-95")}>
            <Document 
              file={reviewPdfUrl} 
              onLoadSuccess={onDocumentLoadSuccess} 
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              <Page 
                pageNumber={pageNumber} 
                scale={scale} 
                rotate={rotation}
                onRenderSuccess={onPageRenderSuccess}
                loading={null}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}

function POReview({ data, onSave }: { data: POData, onSave: (updated: Partial<POData>) => void }) {
  const [formData, setFormData] = useState({ ...data });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[600px]">
      <div className="space-y-4 overflow-y-auto pr-4">
        <h4 className="font-black text-slate-400 uppercase text-xs tracking-widest">Extracted Fields</h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PO Number" value={formData.poNumber || ""} onChange={(v) => setFormData(p => ({ ...p, poNumber: v }))} />
          <Field label="PO Date" value={formData.poDate || ""} onChange={(v) => setFormData(p => ({ ...p, poDate: v }))} type="date" />
          <Field label="Supplier" value={formData.supplierName || ""} onChange={(v) => setFormData(p => ({ ...p, supplierName: v }))} />
          <Field label="Total Amount" value={formData.totalAmount?.toString() || ""} onChange={(v) => setFormData(p => ({ ...p, totalAmount: parseFloat(v) }))} type="number" />
          <div className="col-span-2">
            <Field label="Item Description" value={formData.itemDescription || ""} onChange={(v) => setFormData(p => ({ ...p, itemDescription: v }))} />
          </div>
          <Field label="Quantity" value={formData.quantityOrdered?.toString() || ""} onChange={(v) => setFormData(p => ({ ...p, quantityOrdered: parseFloat(v) }))} type="number" />
          <Field label="Unit Price" value={formData.unitPrice?.toString() || ""} onChange={(v) => setFormData(p => ({ ...p, unitPrice: parseFloat(v) }))} type="number" />
        </div>
        <button onClick={() => onSave(formData)} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 mt-4">
          <Save className="w-4 h-4" /> Save Corrections
        </button>
      </div>
      <PDFPagePreview fileId={data.sourceFileHash} pageNumber={data.sourcePageNumber} fileName={data.sourceFileName} />
    </div>
  );
}

function GRNReview({ data, auditLog, onAction }: { 
  data: GRNData, 
  auditLog: AuditRecord[],
  onAction: (action: string, updated: Partial<GRNData>, reason?: string) => void 
}) {
  const [formData, setFormData] = useState({ ...data });
  const [reason, setReason] = useState("");
  
  const preview = calculateGRNFields({ ...formData });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px] overflow-hidden">
      {/* LEFT: PDF */}
      <div className="lg:col-span-5 h-full relative">
         <PDFPagePreview fileId={data.sourceFileHash} pageNumber={data.sourcePageNumber} fileName={data.sourceFileName} />
      </div>

      {/* CENTRE: EDITABLE DATA */}
      <div className="lg:col-span-4 h-full overflow-y-auto px-4 space-y-6 bg-white border-x border-slate-100 pb-20">
         <h4 className="font-black text-slate-400 uppercase text-xs tracking-widest sticky top-0 bg-white py-4 z-10 border-b border-slate-50">Handwritten Data Centre</h4>
         <div className="space-y-4">
            <EditableField label="GRN Number" value={formData.grnNumber || ""} original={data.grnNumber || ""} onChange={v => setFormData(p => ({ ...p, grnNumber: v }))} />
            <EditableField label="GRN Date" value={formData.grnDate || ""} original={data.grnDate || ""} onChange={v => setFormData(p => ({ ...p, grnDate: v }))} type="date" />
            <EditableField label="PO Reference" value={formData.poNumber || ""} original={data.poNumber || ""} onChange={v => setFormData(p => ({ ...p, poNumber: v }))} />
            <EditableField label="Supplier" value={formData.supplierName || ""} original={data.supplierName || ""} onChange={v => setFormData(p => ({ ...p, supplierName: v }))} />
            
            <div className="grid grid-cols-2 gap-4">
               <EditableField label="Qty Ordered" value={formData.quantityOrdered?.toString() || ""} original={data.quantityOrdered?.toString() || ""} onChange={v => setFormData(p => ({ ...p, quantityOrdered: parseFloat(v) || 0 }))} type="number" />
               <EditableField label="Qty Received" value={formData.quantityReceived?.toString() || ""} original={data.quantityReceived?.toString() || ""} onChange={v => setFormData(p => ({ ...p, quantityReceived: parseFloat(v) || 0 }))} type="number" />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <EditableField label="Damaged Qty" value={formData.damagedQuantity?.toString() || "0"} original={data.damagedQuantity?.toString() || "0"} onChange={v => setFormData(p => ({ ...p, damagedQuantity: parseFloat(v) || 0 }))} type="number" />
               <EditableField label="Rejected Qty" value={formData.rejectedQuantity?.toString() || "0"} original={data.rejectedQuantity?.toString() || "0"} onChange={v => setFormData(p => ({ ...p, rejectedQuantity: parseFloat(v) || 0 }))} type="number" />
            </div>

            <EditableField label="Condition" value={formData.condition || ""} original={data.condition || ""} onChange={v => setFormData(p => ({ ...p, condition: v }))} />
            <EditableField label="Received By" value={formData.receivedBy || ""} original={data.receivedBy || ""} onChange={v => setFormData(p => ({ ...p, receivedBy: v }))} />
            <EditableField label="Warehouse Notes" value={formData.warehouseNotes || ""} original={data.warehouseNotes || ""} onChange={v => setFormData(p => ({ ...p, warehouseNotes: v }))} isArea />
         </div>
      </div>

      {/* RIGHT: REASONS & ACTIONS */}
      <div className="lg:col-span-3 h-full overflow-y-auto space-y-6 pb-20">
         <div className="bg-slate-900 text-white p-6 rounded-2xl space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Review Summary</h4>
            <div className="space-y-2">
               {preview.reviewReasons.map((r, i) => (
                  <div key={i} className="flex gap-2 text-xs font-bold leading-relaxed text-amber-400">
                     <AlertTriangle className="w-4 h-4 shrink-0" />
                     <span>{r}</span>
                  </div>
               ))}
               {preview.reviewReasons.length === 0 && <div className="text-emerald-400 text-xs font-bold flex gap-2"><CheckCircle2 className="w-4 h-4" /> Ready for approval</div>}
            </div>
            
            <div className="pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
               <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase">Diff</p>
                  <p className={cn("text-xl font-black", (preview.quantityDifference || 0) > 0 ? "text-amber-400" : "text-emerald-400")}>
                    {preview.quantityDifference}
                  </p>
               </div>
               <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase">Accepted</p>
                  <p className="text-xl font-black text-white">{preview.acceptedQuantity}</p>
               </div>
            </div>
         </div>

         <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reviewer's Note / Reason</label>
            <textarea 
               value={reason} 
               onChange={e => setReason(e.target.value)}
               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-200 min-h-[80px]"
               placeholder="Mandatory for any correction..."
            />
            
            <div className="grid grid-cols-1 gap-2 pt-2">
               <button 
                  onClick={() => onAction('APPROVE', formData, reason)}
                  disabled={preview.reviewStatus === ReviewStatus.REVIEW_REQUIRED && !reason}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 disabled:opacity-50"
               >
                  Approve Extracted GRN
               </button>
               <button 
                  onClick={() => onAction('SAVE_CORRECTIONS', formData, reason)}
                  disabled={!reason}
                  className="w-full py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 disabled:opacity-50"
               >
                  Save Corrections
               </button>
               <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onAction('SEND_TO_WAREHOUSE', formData, reason)} className="py-3 bg-blue-100 text-blue-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-200">Warehouse</button>
                  <button onClick={() => onAction('KEEP_FOR_REVIEW', formData, reason)} className="py-3 bg-amber-100 text-amber-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-amber-200">Hold</button>
               </div>
               <button onClick={() => onAction('MARK_SIGNATURE_UNCLEAR', formData, reason)} className="w-full py-3 border border-slate-200 text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50">Signature Unclear</button>
               <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onAction('DELETE', formData, reason)} className="py-3 border border-rose-200 text-rose-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-rose-50">Delete GRN</button>
                  <button onClick={() => onAction('CANCEL', formData, reason)} className="py-3 border border-slate-200 text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-50">Cancel</button>
               </div>
            </div>
         </div>

         <div className="space-y-3">
            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><History className="w-3 h-3" /> Audit History</h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
               {auditLog.map((log, i) => (
                  <div key={i} className="text-[10px] p-2 bg-slate-50 rounded border border-slate-100">
                     <div className="flex justify-between font-bold text-slate-400 mb-1">
                        <span>{log.action}</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                     </div>
                     <p className="text-slate-600 leading-tight">{log.notes}</p>
                  </div>
               ))}
               {auditLog.length === 0 && <p className="text-[10px] text-slate-400 italic">No previous actions.</p>}
            </div>
         </div>
      </div>
    </div>
  );
}

function MatchReview({ data, onSave, onQuery, onAssign, onGenerateAi }: { 
  data: MatchResult, 
  onSave: (decision: string, notes: string) => void, 
  onQuery: (draft: ExternalMessageDraft) => void,
  onAssign: (dept: string) => void,
  onGenerateAi?: (id: string) => void
}) {
  const [notes, setNotes] = useState(data.reviewNotes || "");
  const [copySuccess, setCopySuccess] = useState(false);

  const ruleBased = data.ruleBasedExplanation || generateRuleBasedExplanation(data);

  const isClean = data.status === MatchStatus.CLEAN_MATCH;

  const handleCopyExplanation = () => {
    const textToCopy = data.aiExplanation || `${ruleBased.whatWasChecked}\n${ruleBased.whatWasFound}\n${ruleBased.whyStatusGiven}\nFinancial Impact: ${ruleBased.financialImpactText}\nRecommended Action: ${ruleBased.recommendedActionText}`;
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getStatusLabel = (s: MatchStatus) => {
    switch (s) {
      case MatchStatus.CLEAN_MATCH:
        return "CLEAN MATCH";
      case MatchStatus.PASS_WITH_LIMITATION:
        return "PASS WITH LIMITATION";
      case MatchStatus.QUANTITY_MISMATCH:
        return "QUANTITY MISMATCH";
      case MatchStatus.PRICE_MISMATCH:
        return "PRICE MISMATCH";
      case MatchStatus.CONDITION_ISSUE:
        return "CONDITION ISSUE";
      case MatchStatus.POSSIBLE_DUPLICATE:
        return "POSSIBLE DUPLICATE";
      case MatchStatus.NO_PO_FOUND:
        return "NO PO FOUND";
      case MatchStatus.NO_GRN_FOUND:
        return "NO GRN FOUND";
      case MatchStatus.SUPPLIER_MISMATCH:
        return "SUPPLIER MISMATCH";
      case MatchStatus.MULTIPLE_ISSUES:
        return "MULTIPLE ISSUES";
      case MatchStatus.INVALID_INVOICE_DATA:
        return "INVALID INVOICE DATA";
      default:
        return String(s).replace(/_/g, ' ');
    }
  };

  const getStatusBadge = (s: MatchStatus) => {
    const label = getStatusLabel(s);
    if (s === MatchStatus.CLEAN_MATCH) {
      return <span className="px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-black text-xs uppercase tracking-wider">✓ {label}</span>;
    }
    if (s === MatchStatus.PASS_WITH_LIMITATION) {
      return <span className="px-3 py-1 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg font-black text-xs uppercase tracking-wider">⚠ {label}</span>;
    }
    return <span className="px-3 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-black text-xs uppercase tracking-wider">⚠ {label}</span>;
  };

  return (
    <div className="space-y-8 pb-10">
      {/* 1. TOP HEADER & STATUS BANNER */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            {getStatusBadge(data.status)}
            {data.autoApprove ? (
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg font-bold text-xs uppercase">
                Eligible for Approval Confirmation
              </span>
            ) : (
              <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold text-xs uppercase">
                Human Review Required
              </span>
            )}
            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg font-bold text-xs uppercase">
              Dept: {data.assignedDepartment || ruleBased.responsibleDepartmentText}
            </span>
          </div>
          <h3 className="text-xl font-black tracking-tight text-white mt-2">
            Invoice {data.invoiceNumber} — {data.supplierName}
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            PO Ref: <span className="font-mono text-indigo-300 font-bold">{data.poNumber || "N/A"}</span> | 
            Invoice Total: <span className="font-bold text-white">{formatCurrency(data.actualInvoiceAmount)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onGenerateAi && (
            <button
              onClick={() => onGenerateAi(data.matchRecordId)}
              disabled={data.aiExplanationStatus === "GENERATING"}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-md"
            >
              <RefreshCcw className={cn("w-4 h-4", data.aiExplanationStatus === "GENERATING" && "animate-spin")} />
              {data.aiExplanationStatus === "GENERATING" ? "Generating..." : data.aiExplanation ? "Regenerate AI Explanation" : "Generate AI Explanation"}
            </button>
          )}
          <button
            onClick={handleCopyExplanation}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all border border-slate-700"
          >
            <Copy className="w-4 h-4" />
            {copySuccess ? "Copied!" : "Copy Explanation"}
          </button>
        </div>
      </div>

      {/* 2. AI EXPLANATION PANEL */}
      <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border border-indigo-100 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
              <Bot className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-900">
              AI-Generated Plain-Language Explanation
            </h4>
          </div>
          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">
            Powered by Gemini
          </span>
        </div>

        {data.aiExplanationStatus === "GENERATING" && (
          <div className="flex items-center gap-3 p-6 bg-white/80 rounded-xl border border-indigo-100 text-indigo-900">
            <RefreshCcw className="w-5 h-5 text-indigo-600 animate-spin" />
            <span className="text-sm font-bold">Preparing a plain-language explanation for Madam Lim…</span>
          </div>
        )}

        {data.aiExplanationStatus === "FAILED" && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-3">
            <div className="flex items-center gap-2 font-bold text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>AI explanation is temporarily unavailable. A rule-based explanation is shown below instead.</span>
            </div>

            {data.aiExplanationTechDetails && (
              <details className="text-[11px] text-amber-800 bg-amber-100/60 p-2.5 rounded-lg border border-amber-200">
                <summary className="font-bold cursor-pointer hover:underline text-amber-900">
                  View Technical Details
                </summary>
                <div className="mt-2 space-y-1 font-mono text-[10px] pl-1 pt-1.5 border-t border-amber-200">
                  <p><strong>Endpoint:</strong> {data.aiExplanationTechDetails.endpoint}</p>
                  <p><strong>HTTP Method:</strong> {data.aiExplanationTechDetails.method}</p>
                  <p><strong>HTTP Status:</strong> {data.aiExplanationTechDetails.status}</p>
                  <p><strong>Error Code:</strong> {data.aiExplanationTechDetails.errorCode}</p>
                  <p><strong>Request ID:</strong> {data.aiExplanationTechDetails.requestId}</p>
                  <p><strong>Timestamp:</strong> {data.aiExplanationTechDetails.timestamp}</p>
                </div>
              </details>
            )}
          </div>
        )}

        {data.aiExplanationStatus === "SUCCESS" && data.aiExplanation && (
          <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm text-slate-800 text-xs leading-relaxed space-y-3">
            <div className="whitespace-pre-wrap font-sans">{data.aiExplanation}</div>
          </div>
        )}

        {(!data.aiExplanationStatus || data.aiExplanationStatus === "IDLE") && !data.aiExplanation && (
          <div className="bg-white/60 p-4 rounded-xl border border-indigo-100 text-slate-600 text-xs flex items-center justify-between">
            <span>Click "Generate AI Explanation" above to request an AI-generated explanation for this record.</span>
            {onGenerateAi && (
              <button
                onClick={() => onGenerateAi(data.matchRecordId)}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-[11px] hover:bg-indigo-700 transition-all"
              >
                Generate Now
              </button>
            )}
          </div>
        )}

        <p className="text-[10px] text-slate-500 italic font-medium pt-1">
          Disclaimer: AI-generated explanations are provided for analysis only. Matching status is calculated deterministically.
        </p>
      </div>

      {/* 3. RULE-BASED EXPLANATION PANEL (DETERMINISTIC SOURCE OF TRUTH) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <ShieldAlert className="w-5 h-5 text-blue-600" />
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900">
              Rule-Based Explanation (Deterministic Source of Truth)
            </h4>
            <p className="text-[11px] text-slate-500">
              Calculated deterministically based on Boon Huat hardware business rules.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div className="space-y-1">
            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] block">A. What Was Checked</span>
            <p className="text-slate-800 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">{ruleBased.whatWasChecked}</p>
          </div>
          <div className="space-y-1">
            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] block">B. What Was Found</span>
            <p className="text-slate-800 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">{ruleBased.whatWasFound}</p>
          </div>
          <div className="space-y-1">
            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] block">C. Why Status Was Given</span>
            <p className="text-slate-800 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">{ruleBased.whyStatusGiven}</p>
          </div>
          <div className="space-y-1">
            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] block">D. Financial Impact</span>
            <p className="text-slate-800 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">{ruleBased.financialImpactText}</p>
          </div>
          <div className="space-y-1">
            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] block">E. Recommended Action</span>
            <p className="text-slate-800 font-medium bg-slate-50 p-3 rounded-xl border border-slate-100">{ruleBased.recommendedActionText}</p>
          </div>
          <div className="space-y-1">
            <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] block">F. Responsible Department</span>
            <p className="text-indigo-900 font-bold bg-indigo-50 p-3 rounded-xl border border-indigo-100">{ruleBased.responsibleDepartmentText}</p>
          </div>
        </div>
      </div>

      {/* 4. CHECKS COMPLETED & CHECKS NOT COMPLETED */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Checks Completed
          </h4>
          <div className="space-y-2 text-xs">
            {Object.entries(data.checks)
              .filter(([_, status]) => status !== CheckStatus.NOT_TESTED)
              .map(([checkKey, status]) => (
                <div key={checkKey} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <span className="font-bold text-slate-700 capitalize">
                    {checkKey.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded text-[10px] font-black uppercase",
                    status === CheckStatus.PASS ? "bg-emerald-100 text-emerald-800" :
                    status === CheckStatus.FAIL ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                  )}>
                    {status}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600" /> Checks Not Completed
          </h4>
          <div className="space-y-2 text-xs">
            {Object.entries(data.checks)
              .filter(([_, status]) => status === CheckStatus.NOT_TESTED)
              .map(([checkKey, _]) => (
                <div key={checkKey} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 capitalize">
                      {checkKey.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-black uppercase">
                      NOT TESTED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Invoice line-item data was not included in the imported App 1 workbook.
                  </p>
                </div>
              ))}
            {Object.values(data.checks).every(status => status !== CheckStatus.NOT_TESTED) && (
              <p className="text-slate-400 italic text-xs py-4 text-center">All standard matching checks were completed.</p>
            )}
          </div>
        </div>
      </div>

      {/* 5. SIDE-BY-SIDE DOCUMENT COMPARISON TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm overflow-x-auto">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-indigo-600" /> Document Comparison (PO vs GRN vs Invoice)
        </h4>

        <table className="w-full text-left text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-black uppercase text-[10px] border-b border-slate-200">
              <th className="p-3">Metric</th>
              <th className="p-3">Purchase Order (PO)</th>
              <th className="p-3">Goods Received Note (GRN)</th>
              <th className="p-3">Invoice (App 1)</th>
              <th className="p-3 text-center">Check Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
            <tr>
              <td className="p-3 font-bold text-slate-900">Supplier Name</td>
              <td className="p-3">{data.supplierName}</td>
              <td className="p-3">{data.grnNumbers.length > 0 ? data.supplierName : "N/A"}</td>
              <td className="p-3 font-bold">{data.supplierName}</td>
              <td className="p-3 text-center">
                <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase", data.checks.supplierMatch === CheckStatus.PASS ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")}>
                  {data.checks.supplierMatch}
                </span>
              </td>
            </tr>

            <tr>
              <td className="p-3 font-bold text-slate-900">Item Description</td>
              <td className="p-3">{data.itemDescription}</td>
              <td className="p-3">{data.itemDescription}</td>
              <td className="p-3 italic text-slate-400">
                {data.invoiceQuantity === null ? "N/A — Not available in App 1 export" : data.itemDescription}
              </td>
              <td className="p-3 text-center">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                  {data.invoiceQuantity === null ? "NOT TESTED" : "PASS"}
                </span>
              </td>
            </tr>

            <tr>
              <td className="p-3 font-bold text-slate-900">Quantity</td>
              <td className="p-3">{data.poQuantityOrdered} pcs (Ordered)</td>
              <td className="p-3">
                {data.acceptedQuantity} pcs (Accepted) / {data.grnQuantityReceived} pcs (Received)
              </td>
              <td className="p-3">
                {data.invoiceQuantity === null ? (
                  <span className="text-slate-400 italic">N/A — Not available in App 1 export</span>
                ) : (
                  <span className="font-bold">{data.invoiceQuantity} pcs</span>
                )}
              </td>
              <td className="p-3 text-center">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                  data.checks.quantityCheck === CheckStatus.PASS ? "bg-emerald-100 text-emerald-800" :
                  data.checks.quantityCheck === CheckStatus.FAIL ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
                )}>
                  {data.checks.quantityCheck}
                </span>
              </td>
            </tr>

            <tr>
              <td className="p-3 font-bold text-slate-900">Unit Price</td>
              <td className="p-3">{formatCurrency(data.poUnitPrice)}</td>
              <td className="p-3 text-slate-400 font-mono">N/A (GRN)</td>
              <td className="p-3">
                {data.invoiceUnitPrice === null ? (
                  <span className="text-slate-400 italic">N/A — Not available in App 1 export</span>
                ) : (
                  <span className="font-bold">{formatCurrency(data.invoiceUnitPrice)}</span>
                )}
              </td>
              <td className="p-3 text-center">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                  data.checks.priceCheck === CheckStatus.PASS ? "bg-emerald-100 text-emerald-800" :
                  data.checks.priceCheck === CheckStatus.FAIL ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
                )}>
                  {data.checks.priceCheck}
                </span>
              </td>
            </tr>

            <tr>
              <td className="p-3 font-bold text-slate-900">Total Amount</td>
              <td className="p-3">{formatCurrency(data.expectedInvoiceAmount || 0)}</td>
              <td className="p-3 text-slate-400 font-mono">N/A (GRN)</td>
              <td className="p-3 font-bold text-slate-900">{formatCurrency(data.actualInvoiceAmount)}</td>
              <td className="p-3 text-center">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                  data.checks.totalAmountMatch === CheckStatus.PASS ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                )}>
                  {data.checks.totalAmountMatch}
                </span>
              </td>
            </tr>

            <tr>
              <td className="p-3 font-bold text-slate-900">Goods Condition</td>
              <td className="p-3 text-slate-400">Expected Good</td>
              <td className="p-3 font-bold">{data.grnCondition}</td>
              <td className="p-3 text-slate-400 font-mono">N/A (Invoice)</td>
              <td className="p-3 text-center">
                <span className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                  data.checks.conditionCheck === CheckStatus.PASS ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                )}>
                  {data.checks.conditionCheck}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 6. FINANCIAL IMPACT & DECISION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-4 shadow-xl">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" /> Financial Impact Analysis
          </h4>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-xs font-medium text-slate-300">Invoice Amount</span>
              <span className="text-sm font-black text-white">{formatCurrency(data.actualInvoiceAmount)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/10">
              <span className="text-xs font-medium text-slate-300">Expected PO Amount</span>
              <span className="text-sm font-black text-white">{formatCurrency(data.expectedInvoiceAmount || 0)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <span className="text-xs font-bold text-emerald-300">Potential Financial Impact</span>
              <span className="text-base font-black text-emerald-400">
                {data.potentialFinancialImpact !== null ? formatCurrency(data.potentialFinancialImpact) : "N/A"}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Recommendation for Madam Lim</span>
            <p className="text-xs text-slate-200 bg-white/5 p-3 rounded-xl border border-white/10 font-medium leading-relaxed">
              {ruleBased.recommendedActionText}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" /> Madam Lim's Review Decision
            </h4>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Reviewer Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter review notes or justification..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none min-h-[90px]"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap gap-2">
              {isClean ? (
                <button
                  onClick={() => onSave('APPROVE', notes || "Confirmed clean match")}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-md"
                >
                  Confirm Approval Recommendation
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onSave('RECORD_DECISION', notes || "Manual Decision Recorded")}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-md"
                  >
                    Record Manual Decision
                  </button>
                  <button
                    onClick={() => onSave('HOLD', notes || "Kept on Hold")}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase text-xs tracking-wider transition-all"
                  >
                    Keep on Hold
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  onAssign("PROCUREMENT");
                  onQuery({
                    message_id: `MSG-${Date.now()}`,
                    generated_at: new Date().toISOString(),
                    generated_by: "Madam Lim",
                    recipient: "Procurement Team (procurement@boonhuat.com.sg)",
                    recipient_department: "PROCUREMENT",
                    channel: "TEAMS",
                    approval_status: "DRAFT",
                    subject: `Discrepancy Query: Invoice ${data.invoiceNumber} / PO ${data.poNumber || "N/A"}`,
                    message: `Dear Procurement Team,\n\nPlease clarify the variance for Invoice ${data.invoiceNumber} (${data.supplierName}).\nDetails: ${data.shortReason}\n\nThank you,\nMadam Lim`,
                    related_records: {
                      po_number: data.poNumber || undefined,
                      invoice_number: data.invoiceNumber
                    },
                    reason: "Discrepancy Query"
                  });
                }}
                className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-indigo-200 text-center"
              >
                Query Procurement
              </button>
              <button
                onClick={() => {
                  onAssign("WAREHOUSE");
                  onQuery({
                    message_id: `MSG-${Date.now()}`,
                    generated_at: new Date().toISOString(),
                    generated_by: "Madam Lim",
                    recipient: "Warehouse Team (warehouse@boonhuat.com.sg)",
                    recipient_department: "WAREHOUSE",
                    channel: "TEAMS",
                    approval_status: "DRAFT",
                    subject: `GRN Query: Invoice ${data.invoiceNumber} / GRN ${data.grnNumbers.join(", ") || "N/A"}`,
                    message: `Dear Warehouse Team,\n\nPlease verify goods condition and quantities for Invoice ${data.invoiceNumber}.\nDetails: ${data.shortReason}\n\nThank you,\nMadam Lim`,
                    related_records: {
                      po_number: data.poNumber || undefined,
                      invoice_number: data.invoiceNumber
                    },
                    reason: "GRN Quantity/Condition Query"
                  });
                }}
                className="py-2.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-amber-200 text-center"
              >
                Query Warehouse
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchDocCard({ title, id, file, color }: { title: string, id: string, file: string | null, color: string }) {
  const colors: any = {
    indigo: "border-indigo-200 bg-indigo-50/30",
    amber: "border-amber-200 bg-amber-50/30",
    emerald: "border-emerald-200 bg-emerald-50/30",
  };
  const iconColors: any = {
    indigo: "text-indigo-600 bg-indigo-100",
    amber: "text-amber-600 bg-amber-100",
    emerald: "text-emerald-600 bg-emerald-100",
  };
  return (
    <div className={cn("p-4 rounded-xl border-2 shadow-sm", colors[color])}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", iconColors[color])}>
        <FileText className="w-4 h-4" />
      </div>
      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{title}</p>
      <p className="font-black text-slate-900 truncate">{id}</p>
      <p className="text-[10px] text-slate-500 truncate mt-1 italic">{file || "No file linked"}</p>
    </div>
  );
}

function EditableField({ label, value, original, onChange, type = "text", isArea = false }: { label: string, value: string, original: string, onChange: (v: string) => void, type?: string, isArea?: boolean }) {
  const isChanged = value !== original;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
        {isChanged && <span className="text-[8px] font-black uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Corrected</span>}
      </div>
      {isArea ? (
        <textarea 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium min-h-[80px]",
            isChanged ? "bg-blue-50/30 border-blue-200" : "bg-slate-50 border-slate-200"
          )}
        />
      ) : (
        <input 
          type={type} 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold",
            isChanged ? "bg-blue-50/30 border-blue-200 text-blue-900" : "bg-slate-50 border-slate-200 text-slate-800"
          )}
        />
      )}
      {isChanged && (
        <div className="text-[9px] text-slate-400 italic px-1">Original: {original || "None"}</div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", isArea = false }: { label: string, value: string, onChange: (v: string) => void, type?: string, isArea?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      {isArea ? (
        <textarea 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium min-h-[80px]"
        />
      ) : (
        <input 
          type={type} 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-slate-800"
        />
      )}
    </div>
  );
}

function ProfileScreen({ user, onLogout }: { user: UserSession, onLogout: () => void }) {
  if (!user) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-2xl mx-auto">
      <div>
        <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none mb-2">User Profile</h2>
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Personal Account & Security</p>
      </div>

      <div className="bg-white rounded-3xl p-10 border border-slate-100 shadow-xl shadow-slate-200/20">
        <div className="flex flex-col md:flex-row items-center gap-10 mb-12">
          <div className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-2xl shadow-blue-500/20">
            {(user.user_name || "User").split(' ').map(n => n[0]).join('').toUpperCase()}
          </div>
          <div className="text-center md:text-left space-y-2">
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{user.user_name}</h3>
            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                {user.user_role.replace(/_/g, ' ')}
              </span>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                ID: {user.staff_id}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-slate-50">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Account Details</h4>
            <div className="space-y-4">
              <ProfileItem label="Staff Name" value={user.user_name} icon={User} />
              <ProfileItem label="Staff ID" value={user.staff_id} icon={Lock} />
              <ProfileItem label="Assigned Role" value={user.user_role.replace(/_/g, ' ')} icon={ShieldAlert} />
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Session Activity</h4>
            <div className="space-y-4">
              <ProfileItem label="Signed In At" value={new Date(user.signed_in_at).toLocaleString()} icon={RotateCw} />
              <ProfileItem label="Last Activity" value={new Date(user.last_activity_at).toLocaleString()} icon={History} />
              <ProfileItem label="Auth Status" value="AUTHENTICATED" icon={CheckCircle2} />
            </div>
          </div>
        </div>

        <div className="mt-12 pt-10 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <p className="text-[11px] font-black text-slate-900 uppercase mb-1">Local Session Security</p>
            <p className="text-xs text-slate-400 font-medium">Your session is stored locally and will expire when you sign out or close the browser.</p>
          </div>
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 px-8 py-4 bg-rose-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-rose-700 transition-all shadow-xl shadow-rose-600/20"
          >
            <LogIn className="w-4 h-4 rotate-180" />
            Sign Out Now
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileItem({ label, value, icon: Icon }: { label: string, value: string, icon: any }) {
  return (
    <div className="flex items-center gap-4 group">
      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
