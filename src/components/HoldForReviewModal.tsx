import React, { useState } from "react";
import { Lock, X, AlertTriangle, ShieldCheck } from "lucide-react";
import { ApprovalStatus } from "../types";

interface HoldForReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmHold: (reason: string, note?: string) => void;
  invoiceNumber: string;
}

const HOLD_REASONS = [
  "Waiting for Warehouse Confirmation",
  "Pending Credit Note from Supplier",
  "Incorrect Unit Price on PO",
  "Invoice Details Missing - Manual Review Required",
  "Quantity Received Discrepancy",
  "Damaged Goods - Returns Pending",
  "Madam Lim needs to review personally",
  "Other (See Review Notes)"
];

export default function HoldForReviewModal({
  isOpen,
  onClose,
  onConfirmHold,
  invoiceNumber
}: HoldForReviewModalProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [holdNote, setHoldNote] = useState("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-70 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">Hold for Review</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Invoice: {invoiceNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="flex gap-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-900 font-medium leading-relaxed">
              Placing this invoice on <strong className="font-black underline">HOLD</strong> will block payment approval and notify the relevant department. This action will be logged in the audit trail.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Select Reason for Hold</label>
            <div className="grid grid-cols-1 gap-2">
              {HOLD_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedReason(reason)}
                  className={`w-full p-3 text-left text-xs font-bold rounded-xl border transition-all flex items-center justify-between ${
                    selectedReason === reason
                      ? "bg-indigo-50 border-indigo-600 text-indigo-900"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {reason}
                  {selectedReason === reason && <ShieldCheck className="w-4 h-4 text-indigo-600" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
              Additional Hold Note <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
              placeholder="Add specific instructions or context for this hold..."
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none focus:border-indigo-600 resize-none"
            />
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-xs text-slate-600 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirmHold(selectedReason, holdNote)}
            disabled={!selectedReason}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-sm transition-all disabled:opacity-50"
          >
            Confirm Hold
          </button>
        </div>
      </div>
    </div>
  );
}
