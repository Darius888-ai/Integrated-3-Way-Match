import React from "react";
import { MatchResult } from "../types";
import { isHumanApprovedForPayment } from "../services/emailPaymentService";
import { CheckCircle2, Mail, X, ArrowRight } from "lucide-react";

interface ThreeWayMatchCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenEmailModal: () => void;
  matchResults: MatchResult[];
  approvalByResultKey?: Record<string, any>;
  getResultKey?: (r: any) => string;
}

export function ThreeWayMatchCompleteModal({
  isOpen,
  onClose,
  onOpenEmailModal,
  matchResults,
  approvalByResultKey,
  getResultKey
}: ThreeWayMatchCompleteModalProps) {
  if (!isOpen) return null;

  const now = new Date();
  const reportDate = String(now.getDate()).padStart(2, "0") + "/" + 
                     String(now.getMonth() + 1).padStart(2, "0") + "/" + 
                     String(now.getFullYear()).slice(-2);

  const totalEvaluated = matchResults.length;
  const approvedResults = matchResults.filter(r => isHumanApprovedForPayment(r, approvalByResultKey, getResultKey));
  const approvedCount = approvedResults.length;
  const approvedAmount = approvedResults.reduce((sum, r) => sum + (r.actualInvoiceAmount || 0), 0);

  const onHoldList = matchResults.filter(r => String(r.humanReviewStatus || "").toUpperCase() === "ON_HOLD");
  const onHoldCount = onHoldList.length;
  const onHoldAmount = onHoldList.reduce((sum, r) => sum + (r.actualInvoiceAmount || 0), 0);

  const reviewRequiredList = matchResults.filter(r => {
    const st = String(r.deterministicStatus || r.status || "").toUpperCase();
    const hr = String(r.humanReviewStatus || "").toUpperCase();
    return (st.includes("REVIEW") || st.includes("MISMATCH") || st.includes("ISSUE") || st.includes("DUPLICATE") || st.includes("NO_PO") || st.includes("NO_GRN")) && hr !== "ON_HOLD" && hr !== "RESOLVED";
  });
  const reviewRequiredCount = reviewRequiredList.length;

  const fundsAffected = matchResults.reduce((sum, r) => sum + (r.potentialFinancialImpact || r.amountDifference || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-800/80 rounded-xl border border-blue-700/50">
              <CheckCircle2 className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Three-Way Match Complete</h3>
              <p className="text-xs text-blue-200 font-medium">Boon Huat Hardware & Supplies Pte Ltd — Report Date: {reportDate}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-blue-200 hover:text-white rounded-lg hover:bg-blue-800/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
            <p className="text-xs font-bold text-blue-900 leading-relaxed">
              “The three-way-match report is ready to be emailed to Madam Lim. Approved invoices may proceed to Payment Processing. Review Required invoices remain in App 2 for follow-up.”
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-slate-500">Total Evaluated</span>
              <p className="text-lg font-black text-slate-900">{totalEvaluated}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-emerald-700">Approved</span>
              <p className="text-lg font-black text-emerald-900">{approvedCount}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-amber-700">Review Required</span>
              <p className="text-lg font-black text-amber-900">{reviewRequiredCount}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 p-3 rounded-xl">
              <span className="text-[10px] font-black uppercase text-purple-700">On Hold</span>
              <p className="text-lg font-black text-purple-900">{onHoldCount}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-600 font-bold">Approved Payment Amount:</span>
              <span className="font-black text-emerald-700">SGD {approvedAmount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 pb-2">
              <span className="text-slate-600 font-bold">Invoice Value On Hold:</span>
              <span className="font-black text-purple-700">SGD {onHoldAmount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 font-bold">Funds Affected by Exceptions:</span>
              <span className="font-black text-amber-700">SGD {fundsAffected.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 p-4 px-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 transition-all"
          >
            Review Results
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenEmailModal();
            }}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95"
          >
            <Mail className="w-4 h-4" />
            Email App 2 Report <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}
