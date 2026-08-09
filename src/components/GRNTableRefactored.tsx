import React, { useState, useMemo } from "react";
import { GRNData, ReviewStatus } from "../types";
import { getGRNDisplayStatus } from "../logic";
import { 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  FileText, 
  Eye, 
  Trash2, 
  X, 
  MessageSquare, 
  Copy, 
  Check, 
  ShieldAlert,
  ArrowUpDown
} from "lucide-react";

interface GRNTableRefactoredProps {
  grns: GRNData[];
  onReview: (id: string) => void;
  onDelete: (id: string) => void;
  onMarkReviewed?: (id: string, notes: string) => void;
}

export function GRNTableRefactored({ grns, onReview, onDelete, onMarkReviewed }: GRNTableRefactoredProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [drawerGrn, setDrawerGrn] = useState<GRNData | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [copiedWarehouseMsg, setCopiedWarehouseMsg] = useState(false);

  // Dynamic calculations for summary cards
  const stats = useMemo(() => {
    let ready = 0;
    let reviewRequired = 0;
    let deliveryIssues = 0;
    let rejected = 0;

    grns.forEach(g => {
      const { displayStatus, businessIssue } = getGRNDisplayStatus(g);
      if (displayStatus === "REVIEW_REQUIRED") {
        reviewRequired++;
      } else {
        ready++;
      }

      if (businessIssue) {
        deliveryIssues++;
      }

      if ((g.rejectedQuantity || 0) > 0) {
        rejected++;
      }
    });

    return {
      loaded: grns.length,
      ready,
      reviewRequired,
      deliveryIssues,
      rejected
    };
  }, [grns]);

  // Filtered & Sorted Records
  const processedGrns = useMemo(() => {
    return grns.filter(g => {
      const { displayStatus, businessIssue } = getGRNDisplayStatus(g);

      // Filter pill logic
      if (activeFilter === "READY" && displayStatus !== "READY") return false;
      if (activeFilter === "REVIEW_REQUIRED" && displayStatus !== "REVIEW_REQUIRED") return false;
      if (activeFilter === "SHORT_DELIVERY" && businessIssue !== "SHORT_DELIVERY" && businessIssue !== "PARTIAL_DELIVERY") return false;
      if (activeFilter === "CONDITION_ISSUE" && businessIssue !== "CONDITION_ISSUE") return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const grnNo = (g.grnNumber || "").toLowerCase();
        const poNo = (g.poNumber || "").toLowerCase();
        const supplier = (g.supplierName || "").toLowerCase();
        const item = (g.itemDescription || "").toLowerCase();
        const cond = (g.condition || "").toLowerCase();
        return grnNo.includes(term) || poNo.includes(term) || supplier.includes(term) || item.includes(term) || cond.includes(term);
      }

      return true;
    }).sort((a, b) => {
      const statusA = getGRNDisplayStatus(a).displayStatus;
      const statusB = getGRNDisplayStatus(b).displayStatus;

      // Review Required first
      if (statusA === "REVIEW_REQUIRED" && statusB !== "REVIEW_REQUIRED") return -1;
      if (statusA !== "REVIEW_REQUIRED" && statusB === "REVIEW_REQUIRED") return 1;

      // PO Number ascending
      const poA = a.poNumber || "";
      const poB = b.poNumber || "";
      return poA.localeCompare(poB);
    });
  }, [grns, searchTerm, activeFilter]);

  const handleCopyWarehouseMsg = (grn: GRNData) => {
    const { issueLabel, varianceText } = getGRNDisplayStatus(grn);
    const msg = `Hi Warehouse Team, regarding GRN ${grn.grnNumber || 'N/A'} for PO ${grn.poNumber || 'N/A'}: We noted ${issueLabel || 'a delivery variance'} (${varianceText}, Condition: ${grn.condition || 'N/A'}). Please verify whether remaining items are pending delivery or if a replacement/credit note is required. Thank you.`;
    navigator.clipboard.writeText(msg);
    setCopiedWarehouseMsg(true);
    setTimeout(() => setCopiedWarehouseMsg(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Dynamic Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">GRNs Loaded</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-slate-900">{stats.loaded}</span>
            <span className="text-[10px] font-bold text-slate-400">Total Records</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Ready</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-emerald-600">{stats.ready}</span>
            <span className="text-[10px] font-bold text-emerald-600">Complete</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Review Required</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-amber-600">{stats.reviewRequired}</span>
            <span className="text-[10px] font-bold text-amber-600">Action Needed</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider">Delivery Issues</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-rose-600">{stats.deliveryIssues}</span>
            <span className="text-[10px] font-bold text-rose-600">Short/Damaged</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Rejected</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-slate-700">{stats.rejected}</span>
            <span className="text-[10px] font-bold text-slate-400">Returned</span>
          </div>
        </div>
      </div>

      {/* 2. Controls & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "ALL" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({grns.length})
          </button>
          <button
            onClick={() => setActiveFilter("READY")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "READY" ? "bg-emerald-600 text-white shadow-sm" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Ready ({stats.ready})
          </button>
          <button
            onClick={() => setActiveFilter("REVIEW_REQUIRED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "REVIEW_REQUIRED" ? "bg-amber-500 text-white shadow-sm" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            Review Required ({stats.reviewRequired})
          </button>
          <button
            onClick={() => setActiveFilter("SHORT_DELIVERY")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "SHORT_DELIVERY" ? "bg-rose-600 text-white shadow-sm" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            Short Delivery
          </button>
          <button
            onClick={() => setActiveFilter("CONDITION_ISSUE")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeFilter === "CONDITION_ISSUE" ? "bg-red-600 text-white shadow-sm" : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            Condition Issue
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search GRN, PO, supplier or item..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. Main GRN Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 w-[160px]">Status</th>
                <th className="px-6 py-4 w-[140px]">GRN Number</th>
                <th className="px-6 py-4 w-[140px]">PO Number</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4 text-right w-[90px]">Ordered</th>
                <th className="px-6 py-4 text-right w-[90px]">Received</th>
                <th className="px-6 py-4 text-right w-[110px]">Variance</th>
                <th className="px-6 py-4 w-[160px]">Condition</th>
                <th className="px-6 py-4 text-center w-[120px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {processedGrns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 italic">
                    No Goods Received Notes match your search and filter criteria.
                  </td>
                </tr>
              ) : (
                processedGrns.map((g) => {
                  const { displayStatus, businessIssue, issueLabel, varianceText, conditionText } = getGRNDisplayStatus(g);

                  return (
                    <tr 
                      key={g.grnRecordId} 
                      className={`hover:bg-slate-50 transition-colors ${
                        displayStatus === "REVIEW_REQUIRED" ? "bg-amber-50/20" : ""
                      }`}
                    >
                      {/* Status */}
                      <td className="px-6 py-4">
                        {displayStatus === "REVIEW_REQUIRED" ? (
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-tight ${
                            businessIssue === "CONDITION_ISSUE" ? "bg-red-100 text-red-800 border border-red-200" :
                            "bg-amber-100 text-amber-800 border border-amber-200"
                          }`}>
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {issueLabel || "REVIEW REQUIRED"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-600" /> READY
                          </span>
                        )}
                      </td>

                      {/* GRN Number */}
                      <td className="px-6 py-4 font-black text-slate-900">{g.grnNumber || "N/A"}</td>

                      {/* PO Number */}
                      <td className="px-6 py-4 font-bold text-indigo-600">{g.poNumber || "N/A"}</td>

                      {/* Supplier */}
                      <td className="px-6 py-4 font-bold text-slate-800 truncate max-w-[180px]" title={g.supplierName || ""}>
                        {g.supplierName || "N/A"}
                      </td>

                      {/* Ordered */}
                      <td className="px-6 py-4 text-right font-bold text-slate-500">{g.quantityOrdered ?? "N/A"}</td>

                      {/* Received */}
                      <td className="px-6 py-4 text-right font-black text-slate-900">{g.quantityReceived ?? "N/A"}</td>

                      {/* Variance */}
                      <td className={`px-6 py-4 text-right font-black ${
                        varianceText.includes("SHORT") ? "text-rose-600" : "text-emerald-600"
                      }`}>
                        {varianceText}
                      </td>

                      {/* Condition */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                          conditionText.includes("DAMAGED") || conditionText.includes("BROKEN") ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            conditionText.includes("DAMAGED") || conditionText.includes("BROKEN") ? "bg-rose-500" : "bg-emerald-500"
                          }`} />
                          {conditionText}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setDrawerGrn(g);
                              setReviewNote("");
                            }}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"
                          >
                            <Eye className="w-3 h-3" /> Review
                          </button>
                          <button
                            onClick={() => onDelete(g.grnRecordId)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete GRN"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. GRN Details & Review Drawer */}
      {drawerGrn && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-black uppercase tracking-tight">
                    GRN Details: {drawerGrn.grnNumber || 'N/A'}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  PO Reference: <span className="font-mono text-indigo-300 font-bold">{drawerGrn.poNumber || 'N/A'}</span>
                </p>
              </div>
              <button
                onClick={() => setDrawerGrn(null)}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Section A: Record Summary */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" /> Record Summary
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">GRN Number</span>
                    <span className="font-black text-slate-900">{drawerGrn.grnNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">PO Reference</span>
                    <span className="font-bold text-indigo-600">{drawerGrn.poNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Supplier Name</span>
                    <span className="font-bold text-slate-800">{drawerGrn.supplierName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">GRN Date</span>
                    <span className="font-medium text-slate-600">{drawerGrn.grnDate || 'N/A'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Item Description</span>
                    <span className="font-medium text-slate-700 italic">{drawerGrn.itemDescription || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Section B: Quantity Check */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <ArrowUpDown className="w-4 h-4 text-indigo-600" /> Quantity Check
                </h4>
                <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Ordered</span>
                    <span className="text-base font-black text-slate-700">{drawerGrn.quantityOrdered ?? 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Received</span>
                    <span className="text-base font-black text-slate-900">{drawerGrn.quantityReceived ?? 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Variance</span>
                    <span className={`text-base font-black ${
                      (drawerGrn.quantityDifference || 0) > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}>
                      {getGRNDisplayStatus(drawerGrn).varianceText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section C: Condition Check */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" /> Condition Check
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Condition Logged:</span>
                    <span className="font-bold text-slate-900">{drawerGrn.condition || 'Good'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-100">
                    <span className="text-slate-500">Damaged Quantity:</span>
                    <span className={`font-bold ${drawerGrn.damagedQuantity ? "text-rose-600" : "text-slate-700"}`}>
                      {drawerGrn.damagedQuantity || 0} units
                    </span>
                  </div>
                  {drawerGrn.warehouseNotes && (
                    <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-100 text-amber-900 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">Warehouse Notes</span>
                      <p className="font-medium italic">{drawerGrn.warehouseNotes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Section D: Recommended Action */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-4 rounded-xl border border-indigo-100 space-y-2 text-xs">
                <h4 className="font-black uppercase tracking-wider text-indigo-900 text-[11px] flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-indigo-600" /> Recommended Action
                </h4>
                <p className="text-slate-700 font-medium leading-relaxed">
                  {getGRNDisplayStatus(drawerGrn).businessIssue === "CONDITION_ISSUE"
                    ? "Ask Warehouse to confirm how many goods were accepted, returned or awaiting replacement."
                    : getGRNDisplayStatus(drawerGrn).businessIssue === "SHORT_DELIVERY" || getGRNDisplayStatus(drawerGrn).businessIssue === "PARTIAL_DELIVERY"
                    ? "Ask Warehouse whether the remaining quantity was delivered under another GRN or is still pending."
                    : "Record looks good. No further action required."}
                </p>
                <button
                  onClick={() => handleCopyWarehouseMsg(drawerGrn)}
                  className="mt-2 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-2xs"
                >
                  {copiedWarehouseMsg ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedWarehouseMsg ? "Copied Message!" : "Copy Warehouse Inquiry Message"}
                </button>
              </div>

              {/* Section E: Review Notes Input */}
              <div className="space-y-1 text-xs">
                <label className="font-black uppercase text-slate-400 tracking-wider text-[10px] block">Add Review Note</label>
                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Enter notes or updates from warehouse..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[70px]"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4 shrink-0">
              <button
                onClick={() => setDrawerGrn(null)}
                className="px-5 py-2.5 border border-slate-200 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
              {onMarkReviewed && (
                <button
                  onClick={() => {
                    onMarkReviewed(drawerGrn.grnRecordId, reviewNote || "Reviewed by Madam Lim");
                    setDrawerGrn(null);
                  }}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center gap-2 transition-all shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark as Reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
