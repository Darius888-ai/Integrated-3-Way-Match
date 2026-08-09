import React, { useState, useMemo } from "react";
import { InvoiceData, App1ImportSummary } from "../types";
import { 
  FileCheck, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  Building2, 
  Eye, 
  X,
  FileSpreadsheet,
  Info
} from "lucide-react";

interface Step3InvoiceSectionProps {
  summary: App1ImportSummary | null;
  invoices: InvoiceData[];
  skippedRows: any[];
  onReset: () => void;
  onNavigateToMatch?: () => void;
  onUploadClick: () => void;
  isLoading?: boolean;
  importStatus: "IDLE" | "READING_WORKBOOK" | "FAILED" | "IMPORTED";
  importError: string | null;
  excelPreview?: any;
  setExcelPreview?: (val: any) => void;
  commitExcelImport?: (val: any) => void;
  sortBy: string;
  setSortBy: (val: any) => void;
  groupBy: string;
  setGroupBy: (val: any) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
}

export function Step3InvoiceSection({
  summary,
  invoices,
  skippedRows,
  onReset,
  onNavigateToMatch,
  onUploadClick,
  isLoading,
  importStatus,
  importError,
  excelPreview,
  setExcelPreview,
  commitExcelImport,
  sortBy,
  setSortBy,
  groupBy,
  setGroupBy,
  searchTerm,
  setSearchTerm
}: Step3InvoiceSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);

  // Dynamic calculations for summary cards
  const stats = useMemo(() => {
    const importedCount = invoices.length;
    const readyCount = invoices.length;
    const reviewRequiredCount = 0;
    const missingLineItemsCount = 0;
    const skippedCount = summary?.skippedCount || skippedRows.length || 0;

    return {
      importedCount,
      readyCount,
      missingLineItemsCount,
      skippedCount,
      reviewRequiredCount
    };
  }, [invoices, summary, skippedRows]);

  // Format currency helper
  const formatMoney = (amount?: number | null) => {
    if (amount === undefined || amount === null) return "$0.00";
    return `$${amount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Filtered & Sorted Invoices
  const filteredInvoices = useMemo(() => {
    let result = [...invoices];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(inv => {
        const invNo = (inv.invoice_number || "").toLowerCase();
        const poNo = (inv.po_number || "").toLowerCase();
        const supplier = (inv.supplier_name || "").toLowerCase();
        return invNo.includes(term) || poNo.includes(term) || supplier.includes(term);
      });
    }

    const safeText = (value: unknown): string => String(value ?? "").trim();
    const compareText = (first: unknown, second: unknown): number =>
      safeText(first).localeCompare(safeText(second), undefined, {
        numeric: true,
        sensitivity: "base"
      });

    const parseSortDate = (value: unknown): number => {
      if (!value) return Number.POSITIVE_INFINITY;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? Number.POSITIVE_INFINITY : value.getTime();
      const parsed = Date.parse(String(value));
      return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
    };

    const parseSortAmount = (value: unknown): number => {
      if (value === null || value === undefined || String(value).trim() === "") return Number.POSITIVE_INFINITY;
      const parsed = Number(String(value).replace(/[$,\s]/g, ""));
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };

    result.sort((a, b) => {
      switch (sortBy) {
        case "PO_NUMBER_ASC": return compareText(a.po_number, b.po_number);
        case "PO_NUMBER_DESC": return compareText(b.po_number, a.po_number);
        case "INVOICE_NUMBER_ASC": return compareText(a.invoice_number, b.invoice_number);
        case "INVOICE_NUMBER_DESC": return compareText(b.invoice_number, a.invoice_number);
        case "SUPPLIER_ASC": return compareText(a.supplier_name, b.supplier_name);
        case "SUPPLIER_DESC": return compareText(b.supplier_name, a.supplier_name);
        case "INVOICE_DATE_ASC": return parseSortDate(a.invoice_date) - parseSortDate(b.invoice_date);
        case "INVOICE_DATE_DESC": return parseSortDate(b.invoice_date) - parseSortDate(a.invoice_date);
        case "DUE_DATE_ASC": return parseSortDate(a.due_date) - parseSortDate(b.due_date);
        case "DUE_DATE_DESC": return parseSortDate(b.due_date) - parseSortDate(a.due_date);
        case "TOTAL_AMOUNT_ASC": return parseSortAmount(a.total_amount) - parseSortAmount(b.total_amount);
        case "TOTAL_AMOUNT_DESC": return parseSortAmount(b.total_amount) - parseSortAmount(a.total_amount);
        default: return 0;
      }
    });

    return result;
  }, [invoices, searchTerm, sortBy]);

  // Grouped Invoices (by PO Number or Supplier)
  const groupedInvoices = useMemo(() => {
    if (groupBy === "NONE") {
      return [{ groupKey: "All Invoices", groupLabel: "All Imported Invoices", invoices: filteredInvoices }];
    }

    const normalisePOReference = (value: unknown): string =>
      String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    const groupsMap = new Map<string, { label: string; supplier: string; items: InvoiceData[] }>();

    filteredInvoices.forEach(inv => {
      let key = "UNASSIGNED";
      let label = "Unassigned";
      let supplier = inv.supplier_name || "Unknown";

      if (groupBy === "PO") {
        key = normalisePOReference(inv.po_number) || "NO_PO";
        label = inv.po_number ? `${inv.po_number.trim().toUpperCase()}` : "No PO Reference";
      } else if (groupBy === "SUPPLIER") {
        key = (inv.supplier_name || "UNKNOWN_SUPPLIER").trim().toUpperCase();
        label = inv.supplier_name || "Unknown Supplier";
      }

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { label, supplier, items: [] });
      }
      groupsMap.get(key)!.items.push(inv);
    });

    const result = Array.from(groupsMap.entries()).map(([groupKey, data]) => {
      const totalVal = data.items.reduce((sum, i) => sum + (i.total_amount || 0), 0);
      return {
        groupKey,
        groupLabel: data.label,
        supplierName: data.supplier,
        invoices: data.items,
        totalAmount: totalVal
      };
    });

    // Default sorting for groups alphabetically
    result.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel, undefined, { numeric: true, sensitivity: 'base' }));

    return result;
  }, [filteredInvoices, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key]
    }));
  };

  const isExpanded = (key: string) => expandedGroups[key] !== false; // Default expanded

  if (excelPreview?.show && excelPreview.invoiceResult) {
    const { invoices, summary: previewSummary } = excelPreview.invoiceResult;
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-8 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">WORKBOOK IMPORT PREVIEW: {excelPreview.filename}</h3>
            <p className="text-sm text-slate-500 font-medium">Worksheet: <span className="text-blue-600 font-bold">{previewSummary.worksheetSelected}</span></p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => setExcelPreview?.(null)}
              className="px-6 py-3 bg-white border-2 border-slate-900 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={() => commitExcelImport?.(excelPreview)}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/25 flex items-center gap-2"
            >
              <FileCheck className="w-4 h-4" /> Confirm Import ({invoices.length} Invoices)
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Records Read</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-black text-slate-900">{previewSummary.recordsRead}</span>
              <span className="text-[10px] font-bold text-slate-400">Total Scanned</span>
            </div>
          </div>
          <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Ready for Match</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-black text-emerald-600">{invoices.length}</span>
              <span className="text-[10px] font-bold text-emerald-600">Approved Status</span>
            </div>
          </div>
          <div className="bg-rose-50/50 p-6 rounded-2xl border border-rose-100 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider">Skipped</span>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-black text-rose-600">{previewSummary.skippedCount}</span>
              <span className="text-[10px] font-bold text-rose-600">Incomplete/Other</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 text-xs font-medium flex items-center gap-3">
          <Info className="w-5 h-5 text-blue-600 shrink-0" />
          <p>Review the summary above before committing. Only approved invoices with valid PO references will be imported into Step 3.</p>
        </div>
      </div>
    );
  }

  const hasImportedInvoices = Array.isArray(invoices) && invoices.length > 0;
  
  if (!hasImportedInvoices && importStatus !== "READING_WORKBOOK") {
    return (
      <div className="space-y-8">
        {/* Empty State Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Invoices Imported", value: 0, color: "slate" },
            { label: "Ready for Match", value: 0, color: "emerald" },
            { label: "Skipped", value: 0, color: "rose" },
            { label: "Review Required", value: 0, color: "amber" }
          ].map((card, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between opacity-50">
              <span className={`text-[10px] font-black uppercase tracking-wider ${card.color === 'slate' ? 'text-slate-400' : `text-${card.color}-600`}`}>{card.label}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-black text-slate-300">0</span>
              </div>
            </div>
          ))}
        </div>

        {summary && !hasImportedInvoices ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs text-center space-y-6">
            <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-xl font-black text-slate-900">WORKBOOK NOT IMPORTED</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                The previous workbook <strong>({summary.fileName})</strong> did not import any invoice records. Reset Step 3 or select the workbook again.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button 
                type="button"
                onClick={onUploadClick}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
              >
                Select Workbook Again
              </button>
              <button 
                type="button"
                onClick={onReset}
                className="px-6 py-3 bg-white border-2 border-slate-900 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
              >
                Reset Step 3 Data
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 shadow-xs text-center space-y-6">
            <div className="w-20 h-20 bg-blue-50 border border-blue-100 rounded-3xl flex items-center justify-center mx-auto mb-2">
              <FileSpreadsheet className="w-10 h-10 text-blue-600" />
            </div>
            <div className="max-w-md mx-auto space-y-3">
              <h3 className="text-2xl font-black text-slate-900">IMPORT APP 1 INVOICES</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Connect the App 1 Approved Invoice Register to verify billing accuracy. 
                Upload the Excel export file to begin matching.
              </p>
            </div>
            
            {importError && (
              <div className="max-w-md mx-auto p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-700 text-xs text-left">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              <button 
                type="button"
                onClick={onUploadClick}
                className="px-8 py-4 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/25 flex items-center gap-3 mx-auto group"
              >
                <FileSpreadsheet className="w-4 h-4" />
                UPLOAD APP 1 WORKBOOK
              </button>

              {(importError || summary) && (
                <button 
                  type="button"
                  onClick={onReset}
                  className="px-6 py-2 bg-white border border-slate-200 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 hover:text-rose-600 transition-all"
                >
                  Reset Step 3 Data
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Dynamic Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Invoices Imported</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-slate-900">{stats.importedCount}</span>
            <span className="text-[10px] font-bold text-slate-400">Total Records</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Ready for Match</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-emerald-600">{stats.readyCount}</span>
            <span className="text-[10px] font-bold text-emerald-600">Complete</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-rose-600 tracking-wider">Skipped</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-slate-700">{stats.skippedCount}</span>
            <span className="text-[10px] font-bold text-slate-400">Ignored</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Review Required</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-3xl font-black text-amber-600">{stats.reviewRequiredCount}</span>
            <span className="text-[10px] font-bold text-amber-600">Flagged</span>
          </div>
        </div>
      </div>

      {/* 2. Compact Import Information Banner (White Card) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-start gap-4">
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl shrink-0">
            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-slate-900 truncate max-w-md">
                {summary?.fileName || "App 1 Direct Transfer"}
              </h3>
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase rounded-md border border-emerald-200">
                {summary ? "Active Workbook" : "Transferred from App 1"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500 flex-wrap pt-0.5">
              {summary ? (
                <>
                  <span>Worksheet: <strong className="text-slate-800">{summary?.worksheetSelected || "Approved Invoice"}</strong></span>
                  <span>•</span>
                </>
              ) : null}
              <span>Records: <strong className="text-slate-800">{invoices.length} imported</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onUploadClick}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {summary ? "Replace Workbook" : "Import Workbook"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Reset Step 3 Data
          </button>
        </div>
      </div>

      {/* 3. Filter, Group By & Sort Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Group By Control */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Group By:</span>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setGroupBy("PO")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  groupBy === "PO" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                PO Number
              </button>
              <button
                onClick={() => setGroupBy("SUPPLIER")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  groupBy === "SUPPLIER" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Supplier
              </button>
              <button
                onClick={() => setGroupBy("NONE")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  groupBy === "NONE" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Flat List
              </button>
            </div>
          </div>

          {/* Sort Control */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none"
            >
              <option value="PO_NUMBER_ASC">PO Number (Asc)</option>
              <option value="PO_NUMBER_DESC">PO Number (Desc)</option>
              <option value="INVOICE_NUMBER_ASC">Invoice Number (Asc)</option>
              <option value="INVOICE_NUMBER_DESC">Invoice Number (Desc)</option>
              <option value="SUPPLIER_ASC">Supplier (A–Z)</option>
              <option value="SUPPLIER_DESC">Supplier (Z–A)</option>
              <option value="INVOICE_DATE_ASC">Invoice Date (Earliest)</option>
              <option value="INVOICE_DATE_DESC">Invoice Date (Latest)</option>
              <option value="DUE_DATE_ASC">Due Date (Earliest)</option>
              <option value="DUE_DATE_DESC">Due Date (Latest)</option>
              <option value="TOTAL_AMOUNT_ASC">Total Amount (Low–High)</option>
              <option value="TOTAL_AMOUNT_DESC">Total Amount (High–Low)</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search PO, invoice or supplier..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Grouped Invoices Display */}
      <div className="space-y-6">
        {groupedInvoices.map(group => {
          const expanded = isExpanded(group.groupKey);

          return (
            <div key={group.groupKey} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Group Header (Light purple PO header) */}
              <div 
                onClick={() => toggleGroup(group.groupKey)}
                className="bg-purple-50/70 hover:bg-purple-100/60 p-4 border-b border-purple-100 flex items-center justify-between cursor-pointer transition-colors select-none"
              >
                <div className="flex items-center gap-3">
                  <button className="text-purple-700 p-1 hover:bg-purple-200/50 rounded-lg">
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-black text-slate-900 text-sm tracking-tight">{group.groupLabel}</span>
                    <span className="text-xs font-bold text-slate-600">• {group.supplierName}</span>
                    <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 text-[10px] font-black uppercase rounded-md border border-purple-200">
                      {group.invoices.length} {group.invoices.length === 1 ? 'invoice' : 'invoices'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {group.totalAmount !== undefined && (
                    <span className="font-mono font-black text-slate-900 text-sm">
                      Total: {formatMoney(group.totalAmount)}
                    </span>
                  )}
                </div>
              </div>

              {/* Group Table Body */}
              {expanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 w-[150px]">Invoice Number</th>
                        <th className="px-6 py-3">Supplier Name</th>
                        <th className="px-6 py-3 w-[120px]">Invoice Date</th>
                        <th className="px-6 py-3 w-[120px]">Due Date</th>
                        <th className="px-6 py-3 text-right w-[140px]">Total Amount</th>
                        <th className="px-6 py-3 w-[140px]">Import Status</th>
                        <th className="px-6 py-3 text-center w-[120px]">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {group.invoices.map((inv, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3.5 font-black text-slate-900">{inv.invoice_number || 'N/A'}</td>
                          <td className="px-6 py-3.5 font-bold text-slate-800">{inv.supplier_name || 'N/A'}</td>
                          <td className="px-6 py-3.5 text-slate-600 font-medium">{inv.invoice_date || 'N/A'}</td>
                          <td className="px-6 py-3.5 text-slate-600 font-medium">{inv.due_date || 'N/A'}</td>
                          <td className="px-6 py-3.5 text-right font-mono font-black text-slate-900">
                            {formatMoney(inv.total_amount)}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase">
                              ✓ Ready for Match
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <button
                              onClick={() => setSelectedInvoice(inv)}
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-black uppercase rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" /> View Data
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Invoice Data Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  Invoice Data: {selectedInvoice.invoice_number}
                </h3>
                <p className="text-xs text-slate-500">App 1 Imported Record</p>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Supplier</span>
                  <span className="font-bold text-slate-900">{selectedInvoice.supplier_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">PO Reference</span>
                  <span className="font-bold text-indigo-600">{selectedInvoice.po_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Invoice Date</span>
                  <span className="font-medium text-slate-700">{selectedInvoice.invoice_date}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Due Date</span>
                  <span className="font-medium text-slate-700">{selectedInvoice.due_date}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Subtotal</span>
                  <span className="font-mono font-bold text-slate-800">{formatMoney(selectedInvoice.subtotal || selectedInvoice.total_amount)}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Total Amount</span>
                  <span className="font-mono font-black text-slate-900">{formatMoney(selectedInvoice.total_amount)}</span>
                </div>
              </div>

            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
