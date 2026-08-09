import React, { useState, useEffect } from "react";
import { 
  Lock, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Eye, 
  Trash2,
  Calendar,
  Package,
  FileCheck
} from "lucide-react";
import { MatchResult, SupportingEvidence } from "../types";

interface ResolveReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: MatchResult | null;
  onResolve: (
    result: MatchResult,
    decision: "KEEP_ON_HOLD" | "APPROVE_AFTER_REVIEW",
    justification: string,
    passcode: string,
    supportingEvidence?: SupportingEvidence
  ) => void;
}

export default function ResolveReviewModal({
  isOpen,
  onClose,
  result,
  onResolve
}: ResolveReviewModalProps) {
  const [decision, setDecision] = useState<"KEEP_ON_HOLD" | "APPROVE_AFTER_REVIEW">("APPROVE_AFTER_REVIEW");
  const [justification, setJustification] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  // Supporting Evidence state
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState("");
  const [evidenceFileType, setEvidenceFileType] = useState("");
  const [evidenceDataUrl, setEvidenceDataUrl] = useState<string | null>(null);
  
  // New GRN metadata fields
  const [grnNumber, setGrnNumber] = useState("GRN-2026-021");
  const [receivedDate, setReceivedDate] = useState("2026-08-07");
  const [additionalQty, setAdditionalQty] = useState<number>(30);
  const [condition, setCondition] = useState("Good Condition / Complete");
  const [grnNotes, setGrnNotes] = useState("Supplementary delivery received to fulfill original shortage.");

  // PDF / Document preview modal state
  const [showDocPreview, setShowDocPreview] = useState(false);

  // Initialize or reset fields based on result
  useEffect(() => {
    if (result) {
      setError("");
      setJustification("");
      setPasscode("");
      setDecision("APPROVE_AFTER_REVIEW");
      setEvidenceFile(null);
      setEvidenceFileName("");
      setEvidenceFileType("");
      setEvidenceDataUrl(null);
      
      // Calculate shortage for default additional quantity if applicable
      const poQty = result.poQuantityOrdered || 150;
      const grnQty = result.grnQuantityReceived || 120;
      const shortage = Math.max(0, poQty - grnQty);
      setAdditionalQty(shortage > 0 ? shortage : 30);
      setGrnNumber(`GRN-2026-${Math.floor(100 + Math.random() * 900)}`);
      setReceivedDate(new Date().toISOString().split("T")[0]);
    }
  }, [result, isOpen]);

  if (!isOpen || !result) return null;

  const poOrdered = result.poQuantityOrdered ?? 150;
  const originalReceived = result.grnQuantityReceived ?? 120;
  const numAdditional = Number(additionalQty) || 0;
  const totalReceivedAfterReview = originalReceived + numAdditional;
  const remainingDifference = Math.max(0, poOrdered - totalReceivedAfterReview);

  const formatMoney = (amount?: number | null) => {
    if (amount === undefined || amount === null) return "$0.00";
    return `$${amount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    setError("");
    setEvidenceFile(file);
    setEvidenceFileName(file.name);
    setEvidenceFileType(file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"));

    const reader = new FileReader();
    reader.onload = () => {
      setEvidenceDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    setError("");

    if (decision === "KEEP_ON_HOLD") {
      onResolve(result, "KEEP_ON_HOLD", justification, passcode);
      return;
    }

    if (decision === "APPROVE_AFTER_REVIEW") {
      // REQUIREMENT 10: Mandatory Evidence check
      if (!evidenceFileName || (!evidenceFile && !evidenceDataUrl)) {
        setError("Supporting GRN or delivery evidence is required before this held invoice can be approved.");
        return;
      }

      // REQUIREMENT 14: Justification check (min 10 chars)
      if (!justification.trim() || justification.trim().length < 10) {
        setError("Written approval justification must be at least 10 characters.");
        return;
      }

      // REQUIREMENT 15: Passcode 1111 check
      if (passcode !== "1111") {
        setError("Incorrect passcode. Required passcode is 1111.");
        return;
      }

      const evidenceObj: SupportingEvidence = {
        evidenceType: "SUPPLEMENTARY_GRN",
        filename: evidenceFileName,
        fileDataUrl: evidenceDataUrl || undefined,
        fileType: evidenceFileType,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "Madam Lim",
        grnNumber: grnNumber,
        receivedDate: receivedDate,
        additionalQuantityReceived: numAdditional,
        condition: condition,
        notes: grnNotes
      };

      onResolve(result, "APPROVE_AFTER_REVIEW", justification, passcode, evidenceObj);
    }
  };

  return (
    <div className="fixed inset-0 z-70 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">Resolve Held Invoice</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                Invoice: <span className="text-white font-mono">{result.invoiceNumber}</span> | PO: <span className="text-indigo-300 font-mono">{result.poNumber || "N/A"}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs text-slate-700">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="font-black text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" /> Original Exception Summary
              </span>
              <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 font-black rounded-md text-[10px] uppercase border border-amber-200">
                {result.deterministicStatus || result.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <strong className="text-slate-400 uppercase text-[9px] block font-bold">Supplier</strong>
                <span className="font-bold text-slate-900">{result.supplierName || "Unknown"}</span>
              </div>
              <div>
                <strong className="text-slate-400 uppercase text-[9px] block font-bold">Department</strong>
                <span className="font-bold text-indigo-600">{result.assignedDepartment || "ACCOUNTS"}</span>
              </div>
              <div>
                <strong className="text-slate-400 uppercase text-[9px] block font-bold">Original Hold Reason</strong>
                <span className="font-bold text-amber-900">{result.holdReason || "Manual Review Required"}</span>
              </div>
              <div>
                <strong className="text-slate-400 uppercase text-[9px] block font-bold">Financial Impact</strong>
                <span className="font-mono font-black text-slate-900">{formatMoney(result.potentialFinancialImpact)}</span>
              </div>
            </div>

            {result.holdNote && (
              <div className="pt-2 border-t border-slate-200">
                <strong className="text-slate-400 uppercase text-[9px] block font-bold">Hold Note</strong>
                <p className="text-slate-800 font-medium italic mt-0.5">{result.holdNote}</p>
              </div>
            )}
          </div>

          {/* Decision Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
              Resolution Decision <span className="text-rose-600">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setDecision("APPROVE_AFTER_REVIEW"); setError(""); }}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  decision === "APPROVE_AFTER_REVIEW"
                    ? "bg-emerald-50 border-emerald-600 text-emerald-900 shadow-sm ring-1 ring-emerald-600"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-tight">Approve After Review</span>
                  <CheckCircle2 className={`w-4 h-4 ${decision === "APPROVE_AFTER_REVIEW" ? "text-emerald-600" : "text-slate-300"}`} />
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  Resolve hold with supporting GRN evidence, justification, & passcode 1111.
                </p>
              </button>

              <button
                type="button"
                onClick={() => { setDecision("KEEP_ON_HOLD"); setError(""); }}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                  decision === "KEEP_ON_HOLD"
                    ? "bg-amber-50 border-amber-600 text-amber-900 shadow-sm ring-1 ring-amber-600"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-tight">Keep On Hold</span>
                  <Lock className={`w-4 h-4 ${decision === "KEEP_ON_HOLD" ? "text-amber-600" : "text-slate-300"}`} />
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  Maintain hold status and record review notes.
                </p>
              </button>
            </div>
          </div>

          {/* Form when APPROVE_AFTER_REVIEW */}
          {decision === "APPROVE_AFTER_REVIEW" && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Supporting Receipt Evidence Upload Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-blue-600" />
                    Upload New GRN / Delivery Evidence <span className="text-rose-600">* (Mandatory)</span>
                  </label>
                  <span className="text-[9px] font-bold text-slate-400">JPG, JPEG, PNG, PDF</span>
                </div>

                <p className="text-[11px] text-slate-500 font-medium">
                  Upload the new Goods Received Note or delivery evidence confirming that the original discrepancy has been resolved.
                </p>

                {!evidenceFileName ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 bg-slate-50 hover:bg-blue-50/50 text-center cursor-pointer transition-all group"
                  >
                    <input
                      type="file"
                      id="grn-evidence-upload"
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="grn-evidence-upload" className="cursor-pointer space-y-2 block">
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-xs border border-slate-200 flex items-center justify-center mx-auto text-blue-600 group-hover:scale-105 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-blue-600 underline">Click to browse</span>
                        <span className="text-xs text-slate-500"> or drag and drop new GRN</span>
                      </div>
                      <p className="text-[10px] text-slate-400">Supports receiving photos, signed delivery notes, and supplementary GRN PDFs</p>
                    </label>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {evidenceFileType.includes("pdf") ? (
                        <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                          <FileText className="w-6 h-6" />
                        </div>
                      ) : evidenceDataUrl ? (
                        <img 
                          src={evidenceDataUrl} 
                          alt="GRN Evidence Preview" 
                          className="w-12 h-12 object-cover rounded-xl border border-emerald-200" 
                        />
                      ) : (
                        <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{evidenceFileName}</span>
                          <span className="px-2 py-0.5 bg-emerald-200/60 text-emerald-900 rounded text-[9px] font-black uppercase">Uploaded</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Uploaded by Madam Lim • Ready for verification</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDocPreview(true)}
                        className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Document
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEvidenceFile(null);
                          setEvidenceFileName("");
                          setEvidenceFileType("");
                          setEvidenceDataUrl(null);
                        }}
                        className="p-1.5 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* New GRN Details Inputs */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" /> New GRN Details
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">New GRN Number</label>
                    <input
                      type="text"
                      value={grnNumber}
                      onChange={(e) => setGrnNumber(e.target.value)}
                      placeholder="e.g. GRN-2026-021"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Received Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={receivedDate}
                        onChange={(e) => setReceivedDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Additional Quantity Received</label>
                    <input
                      type="number"
                      value={additionalQty}
                      onChange={(e) => setAdditionalQty(Number(e.target.value))}
                      placeholder="e.g. 30"
                      min={1}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Condition</label>
                    <select
                      value={condition}
                      onChange={(e) => setCondition(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                    >
                      <option value="Good Condition / Complete">Good Condition / Complete</option>
                      <option value="Minor Damage - Accepted">Minor Damage - Accepted</option>
                      <option value="Partial Delivery">Partial Delivery</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">GRN Receiving Notes</label>
                  <input
                    type="text"
                    value={grnNotes}
                    onChange={(e) => setGrnNotes(e.target.value)}
                    placeholder="e.g. Supplementary shipment verified by warehouse staff"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              {/* Dynamic Quantity Reconciliation Calculation */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-indigo-600" /> Quantity Reconciliation
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">Original Receipt</span>
                    <span className="text-base font-black text-slate-700">{originalReceived}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                    <span className="text-[9px] font-bold text-indigo-600 uppercase block">+ Additional</span>
                    <span className="text-base font-black text-indigo-600">+{numAdditional}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                    <span className="text-[9px] font-bold text-emerald-700 uppercase block">Total Received</span>
                    <span className="text-base font-black text-emerald-700">{totalReceivedAfterReview}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase block">PO Ordered</span>
                    <span className="text-base font-black text-slate-900">{poOrdered}</span>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Remaining Difference:</span>
                  <span className={`font-black font-mono ${remainingDifference === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {remainingDifference} units
                  </span>
                </div>

                <p className="text-[11px] text-indigo-950 font-bold italic">
                  {remainingDifference === 0
                    ? `Supporting GRN indicates that the previously outstanding ${poOrdered - originalReceived} units have now been received.`
                    : `Supporting GRN indicates additional ${numAdditional} units received. Remaining variance: ${remainingDifference} units.`}
                </p>
              </div>

              {/* Written Approval Justification */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-700 tracking-wider block">
                  Why is this invoice being approved despite the original exception? <span className="text-rose-600">* (Min 10 chars)</span>
                </label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Supplier subsequently delivered the remaining 30 units under GRN-2026-021. Warehouse confirmed all units were received in good condition."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs font-medium text-slate-800 outline-none focus:border-emerald-600 resize-none shadow-xs"
                />
                <div className="flex justify-between items-center text-[9px]">
                  <span className={`${justification.trim().length >= 10 ? "text-emerald-600 font-bold" : "text-slate-400"}`}>
                    {justification.trim().length} / 10 minimum characters
                  </span>
                  <span className="text-slate-400">Must detail the resolution reason</span>
                </div>
              </div>

              {/* Authorisation Passcode */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-700 tracking-wider block">
                  Authorisation Passcode <span className="text-rose-600">* (Required: 1111)</span>
                </label>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter 4-digit passcode (1111)"
                  maxLength={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:border-emerald-600 tracking-widest font-mono"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2.5 animate-in shake duration-200">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-slate-200 rounded-xl font-bold text-xs text-slate-600 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-wider shadow-md transition-all"
          >
            Confirm Resolution
          </button>
        </div>
      </div>

      {/* Lightbox / Document Preview Modal for Uploaded GRN */}
      {showDocPreview && (
        <div className="fixed inset-0 z-80 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-400" /> Evidence Document: {evidenceFileName}
              </span>
              <button 
                onClick={() => setShowDocPreview(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 flex items-center justify-center bg-slate-100">
              {evidenceFileType.includes("pdf") ? (
                <div className="text-center p-12 bg-white rounded-2xl border border-slate-200 space-y-4 max-w-md">
                  <FileText className="w-16 h-16 text-rose-500 mx-auto" />
                  <h4 className="font-black text-slate-900 text-sm">{evidenceFileName}</h4>
                  <p className="text-xs text-slate-500 font-medium">Supplementary GRN PDF document attached to review history.</p>
                  <a
                    href={evidenceDataUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block px-5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl"
                  >
                    Download PDF
                  </a>
                </div>
              ) : evidenceDataUrl ? (
                <img 
                  src={evidenceDataUrl} 
                  alt="Supporting GRN Evidence" 
                  className="max-h-[60vh] max-w-full object-contain rounded-2xl border shadow-lg"
                />
              ) : (
                <p className="text-slate-500 font-medium text-xs">No preview available for this file type.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
