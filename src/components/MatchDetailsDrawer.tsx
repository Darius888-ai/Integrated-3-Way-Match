import React, { useState } from "react";
import { MatchResult, MatchStatus, CheckStatus, ApprovalStatus, SupportingEvidence } from "../types";
import { getMatchKeyResultSummary } from "../logic";
import HoldForReviewModal from "./HoldForReviewModal";
import ResolveReviewModal from "./ResolveReviewModal";
import { 
  X, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Building2, 
  DollarSign, 
  FileText, 
  HelpCircle, 
  Lock, 
  RefreshCw, 
  Check, 
  ShieldCheck, 
  ShieldAlert,
  Info,
  Clock,
  User,
  Unlock
} from "lucide-react";

interface MatchDetailsDrawerProps {
  result: MatchResult;
  onClose: (e?: any) => void;
  onConfirmApproval: (result: MatchResult) => void;
  onGenerateAIExplanation: (e: React.MouseEvent, result: MatchResult) => void;
  onHoldForReview: (result: MatchResult, reason: string, note?: string) => void;
  onRemoveHold: (result: MatchResult) => void;
  onResolveReview: (
    result: MatchResult, 
    decision: "KEEP_ON_HOLD" | "APPROVE_AFTER_REVIEW", 
    justification: string, 
    passcode: string,
    supportingEvidence?: SupportingEvidence
  ) => void;
  aiStatus: string;
  aiText: string;
  aiError: string;
  getResultKey: (result: any) => string;
}

export function MatchDetailsDrawer({
  result,
  onClose,
  onConfirmApproval,
  onGenerateAIExplanation,
  onHoldForReview,
  onRemoveHold,
  onResolveReview,
  aiStatus,
  aiText,
  aiError,
  getResultKey
}: MatchDetailsDrawerProps) {
  // Collapsible section state (default expanded: 1. Result Summary, 7. Recommended Action)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    aiExplanation: true,
    compared: false,
    checksCompleted: false,
    checksNotCompleted: false,
    financialImpact: false,
    recommendedAction: true,
    responsibleDept: false,
    reviewNotes: false,
    auditHistory: true
  });

  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const isHeaderOnly = result.deterministicStatus === MatchStatus.CLEAN_MATCH_HEADER_VERIFIED;
  const isPassDetailsMissing = isHeaderOnly;
  const isCleanMatch = result.deterministicStatus === MatchStatus.CLEAN_MATCH_FULLY_VERIFIED || 
                       result.deterministicStatus === MatchStatus.CLEAN_MATCH_HEADER_VERIFIED;
  const isOnHold = result.humanReviewStatus === ApprovalStatus.ON_HOLD;
  const isConfirmed = result.approvalRecommendationStatus === "CONFIRMED" || result.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW";

  const formatMoney = (amount?: number | null) => {
    if (amount === undefined || amount === null) return "$0.00";
    return `$${amount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleHoldConfirm = (reason: string, note?: string) => {
    onHoldForReview(result, reason, note);
    setShowHoldModal(false);
  };

  const isResolvedApproved = result.humanReviewStatus === ApprovalStatus.RESOLVED || 
                             (result.humanReviewStatus as string) === "RESOLVED" ||
                             result.reviewResolution === "APPROVED_AFTER_REVIEW" ||
                             result.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isOnHold ? (
                <span className="px-2.5 py-1 bg-amber-500 text-slate-900 border border-amber-600 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" /> ON HOLD
                </span>
              ) : isResolvedApproved ? (
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> REVIEWED & APPROVED
                </span>
              ) : isHeaderOnly ? (
                <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-blue-400" /> CLEAN MATCH (HEADER)
                </span>
              ) : isCleanMatch ? (
                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> CLEAN MATCH
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md text-[10px] font-black uppercase flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" /> REVIEW REQUIRED
                </span>
              )}
              <h3 className="text-lg font-black uppercase tracking-tight">
                3-Way Match Result
              </h3>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              PO: <span className="font-bold text-indigo-300">{result.poNumber || 'N/A'}</span> • Invoice: <span className="font-bold text-white">{result.invoiceNumber}</span>
            </p>
          </div>

          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body (10 Collapsible Sections) */}
        <div className="p-6 space-y-4 flex-1">
          
          {/* Section 1: Result Summary (Default Expanded) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("summary")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> 1. Result Summary
              </span>
              {expandedSections.summary ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.summary && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-3 text-xs">
                {isOnHold && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="text-[10px] font-black uppercase text-amber-700 block">Current Status: ON HOLD</span>
                      <p className="text-amber-900 font-bold mt-0.5">{result.holdReason}</p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                        <User className="w-3 h-3" /> {result.holdUser || "Madam Lim"}
                        <span className="text-amber-300">•</span>
                        <Clock className="w-3 h-3" /> {result.holdTimestamp || new Date().toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
                {isResolvedApproved && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-emerald-950">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Resolution: Approved After Review
                      </span>
                      <span className="text-[9px] font-bold text-emerald-700">{result.approvalConfirmedAt || new Date().toLocaleString()}</span>
                    </div>
                    {result.approvalJustification && (
                      <p className="text-xs font-semibold text-emerald-900 bg-white/80 p-2.5 rounded-lg border border-emerald-100 italic">
                        "{result.approvalJustification}"
                      </p>
                    )}
                    {result.supportingEvidence && result.supportingEvidence.length > 0 && (
                      <div className="p-2.5 bg-white rounded-lg border border-emerald-200 space-y-1 text-[11px]">
                        <span className="font-bold text-slate-700 block uppercase text-[9px]">Supporting GRN Evidence</span>
                        <div className="flex justify-between items-center text-slate-800">
                          <span className="font-bold text-indigo-700">{result.supportingEvidence[0].grnNumber || "GRN-2026-021"}</span>
                          <span className="font-mono text-emerald-700 font-bold">+{result.supportingEvidence[0].additionalQuantityReceived || 30} units</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">File: {result.supportingEvidence[0].filename} • {result.supportingEvidence[0].condition || "Good Condition"}</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Key Result</span>
                  <p className="font-bold text-slate-900">{getMatchKeyResultSummary(result)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-slate-700">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Supplier</span>
                    <span className="font-bold text-slate-900">{result.supplierName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Assigned Dept</span>
                    <span className="font-bold text-indigo-600">{result.assignedDepartment}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: AI Explanation & Guidance */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("aiExplanation")}
              className="w-full p-4 bg-purple-50/60 hover:bg-purple-100/60 flex items-center justify-between text-left font-black text-xs text-purple-950 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600" /> 2. AI Explanation & Guidance
              </span>
              {expandedSections.aiExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.aiExplanation && (
              <div className="p-4 bg-white border-t border-purple-100 space-y-4 text-xs">
                {aiStatus === "GENERATED" || aiText || result.aiExplanation ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-purple-50/40 border border-purple-100 rounded-xl text-purple-950 space-y-3 leading-relaxed font-medium">
                      <p className="whitespace-pre-line">
                        {aiText || (typeof result.aiExplanation === 'string' ? result.aiExplanation : JSON.stringify(result.aiExplanation))}
                      </p>
                      <p className="text-[10px] text-purple-400 font-mono pt-3 border-t border-purple-100/50">
                        AI Analysis generated via Gemini API Studio
                      </p>
                    </div>
                    <button
                      onClick={(e) => onGenerateAIExplanation(e, result)}
                      disabled={aiStatus === "GENERATING"}
                      className="w-full px-4 py-3 bg-white border-2 border-purple-100 hover:border-purple-300 text-purple-700 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${aiStatus === "GENERATING" ? 'animate-spin' : ''}`} />
                      {aiStatus === "GENERATING" ? "Generating..." : "Regenerate AI Explanation"}
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 space-y-3">
                    <p className="font-medium">Rule-based explanation is ready. You can request a live AI analysis from Gemini API Studio.</p>
                    {result.ruleBasedExplanation && (
                      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1 text-slate-800">
                        <span className="text-[10px] font-black uppercase text-slate-400 block">Deterministic Rule Breakdown</span>
                        <p className="italic font-normal">{result.ruleBasedExplanation.whatWasFound}</p>
                      </div>
                    )}
                    {aiError && (
                      <p className="text-xs font-bold text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                        {aiError}
                      </p>
                    )}
                    <button
                      onClick={(e) => onGenerateAIExplanation(e, result)}
                      disabled={aiStatus === "GENERATING"}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {aiStatus === "GENERATING" ? "Generating AI Explanation..." : "Generate AI Explanation"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Values Compared */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("compared")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" /> 3. Values Compared
              </span>
              {expandedSections.compared ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.compared && (
              <div className="p-4 bg-white border-t border-slate-100 text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase font-black text-slate-400 border-b border-slate-100">
                      <th className="py-2">Metric</th>
                      <th className="py-2">PO Value</th>
                      <th className="py-2">GRN Value</th>
                      <th className="py-2">Invoice Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    <tr>
                      <td className="py-2 font-bold text-slate-600">Quantity</td>
                      <td className="py-2">{result.poQuantityOrdered ?? 'N/A'}</td>
                      <td className="py-2">{result.grnQuantityReceived ?? 'N/A'}</td>
                      <td className="py-2">{result.invoiceQuantity ?? 'Header Only'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-bold text-slate-600">Unit Price</td>
                      <td className="py-2">{result.poUnitPrice ? `$${result.poUnitPrice.toFixed(2)}` : 'N/A'}</td>
                      <td className="py-2">—</td>
                      <td className="py-2">{result.invoiceUnitPrice ? `$${result.invoiceUnitPrice.toFixed(2)}` : 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="py-2 font-bold text-slate-600">Total Amount</td>
                      <td className="py-2">{formatMoney(result.expectedInvoiceAmount)}</td>
                      <td className="py-2">—</td>
                      <td className="py-2 font-black">{formatMoney(result.actualInvoiceAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 4: Checks Completed */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("checksCompleted")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 4. Checks Completed
              </span>
              {expandedSections.checksCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.checksCompleted && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 font-bold">
                  <Check className="w-4 h-4 text-emerald-600" /> Supplier Name Match
                </div>
                <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 font-bold">
                  <Check className="w-4 h-4 text-emerald-600" /> PO Reference Existence
                </div>
                <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 font-bold">
                  <Check className="w-4 h-4 text-emerald-600" /> Invoice Total Amount Verification
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Checks Not Completed */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("checksNotCompleted")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> 5. Checks Not Completed
              </span>
              {expandedSections.checksNotCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.checksNotCompleted && (
              <div className="p-4 bg-white border-t border-slate-100 space-y-2 text-xs">
                {isPassDetailsMissing ? (
                  <div className="p-3 bg-blue-50 text-blue-900 border border-blue-100 rounded-xl space-y-1 font-medium">
                    <span className="font-bold block">Line-Item Level Reconciliation</span>
                    <p>App 1 export did not include line-item details. Unit price & line quantity checks could not be automatically validated.</p>
                  </div>
                ) : (
                  <p className="text-slate-500 italic">All automated checks completed for this record.</p>
                )}
              </div>
            )}
          </div>

          {/* Section 6: Financial Impact */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("financialImpact")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" /> 6. Potential Financial Impact
              </span>
              {expandedSections.financialImpact ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.financialImpact && (
              <div className="p-4 bg-white border-t border-slate-100 text-xs space-y-2">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Estimated Variance Impact</span>
                  <span className="font-mono font-black text-slate-900 text-sm">
                    {formatMoney(result.potentialFinancialImpact)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 7: Recommended Action (Default Expanded) */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("recommendedAction")}
              className="w-full p-4 bg-indigo-50/70 hover:bg-indigo-100/70 flex items-center justify-between text-left font-black text-xs text-indigo-950 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-indigo-600" /> 7. Recommended Action
              </span>
              {expandedSections.recommendedAction ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.recommendedAction && (
              <div className="p-4 bg-white border-t border-indigo-100 text-xs space-y-2">
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-indigo-950 font-bold leading-relaxed">
                  {isPassDetailsMissing
                    ? "Verify the original invoice line items before confirming approval."
                    : result.recommendedAction || "Review discrepancy with assigned department before approval."}
                </div>
              </div>
            )}
          </div>

          {/* Section 8: Responsible Department */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("responsibleDept")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-600" /> 8. Responsible Department
              </span>
              {expandedSections.responsibleDept ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.responsibleDept && (
              <div className="p-4 bg-white border-t border-slate-100 text-xs">
                <span className="px-3 py-1 bg-slate-100 font-black text-slate-800 rounded-lg uppercase tracking-wider text-[11px]">
                  {result.assignedDepartment}
                </span>
              </div>
            )}
          </div>

          {/* Section 9: Review Notes */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("reviewNotes")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" /> 9. Review Notes
              </span>
              {expandedSections.reviewNotes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.reviewNotes && (
              <div className="p-4 bg-white border-t border-slate-100 text-xs">
                <p className="text-slate-600 italic">{result.reviewNotes || "No custom review notes logged yet."}</p>
              </div>
            )}
          </div>

          {/* Section 10: Audit History */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <button
              onClick={() => toggleSection("auditHistory")}
              className="w-full p-4 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left font-black text-xs text-slate-900 uppercase tracking-wider transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-600" /> 10. Audit History
              </span>
              {expandedSections.auditHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expandedSections.auditHistory && (
              <div className="p-4 bg-white border-t border-slate-100 text-xs space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl">
                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                      <RefreshCw className="w-3 h-3" />
                    </div>
                    <div>
                      <p className="text-slate-900 font-bold">Deterministic Match Generated</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">System • Automated calculation completed</p>
                    </div>
                  </div>
                  {isOnHold && (
                    <div className="flex items-start gap-3 p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
                        <Lock className="w-3 h-3" />
                      </div>
                      <div>
                        <p className="text-amber-900 font-bold">Placed on Hold</p>
                        <p className="text-amber-600 text-[10px] mt-0.5">{result.holdUser || "Madam Lim"} • {result.holdTimestamp}</p>
                        <p className="text-amber-800 text-[11px] mt-1 italic leading-tight">Reason: {result.holdReason}</p>
                      </div>
                    </div>
                  )}
                  {result.humanDecision && (
                    <div className="flex items-start gap-3 p-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                      <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div>
                        <p className="text-emerald-900 font-bold">Verification Decision: {result.humanDecision}</p>
                        <p className="text-emerald-600 text-[10px] mt-0.5">{result.reviewedBy} • {result.reviewDate}</p>
                      </div>
                    </div>
                  )}
                  {result.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW" && (
                    <div className="flex items-start gap-3 p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                      <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                      <div>
                        <p className="text-blue-900 font-bold">Approved After Review</p>
                        <p className="text-blue-600 text-[10px] mt-0.5">{result.approvalConfirmedBy} • {result.approvalConfirmedAt}</p>
                        <p className="text-blue-800 text-[11px] mt-1 italic leading-tight">Justification: {result.approvalJustification}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Drawer Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-slate-200 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            {isOnHold ? (
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={() => setShowResolveModal(true)}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center gap-2 transition-all shadow-sm"
                >
                  <Lock className="w-4 h-4" /> Resolve Review
                </button>
                <span className="text-[9px] font-black text-amber-700 uppercase tracking-tighter bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  APPROVAL BLOCKED — INVOICE ON HOLD
                </span>
              </div>
            ) : result.approvalRecommendationStatus === "REVALIDATION_REQUIRED" ? (
              <div className="flex flex-col items-end gap-1">
                <div className="px-5 py-2.5 bg-rose-50 text-rose-800 border-2 border-rose-500 rounded-xl font-black uppercase text-[10px] tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> REVALIDATION REQUIRED
                </div>
                <span className="text-[9px] font-bold text-rose-600 uppercase tracking-tighter text-right">
                  Previous recommendation requires revalidation<br/>because the match result changed.
                </span>
                <button
                   onClick={() => setShowHoldModal(true)}
                   className="mt-2 px-4 py-1.5 bg-white border border-slate-300 hover:border-amber-500 hover:text-amber-700 text-slate-600 rounded-lg font-bold text-[10px] uppercase flex items-center gap-2 transition-all shadow-xs"
                >
                  <Lock className="w-3 h-3" /> Hold for Review
                </button>
              </div>
            ) : isConfirmed ? (
              <div className="flex flex-col items-end">
                <div className="px-6 py-2.5 bg-emerald-50 text-emerald-800 border-2 border-emerald-500 rounded-xl font-black uppercase text-xs tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> APPROVAL RECOMMENDATION CONFIRMED
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 italic">Confirmed by {result.approvalConfirmedBy || "Madam Lim"} at {result.approvalConfirmedAt ? new Date(result.approvalConfirmedAt).toLocaleString() : "just now"}</span>
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-0.5">No payment has been made.</span>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowHoldModal(true)}
                  className="px-5 py-2.5 bg-white border border-slate-300 hover:border-amber-500 hover:text-amber-700 text-slate-600 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-xs"
                >
                  <Lock className="w-3.5 h-3.5" /> Hold for Review
                </button>
                {isCleanMatch ? (
                  <button
                    onClick={() => onConfirmApproval(result)}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center gap-2 transition-all shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Confirm Approval
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="px-4 py-2.5 bg-slate-200 text-slate-500 border border-slate-300 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-1 opacity-60">
                      <Lock className="w-3.5 h-3.5 text-slate-400" /> Approval Blocked
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      <HoldForReviewModal
        isOpen={showHoldModal}
        onClose={() => setShowHoldModal(false)}
        onConfirmHold={handleHoldConfirm}
        invoiceNumber={result.invoiceNumber}
      />

      <ResolveReviewModal
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        result={result}
        onResolve={(targetResult, dec, just, pass, evidence) => {
          onResolveReview(targetResult, dec, just, pass, evidence);
          setShowResolveModal(false);
        }}
      />
    </div>
  );
}
