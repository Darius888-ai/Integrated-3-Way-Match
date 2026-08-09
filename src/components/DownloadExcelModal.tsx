import React from "react";
import { MatchResult } from "../types";
import { generateApprovedPaymentsExcel } from "../services/emailPaymentService";
import { X, FileSpreadsheet, Download, CheckCircle2, ShieldCheck } from "lucide-react";

interface DownloadExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedResults: MatchResult[];
  matchResults?: MatchResult[];
  addAuditEntry?: (entry: any) => void;
  invoiceRecords?: any[];
}

export function DownloadExcelModal({
  isOpen,
  onClose,
  approvedResults,
  matchResults,
  addAuditEntry,
  invoiceRecords
}: DownloadExcelModalProps) {
  if (!isOpen) return null;

  const totalAmount = approvedResults.reduce((sum, r) => sum + (r.actualInvoiceAmount || 0), 0);
  const formattedTotal = totalAmount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const handleConfirmDownload = () => {
    const transferId = `TRF-EXP-${Date.now()}`;
    const excelData = generateApprovedPaymentsExcel(approvedResults, matchResults || approvedResults, transferId, invoiceRecords || []);
    
    // Trigger browser download
    excelData.triggerDownload();

    // Audit Trail
    if (addAuditEntry) {
      addAuditEntry({
        step_number: 4,
        action_type: "APPROVED_PAYMENT_EXCEL_DOWNLOADED",
        source_filename: excelData.fileName,
        metadata: {
          transferId,
          user: "Madam Lim",
          approvedCount: approvedResults.length,
          invoiceNumbers: approvedResults.map(r => r.invoiceNumber),
          totalAmount,
          timestamp: new Date().toISOString()
        }
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-700/80 rounded-xl border border-emerald-600/50">
              <FileSpreadsheet className="w-6 h-6 text-emerald-100" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Download Approved Payment File</h3>
              <p className="text-xs text-emerald-200 font-medium">Boon Huat Accounts Payable – Verified Excel Register</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-emerald-200 hover:text-white rounded-lg hover:bg-emerald-700/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Summary Banner */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Approved Invoices</span>
              <p className="text-2xl font-black text-emerald-950">{approvedResults.length}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Total Value</span>
              <p className="text-2xl font-black text-slate-900">SGD {formattedTotal}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-500">Prepared By:</span>
              <span className="font-black text-slate-900">Madam Lim — Accounts Executive</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="font-bold text-slate-500">Verification Standard:</span>
              <span className="font-extrabold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Deterministic Three-Way Match + Human Approval
              </span>
            </div>
          </div>

          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-slate-700 leading-relaxed">
              This Excel workbook contains only invoices that have completed the three-way match and human approval process.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 p-4 px-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDownload}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
          >
            <Download className="w-4 h-4" />
            Download Excel
          </button>
        </div>

      </div>
    </div>
  );
}
