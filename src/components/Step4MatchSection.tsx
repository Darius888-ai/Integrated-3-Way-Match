import React, { useState, useMemo } from "react";
import { MatchResult, MatchStatus, SupportingEvidence } from "../types";
import { getMatchKeyResultSummary } from "../logic";
import { MatchDetailsDrawer } from "./MatchDetailsDrawer";
import { EmailPaymentModal } from "./EmailPaymentModal";
import { DownloadExcelModal } from "./DownloadExcelModal";
import { ThreeWayMatchCompleteModal } from "./ThreeWayMatchCompleteModal";
import { isHumanApprovedForPayment } from "../services/emailPaymentService";
import { 
  Search, 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Eye, 
  Lock, 
  X, 
  ShieldAlert, 
  ShieldCheck,
  Building2, 
  Filter,
  RefreshCcw,
  Bot,
  FileSpreadsheet,
  Mail
} from "lucide-react";

interface Step4MatchSectionProps {
  matchResults: MatchResult[];
  poRecords: any[];
  grnRecords: any[];
  invoiceRecords: any[];
  isLoading: boolean;
  hasRunMatch: boolean;
  lastRunTimestamp: string | null;
  onRunMatch: () => void;
  onDownloadExcel: () => void;
  onHoldForReview: (result: MatchResult, reason: string, note?: string) => void;
  onRemoveHold: (result: MatchResult) => void;
  onResolveReview: (
    result: MatchResult, 
    decision: "KEEP_ON_HOLD" | "APPROVE_AFTER_REVIEW", 
    justification: string, 
    passcode: string,
    supportingEvidence?: SupportingEvidence
  ) => void;
  approvalByResultKey: Record<string, any>;
  approvalModalKey: string | null;
  setApprovalModalKey: (key: string | null) => void;
  approvalPasscode: string;
  setApprovalPasscode: (code: string) => void;
  approvalError: string;
  setApprovalError: (error: string) => void;
  submitApproval: (event: React.FormEvent) => void;
  closeApprovalModal: () => void;
  aiStatusByKey: Record<string, string>;
  aiTextByKey: Record<string, string>;
  aiErrorByKey: Record<string, string>;
  generateAIExplanation: (event: React.MouseEvent, result: any) => void;
  getResultKey: (result: any) => string;
  onSendToApp3: (results: MatchResult[]) => void;
  referenceDataHydrated: boolean;
  addAuditEntry?: (entry: any) => void;
  isMatchCompleteModalOpen: boolean;
  setIsMatchCompleteModalOpen: (open: boolean) => void;
}

export function Step4MatchSection({
  matchResults,
  poRecords,
  grnRecords,
  invoiceRecords,
  isLoading,
  hasRunMatch,
  lastRunTimestamp,
  onRunMatch,
  onDownloadExcel,
  onHoldForReview,
  onRemoveHold,
  onResolveReview,
  approvalByResultKey,
  approvalModalKey,
  setApprovalModalKey,
  approvalPasscode,
  setApprovalPasscode,
  approvalError,
  setApprovalError,
  submitApproval,
  closeApprovalModal,
  aiStatusByKey,
  aiTextByKey,
  aiErrorByKey,
  generateAIExplanation,
  getResultKey,
  onSendToApp3,
  referenceDataHydrated,
  addAuditEntry,
  isMatchCompleteModalOpen,
  setIsMatchCompleteModalOpen
}: Step4MatchSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [emailedRecordKeys, setEmailedRecordKeys] = useState<Set<string>>(new Set());
  const [paymentEmailHistory, setPaymentEmailHistory] = useState<Array<{
    transferId: string;
    sentAt: string;
    sentBy: string;
    recipient: string;
    approvedCount: number;
    totalApprovedAmount: number;
    invoiceNumbers: string[];
    action: string;
  }>>([]);

  const eligibleForPayment = useMemo(() => {
    return matchResults.filter(r => isHumanApprovedForPayment(r, approvalByResultKey, getResultKey));
  }, [matchResults, approvalByResultKey, getResultKey]);

  const approvedCount = eligibleForPayment.length;
  
  const handleRunMatchClick = () => {
    if (!referenceDataHydrated) {
      alert("REFERENCE DATA NOT READY");
      return;
    }
    if ((poRecords?.length || 0) === 0) {
      alert("PURCHASE ORDER DATABASE NOT AVAILABLE. Load or restore Purchase Orders before running the three-way match.");
      return;
    }
    if ((grnRecords?.length || 0) === 0) {
      alert("GRN DATABASE NOT AVAILABLE. Load or restore GRNs before running the three-way match.");
      return;
    }
    onRunMatch();
  };
  const [groupBy, setGroupBy] = useState<"PO" | "SUPPLIER" | "STATUS" | "NONE">("PO");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeDrawerResult, setActiveDrawerResult] = useState<MatchResult | null>(null);

  // Synchronize drawer result with current state
  const currentDrawerResult = useMemo(() => {
    if (!activeDrawerResult) return null;
    return matchResults.find(r => 
      (r.matchRecordId && r.matchRecordId === activeDrawerResult.matchRecordId) || 
      getResultKey(r) === getResultKey(activeDrawerResult)
    ) || activeDrawerResult;
  }, [matchResults, activeDrawerResult, getResultKey]);

  // Passcode modal state
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [selectedForApproval, setSelectedForApproval] = useState<MatchResult | null>(null);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const formatMoney = (amount?: number | null) => {
    if (amount === undefined || amount === null) return "$0.00";
    return `$${amount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Summary counts
  const stats = useMemo(() => {
    let cleanMatchCount = 0;
    let reviewRequiredCount = 0;
    let onHoldCount = 0;

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

    matchResults.forEach(r => {
      const status = String(r.deterministicStatus || r.status || "").trim().toUpperCase();
      const isReviewRequired = REVIEW_REQUIRED_STATUSES.has(status);

      if (isReviewRequired) {
        reviewRequiredCount++;
        if (r.humanReviewStatus === "ON_HOLD") {
          onHoldCount++;
        }
      } else {
        cleanMatchCount++;
      }
    });

    return {
      total: matchResults.length,
      cleanMatch: cleanMatchCount,
      reviewRequired: reviewRequiredCount,
      onHold: onHoldCount
    };
  }, [matchResults]);

  // Filtered Results
  const filteredResults = useMemo(() => {
    return matchResults.filter(r => {
      // Status Checks
      const isClean = r.deterministicStatus === MatchStatus.CLEAN_MATCH_FULLY_VERIFIED || 
                      r.deterministicStatus === MatchStatus.CLEAN_MATCH_HEADER_VERIFIED;
      const isOnHold = r.humanReviewStatus === "ON_HOLD";
      const isReview = !isClean;

      if (activeFilter === "ON_HOLD" && !isOnHold) return false;
      if (activeFilter === "CLEAN_MATCH" && !isClean) return false;
      if (activeFilter === "REVIEW_REQUIRED" && !isReview) return false;
      
      // Secondary Filters based on issue types
      if (activeFilter === "QUANTITY" && r.deterministicStatus !== MatchStatus.QUANTITY_MISMATCH) return false;
      if (activeFilter === "PRICE" && r.deterministicStatus !== MatchStatus.PRICE_MISMATCH) return false;
      if (activeFilter === "CONDITION" && r.deterministicStatus !== MatchStatus.CONDITION_ISSUE) return false;
      if (activeFilter === "MISSING_DOC" && (r.deterministicStatus !== MatchStatus.NO_GRN_FOUND && r.deterministicStatus !== MatchStatus.NO_PO_FOUND)) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const poNo = (r.poNumber || "").toLowerCase();
        const invNo = (r.invoiceNumber || "").toLowerCase();
        const supplier = (r.supplierName || "").toLowerCase();
        return poNo.includes(term) || invNo.includes(term) || supplier.includes(term);
      }

      return true;
    });
  }, [matchResults, activeFilter, searchTerm]);

  // Grouped Results
  const groupedResults = useMemo(() => {
    if (groupBy === "NONE") {
      return [{ groupKey: "ALL", groupLabel: "All Match Results", results: filteredResults, worstStatus: null, impact: 0, isOnHold: false }];
    }

    const map = new Map<string, { label: string; supplier: string; items: MatchResult[] }>();

    filteredResults.forEach(r => {
      let key = "UNASSIGNED";
      let label = "Unassigned";
      let supplier = r.supplierName || "Unknown";

      if (groupBy === "PO") {
        key = r.poNumber || "NO_PO";
        label = r.poNumber ? `${r.poNumber}` : "No PO Reference";
      } else if (groupBy === "SUPPLIER") {
        key = r.supplierName || "UNKNOWN_SUPPLIER";
        label = r.supplierName || "Unknown Supplier";
      } else if (groupBy === "STATUS") {
        key = r.status;
        label = r.status === MatchStatus.PASS_WITH_LIMITATION ? "PASS — DETAILS MISSING" : r.status;
      }

      if (!map.has(key)) {
        map.set(key, { label, supplier, items: [] });
      }
      map.get(key)!.items.push(r);
    });

    return Array.from(map.entries()).map(([groupKey, data]) => {
      // Find worst status for group header badge
      const hasReviewRequired = data.items.some(i => String(i.status) !== "CLEAN MATCH" && i.status !== MatchStatus.PASS_WITH_LIMITATION);
      const hasPassDetailsMissing = data.items.some(i => i.status === MatchStatus.PASS_WITH_LIMITATION);
      const groupIsOnHold = data.items.some(i => i.humanReviewStatus === "ON_HOLD");
      
      let worstStatus: "REVIEW_REQUIRED" | "PASS_DETAILS_MISSING" | "CLEAN_MATCH" = "CLEAN_MATCH";
      if (hasReviewRequired) worstStatus = "REVIEW_REQUIRED";
      else if (hasPassDetailsMissing) worstStatus = "PASS_DETAILS_MISSING";

      const impact = data.items.reduce((sum, i) => sum + (i.potentialFinancialImpact || 0), 0);

      return {
        groupKey,
        groupLabel: data.label,
        supplierName: data.supplier,
        results: data.items,
        worstStatus,
        impact,
        isOnHold: groupIsOnHold
      };
    }).sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
  }, [filteredResults, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key]
    }));
  };

  const isExpanded = (key: string) => expandedGroups[key] !== false; // Default expanded

  const eligibleForSend = matchResults.filter(r => r.approvalRecommendationStatus === "CONFIRMED" || r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW");
  const totalValue = eligibleForSend.reduce((sum, r) => sum + (r.actualInvoiceAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Run Match Button Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Step 4 – Deterministic Matching Engine</h2>
          <p className="text-xs font-bold text-slate-500">
            {invoiceRecords?.length || 0} invoices ready for evaluation against {poRecords?.length || 0} POs and {grnRecords?.length || 0} GRNs.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5 md:gap-3 w-full md:w-auto">
          {((poRecords?.length || 0) === 0 || (grnRecords?.length || 0) === 0 || (invoiceRecords?.length || 0) === 0) && (
            <span className="text-[10px] font-bold text-slate-400 italic">
              {(poRecords?.length || 0) === 0 ? "POs required. " : ""}
              {(grnRecords?.length || 0) === 0 ? "GRNs required. " : ""}
              {(invoiceRecords?.length || 0) === 0 ? "Invoices required." : ""}
            </span>
          )}
          <button
            onClick={handleRunMatchClick}
            disabled={isLoading || (invoiceRecords?.length || 0) === 0}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-md ${
              isLoading || (invoiceRecords?.length || 0) === 0
                ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20"
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCcw className="w-4 h-4 animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" />
                Run Three-Way Match
              </>
            )}
          </button>

          {/* EMAIL APPROVED BUTTON */}
          <button
            onClick={() => setIsEmailModalOpen(true)}
            disabled={approvedCount === 0}
            title={approvedCount === 0 ? "No approved invoices available yet." : `Email ${approvedCount} approved invoice(s) to Payment Processing`}
            className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-xs ${
              approvedCount === 0
                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20 active:scale-95"
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>EMAIL APPROVED</span>
            {approvedCount > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-900/60 rounded text-[10px] font-mono">
                [{approvedCount}]
              </span>
            )}
          </button>
          
          {/* DOWNLOAD EXCEL BUTTON */}
          <button
            onClick={() => setIsDownloadModalOpen(true)}
            disabled={approvedCount === 0}
            title={approvedCount === 0 ? "No approved invoices available for export." : `Download ${approvedCount} approved invoice(s) as Excel register`}
            className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl font-black uppercase text-xs tracking-wider transition-all shadow-xs ${
              approvedCount === 0
                ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 active:scale-95"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>DOWNLOAD EXCEL</span>
            {approvedCount > 0 && (
              <span className="px-1.5 py-0.5 bg-emerald-900/60 rounded text-[10px] font-mono">
                [{approvedCount}]
              </span>
            )}
          </button>
        </div>
      </div>

      {hasRunMatch && lastRunTimestamp && (
        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 tracking-wider">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Results as of {lastRunTimestamp}
        </div>
      )}

      {/* 1. Dynamic Match Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Evaluated</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-slate-900">{stats.total}</span>
            <span className="text-[10px] font-bold text-slate-400">Deterministic</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between border-l-4 border-l-emerald-500">
          <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Clean Match</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-emerald-600">{stats.cleanMatch}</span>
            <span className="text-[10px] font-bold text-emerald-600">Includes Header-Verified</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between border-l-4 border-l-amber-500">
          <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Review Required</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-amber-600">{stats.reviewRequired}</span>
            <span className="text-[10px] font-bold text-amber-600">Exceptions Identified</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
        <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-black uppercase tracking-wider border border-amber-200">
          <Lock className="w-3.5 h-3.5" /> Human Holds
        </div>
        <div className="text-xs font-bold text-amber-800">
          <span className="text-lg font-black mr-1">{stats.onHold}</span> 
          of {stats.reviewRequired} review-required invoices are currently on hold
        </div>
      </div>

      {/* 2. Controls & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "ALL" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({matchResults.length})
          </button>
          <button
            onClick={() => setActiveFilter("ON_HOLD")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2 ${
              activeFilter === "ON_HOLD" ? "bg-amber-100 border-amber-600 text-amber-900 shadow-xs" : "bg-white border-amber-100 text-amber-600 hover:bg-amber-50"
            }`}
          >
            On Hold ({stats.onHold})
          </button>
          <button
            onClick={() => setActiveFilter("CLEAN_MATCH")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "CLEAN_MATCH" ? "bg-emerald-600 text-white shadow-xs" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Clean Match ({stats.cleanMatch})
          </button>
          <button
            onClick={() => setActiveFilter("REVIEW_REQUIRED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "REVIEW_REQUIRED" ? "bg-amber-500 text-white shadow-xs" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            Review ({stats.reviewRequired})
          </button>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <button
            onClick={() => setActiveFilter("QUANTITY")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "QUANTITY" ? "bg-slate-200 text-slate-900" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            Quantity Issue
          </button>
          <button
            onClick={() => setActiveFilter("CONDITION")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "CONDITION" ? "bg-slate-200 text-slate-900" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            Condition Issue
          </button>
          <button
            onClick={() => setActiveFilter("MISSING_DOC")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "MISSING_DOC" ? "bg-slate-200 text-slate-900" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            Missing Document
          </button>
        </div>

        {/* Group & Search */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Group:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none"
            >
              <option value="PO">PO Number</option>
              <option value="SUPPLIER">Supplier</option>
              <option value="STATUS">Match Status</option>
              <option value="NONE">Flat List</option>
            </select>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search PO, invoice or supplier..."
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Grouped Match Table Display */}
      <div className="space-y-6">
        {groupedResults.map(group => {
          const expanded = isExpanded(group.groupKey);

          return (
            <div key={group.groupKey} className={`bg-white rounded-2xl border shadow-xs overflow-hidden ${group.isOnHold ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200'}`}>
              {/* Group Header Bar */}
              <div 
                onClick={() => toggleGroup(group.groupKey)}
                className={`p-4 border-b flex items-center justify-between cursor-pointer transition-colors select-none ${group.isOnHold ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
              >
                <div className="flex items-center gap-3">
                  <button className="text-slate-500 p-1 hover:bg-slate-200 rounded-lg">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-black text-slate-900 text-sm tracking-tight">{group.groupLabel}</span>
                    <span className="text-xs font-bold text-slate-500">• {group.supplierName}</span>
                    <span className="px-2.5 py-0.5 bg-slate-200 text-slate-800 text-[10px] font-black uppercase rounded-md">
                      {group.results.length} {group.results.length === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {group.isOnHold && (
                    <span className="px-2.5 py-1 bg-amber-500 text-slate-900 text-[10px] font-black uppercase rounded-md flex items-center gap-1">
                      <Lock className="w-3 h-3" /> ON HOLD
                    </span>
                  )}
                  {!group.isOnHold && group.worstStatus === "REVIEW_REQUIRED" && (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-md border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" /> REVIEW REQUIRED
                    </span>
                  )}
                  {!group.isOnHold && group.worstStatus === "CLEAN_MATCH" && (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-md border border-emerald-200">
                      CLEAN MATCH
                    </span>
                  )}

                  {group.impact > 0 && (
                    <span className="font-mono font-black text-rose-600 text-xs">
                      Impact: {formatMoney(group.impact)}
                    </span>
                  )}
                </div>
              </div>

              {/* Group Table Body */}
              {expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50/80 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5 w-[190px]">Status</th>
                        <th className="px-6 py-3.5 w-[150px]">Invoice</th>
                        <th className="px-6 py-3.5 w-[150px]">PO Number</th>
                        <th className="px-6 py-3.5 min-w-[320px]">Key Result Summary</th>
                        <th className="px-6 py-3.5 text-right w-[150px]">Financial Impact</th>
                        <th className="px-6 py-3.5 w-[150px]">Department</th>
                        <th className="px-6 py-3.5 text-center w-[160px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {group.results.map((r) => {
                        const isCleanMatch = r.deterministicStatus === MatchStatus.CLEAN_MATCH_FULLY_VERIFIED || 
                                           r.deterministicStatus === MatchStatus.CLEAN_MATCH_HEADER_VERIFIED;
                        const isHeaderOnly = r.deterministicStatus === MatchStatus.CLEAN_MATCH_HEADER_VERIFIED;
                        const isRecordOnHold = r.humanReviewStatus === "ON_HOLD" || (r.humanReviewStatus as string) === "ON_HOLD";
                        const isResolvedRecord = r.humanReviewStatus === "RESOLVED" || (r.humanReviewStatus as string) === "RESOLVED" || r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW";

                        const recKey = getResultKey(r);
                        const isEmailed = emailedRecordKeys.has(recKey) || (r.matchRecordId && emailedRecordKeys.has(r.matchRecordId)) || (r.invoiceNumber && emailedRecordKeys.has(r.invoiceNumber));

                        return (
                          <tr key={r.matchRecordId} className={`${isRecordOnHold ? 'bg-amber-50/40' : isResolvedRecord ? 'bg-emerald-50/20' : 'hover:bg-slate-50'} transition-colors`}>
                            {/* Status */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                {isRecordOnHold ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-200">
                                      <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" /> {r.deterministicStatus || "REVIEW REQUIRED"}
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-500 text-slate-900 shadow-2xs">
                                      <Lock className="w-3 h-3" /> ON HOLD
                                    </span>
                                  </>
                                ) : isResolvedRecord ? (
                                  <>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                                      Original: {r.deterministicStatus}
                                    </span>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> REVIEWED & APPROVED
                                    </span>
                                  </>
                                ) : isHeaderOnly ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-200">
                                    <CheckCircle2 className="w-3 h-3 text-blue-600" /> CLEAN MATCH (HEADER)
                                  </span>
                                ) : isCleanMatch ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> CLEAN MATCH
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-200">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> REVIEW REQUIRED
                                  </span>
                                )}

                                {isEmailed && (
                                  <div className="mt-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs">
                                      <Mail className="w-3 h-3 text-purple-600" /> SENT TO PAYMENT PROCESSING
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Invoice Number */}
                            <td className="px-6 py-4 font-black text-slate-900">{r.invoiceNumber}</td>

                            {/* PO Number */}
                            <td className="px-6 py-4 font-bold text-indigo-600">{r.poNumber || 'N/A'}</td>

                            {/* Key Result Summary */}
                            <td className="px-6 py-4">
                              <div className="space-y-1">
                                {isRecordOnHold ? (
                                  <p className="font-bold leading-snug text-amber-900">
                                    ON HOLD: {r.holdReason}
                                  </p>
                                ) : isResolvedRecord ? (
                                  <div>
                                    <p className="font-bold leading-snug text-emerald-950">
                                      ✓ Reviewed & Approved by {r.approvalConfirmedBy || "Madam Lim"}
                                    </p>
                                    {r.supportingEvidence && r.supportingEvidence.length > 0 && (
                                      <p className="text-[10px] text-emerald-700 font-medium">
                                        Supporting GRN: {r.supportingEvidence[0].grnNumber || "GRN-2026-021"} • +{r.supportingEvidence[0].additionalQuantityReceived || 30} units
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <p className="font-bold leading-snug text-slate-900">
                                    {getMatchKeyResultSummary(r)}
                                  </p>
                                )}
                                <span className="text-[10px] text-purple-700 font-medium flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-purple-500" /> AI guidance available
                                </span>
                              </div>
                            </td>

                            {/* Financial Impact */}
                            <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                              {formatMoney(r.potentialFinancialImpact)}
                            </td>

                            {/* Department */}
                            <td className="px-6 py-4">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold uppercase">
                                {r.assignedDepartment || 'ACCOUNTS'}
                              </span>
                            </td>

                            {/* Action Buttons */}
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                {isRecordOnHold ? (
                                  <button
                                    onClick={() => setActiveDrawerResult(r)}
                                    className="w-full px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all shadow-xs"
                                  >
                                    <Lock className="w-3 h-3" /> Resolve Review
                                  </button>
                                ) : isResolvedRecord ? (
                                  <button
                                    onClick={() => setActiveDrawerResult(r)}
                                    className="w-full px-2.5 py-1.5 bg-emerald-50 border border-emerald-500 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
                                  >
                                    <Eye className="w-3 h-3" /> View Review Details
                                  </button>
                                ) : r.approvalRecommendationStatus === "CONFIRMED" ? (
                                  <button
                                    onClick={() => setActiveDrawerResult(r)}
                                    className="w-full px-2.5 py-1.5 bg-emerald-50 border border-emerald-500 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
                                  >
                                    <ShieldCheck className="w-3 h-3" /> Confirmed
                                  </button>
                                ) : r.approvalRecommendationStatus === "REVALIDATION_REQUIRED" ? (
                                  <button
                                    onClick={() => setActiveDrawerResult(r)}
                                    className="w-full px-2.5 py-1.5 bg-rose-50 border border-rose-500 text-rose-700 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
                                  >
                                    <AlertTriangle className="w-3 h-3" /> Revalidate
                                  </button>
                                ) : approvalByResultKey[getResultKey(r)] ? (
                                  <span className="w-full px-2.5 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> APPROVAL CONFIRMED
                                  </span>
                                ) : isCleanMatch ? (
                                  <button
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setApprovalPasscode("");
                                      setApprovalError("");
                                      setApprovalModalKey(getResultKey(r));
                                    }}
                                    className="w-full px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs"
                                  >
                                    Confirm Approval
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setActiveDrawerResult(r)}
                                    className="w-full px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
                                  >
                                    <Eye className="w-3 h-3" /> View Action
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Three Way Match Complete Modal */}
      <ThreeWayMatchCompleteModal
        isOpen={isMatchCompleteModalOpen}
        onClose={() => setIsMatchCompleteModalOpen(false)}
        onOpenEmailModal={() => setIsEmailModalOpen(true)}
        matchResults={matchResults}
        approvalByResultKey={approvalByResultKey}
        getResultKey={getResultKey}
      />

      {/* Email Payment Modal */}
      <EmailPaymentModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        approvedResults={eligibleForPayment}
        matchResults={matchResults}
        approvalByResultKey={approvalByResultKey}
        getResultKey={getResultKey}
        addAuditEntry={addAuditEntry}
        paymentEmailHistory={paymentEmailHistory}
        onRecordEmailHistory={(entry) => setPaymentEmailHistory(prev => [entry, ...prev])}
        invoiceRecords={invoiceRecords}
        onSuccessEmailed={(emailedIds) => {
          setEmailedRecordKeys(prev => {
            const next = new Set(prev);
            emailedIds.forEach(id => next.add(id));
            return next;
          });
        }}
      />

      {/* Download Excel Modal */}
      <DownloadExcelModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        approvedResults={eligibleForPayment}
        matchResults={matchResults}
        addAuditEntry={addAuditEntry}
        invoiceRecords={invoiceRecords}
      />

      {/* Details Drawer */}
      {currentDrawerResult && (
        <MatchDetailsDrawer
          result={currentDrawerResult}
          onClose={(e?: any) => {
            if(e?.stopPropagation) e.stopPropagation();
            if(e?.preventDefault) e.preventDefault();
            setActiveDrawerResult(null);
          }}
          onConfirmApproval={(r) => {
            setApprovalPasscode("");
            setApprovalError("");
            setApprovalModalKey(getResultKey(r));
            setActiveDrawerResult(null);
          }}
          onGenerateAIExplanation={generateAIExplanation}
          onHoldForReview={onHoldForReview}
          onRemoveHold={onRemoveHold}
          onResolveReview={onResolveReview}
          aiStatus={aiStatusByKey[getResultKey(currentDrawerResult)] || "IDLE"}
          aiText={aiTextByKey[getResultKey(currentDrawerResult)] || ""}
          aiError={aiErrorByKey[getResultKey(currentDrawerResult)] || ""}
          getResultKey={getResultKey}
        />
      )}
    </div>
  );
}
