import * as XLSX from "xlsx";
import { MatchResult } from "../types";

export const PAYMENT_PROCESSING_EMAIL = "jaydentan7123a@gmail.com";
export const PAYMENT_EMAIL_ENDPOINT = "https://script.google.com/macros/s/AKfycbx8odaRRdPPxAxit9SxuJYSBPTPvA4jKyVpUNc7A77tm6L2Ys6h7g2StJd0NV4BudR0qg/exec";

export function isHumanApprovedForPayment(
  result: MatchResult,
  approvalByResultKey?: Record<string, any>,
  getResultKey?: (r: any) => string
): boolean {
  if (!result) return false;

  const humanReviewStatus = String(result.humanReviewStatus || "").toUpperCase();
  if (humanReviewStatus === "ON_HOLD" || humanReviewStatus === "REJECTED") {
    return false;
  }

  const approvalRecStatus = String(result.approvalRecommendationStatus || "").toUpperCase();
  const reviewRes = String(result.reviewResolution || "").toUpperCase();
  const humanDec = String(result.humanDecision || "").toUpperCase();

  let keyApproved = false;
  if (approvalByResultKey && getResultKey) {
    const key = getResultKey(result);
    if (approvalByResultKey[key]?.status === "CONFIRMED") {
      keyApproved = true;
    }
  }

  if (approvalRecStatus === "CONFIRMED" || keyApproved) {
    return true;
  }

  if (
    approvalRecStatus === "CONFIRMED_AFTER_REVIEW" ||
    reviewRes === "APPROVED_AFTER_REVIEW" ||
    humanDec === "APPROVE_FOR_PAYMENT"
  ) {
    return true;
  }

  return false;
}

export interface ApprovedPaymentExcelData {
  fileName: string;
  base64Excel: string;
  blob: Blob;
  transferId: string;
  triggerDownload: () => void;
  rows: any[];
  approvedCount: number;
  totalAmount: number;
}

function formatDate(dateInput?: string | number | Date | null): string {
  if (!dateInput) return "N/A";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDateDDMMYYYY(dateInput?: string | number | Date | null): string {
  if (!dateInput) return "N/A";
  const str = String(dateInput).trim();
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return str;
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatReportDateDDMMYY(dateInput?: string | number | Date | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return "08/08/26";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatGeneratedAtDDMMYY(dateInput?: string | number | Date | null): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return "08/08/26 00:00";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

const normalise = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

function findSourceInvoice(result: MatchResult, importedInvoices: any[] = []) {
  if (!importedInvoices || importedInvoices.length === 0) return null;
  const resAny = result as any;
  return importedInvoices.find(invoice => {
    if (resAny.record_id && (invoice.record_id === resAny.record_id || invoice.id === resAny.record_id)) {
      return true;
    }
    const invNum = invoice.invoice_number || invoice.invoiceNumber;
    const supName = invoice.supplier_name || invoice.supplierName;
    const resInvNum = resAny.invoiceNumber || resAny.invoice_number;
    const resSupName = resAny.supplierName || resAny.supplier_name;

    if (invNum && supName && resInvNum && resSupName) {
      return (
        normalise(invNum) === normalise(resInvNum) &&
        normalise(supName) === normalise(resSupName)
      );
    }
    return false;
  });
}

function formatDateTime(dateInput?: string | number | Date | null): string {
  if (!dateInput) return "N/A";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${mins}`;
}

function formatMatchStatusForDisplay(statusStr?: string): string {
  if (!statusStr) return "Clean Match";
  const upper = statusStr.trim().toUpperCase();
  if (upper.includes("CLEAN")) return "Clean Match";
  if (upper.includes("QUANTITY")) return "Quantity Mismatch";
  if (upper.includes("PRICE")) return "Price Mismatch";
  if (upper.includes("CONDITION")) return "Condition Issue";
  if (upper.includes("DUPLICATE")) return "Possible Duplicate";
  if (upper.includes("NO_PO") || upper.includes("NO PO")) return "No PO Found";
  if (upper.includes("NO_GRN") || upper.includes("NO GRN")) return "No GRN Found";
  if (upper.includes("TOTAL")) return "Total Mismatch";
  if (upper.includes("SUPPLIER")) return "Supplier Mismatch";
  return statusStr.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function generateApprovedPaymentsExcel(
  approvedResults: MatchResult[],
  allResults: MatchResult[] = [],
  transferId: string = `TRF-${Date.now()}`,
  importedInvoiceRecords: any[] = []
): ApprovedPaymentExcelData {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const mins = String(now.getMinutes()).padStart(2, "0");

  const reportDateStr = formatReportDateDDMMYY(now);
  const generatedAtStr = formatGeneratedAtDDMMYY(now);

  const fileName = `Boon_Huat_Approved_Payments_${year}-${month}-${day}_${hours}${mins}.xlsx`;

  const approvedCount = approvedResults.length;
  const totalAmount = approvedResults.reduce((sum, r) => sum + (r.actualInvoiceAmount || 0), 0);
  const formattedTotalStr = `SGD ${totalAmount.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const todayStr = now.toISOString().split('T')[0];
  const approvedTodayList = approvedResults.filter(r => {
    const d = r.approvalConfirmedAt || r.reviewDate || r.approvedAt;
    if (!d) return true;
    return new Date(d).toISOString().split('T')[0] === todayStr;
  });
  const approvedTodayAmount = approvedTodayList.reduce((s, r) => s + (r.actualInvoiceAmount || 0), 0);

  const onHoldList = allResults.length > 0 ? allResults.filter(r => String(r.humanReviewStatus || "").toUpperCase() === "ON_HOLD") : [];
  const onHoldInvoiceValue = onHoldList.reduce((s, r) => s + (r.actualInvoiceAmount || 0), 0);
  const onHoldFinancialImpact = onHoldList.reduce((s, r) => s + (r.potentialFinancialImpact || r.amountDifference || 0), 0);

  const reviewRequiredList = allResults.length > 0 ? allResults.filter(r => {
    const st = String(r.deterministicStatus || r.status || "").toUpperCase();
    const hr = String(r.humanReviewStatus || "").toUpperCase();
    return (st.includes("REVIEW") || st.includes("MISMATCH") || st.includes("ISSUE") || st.includes("DUPLICATE") || st.includes("NO_PO") || st.includes("NO_GRN")) && hr !== "ON_HOLD" && hr !== "RESOLVED";
  }) : [];

  const formattedOnHoldValStr = `SGD ${onHoldInvoiceValue.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Sheet 1: Approved Payments (App 3 Compatible)
  const sheet1Data: any[][] = [
    ["BOON HUAT HARDWARE & SUPPLIES PTE LTD"],
    ["APPROVED THREE-WAY MATCH PAYMENT REGISTER"],
    ["Report Date:", reportDateStr, "", "Prepared By:", "Madam Lim — Accounts Executive"],
    ["Approved Invoices:", approvedCount, "", "Total Approved Amount:", formattedTotalStr],
    ["Invoices On Hold:", onHoldList.length, "", "Total Amount On Hold:", formattedOnHoldValStr],
    [],
    [
      "No.",
      "Invoice Number",
      "Supplier Name",
      "PO Number",
      "Invoice Date",
      "Due Date",
      "Currency",
      "Invoice Amount",
      "Three-Way Match Result",
      "Approval Status",
      "Approved By",
      "Approved Date",
      "Review / Approval Reason"
    ]
  ];

  const rowsData = approvedResults.map((r, idx) => {
    const isApprovedAfterReview =
      r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW" ||
      r.reviewResolution === "APPROVED_AFTER_REVIEW" ||
      (r.humanReviewStatus as string) === "RESOLVED";

    const sourceInvoice = findSourceInvoice(r, importedInvoiceRecords);
    const rawInvoiceDate = sourceInvoice?.invoice_date || sourceInvoice?.invoiceDate || r.invoiceDate;
    const rawDueDate = sourceInvoice?.due_date || sourceInvoice?.dueDate || r.dueDate;

    const invoiceDateStr = formatDateDDMMYYYY(rawInvoiceDate);
    const dueDateStr = formatDateDDMMYYYY(rawDueDate);
    const approvedDateStr = formatDateTime(r.approvalConfirmedAt || r.reviewDate || now);
    const amountNum = r.actualInvoiceAmount || 0;
    const matchStatusDisplay = formatMatchStatusForDisplay(r.deterministicStatus || r.status);
    const approvalStatusDisplay = isApprovedAfterReview ? "Reviewed & Approved" : "Approval Confirmed";
    const approvedBy = r.approvalConfirmedBy || r.reviewedBy || "Madam Lim";
    const reviewReason = r.reviewNotes || r.approvalJustification || r.holdReason || (isApprovedAfterReview ? "Approved after human exception review" : "Confirmed standard clean match");

    return {
      index: idx + 1,
      invoiceNumber: r.invoiceNumber || "N/A",
      supplierName: r.supplierName || "N/A",
      poNumber: r.poNumber || "N/A",
      invoiceDate: invoiceDateStr,
      dueDate: dueDateStr,
      currency: r.currency || "SGD",
      amountNum,
      matchStatusDisplay,
      approvalStatusDisplay,
      approvedBy,
      approvedDateStr,
      reviewReason,
      transferId,
      app2MatchId: r.matchRecordId || "",
      rawMatchStatus: r.deterministicStatus || "CLEAN_MATCH",
      rawApprovalStatus: isApprovedAfterReview ? "APPROVED_AFTER_REVIEW" : "APPROVED"
    };
  });

  rowsData.forEach(r => {
    sheet1Data.push([
      r.index,
      r.invoiceNumber,
      r.supplierName,
      r.poNumber,
      r.invoiceDate,
      r.dueDate,
      r.currency,
      r.amountNum,
      r.matchStatusDisplay,
      r.approvalStatusDisplay,
      r.approvedBy,
      r.approvedDateStr,
      r.reviewReason
    ]);
  });

  const startRowIdx = 8;
  const endRowIdx = startRowIdx + approvedCount - 1;
  const totalRowLineIdx = sheet1Data.length;

  sheet1Data.push([
    "TOTAL APPROVED VALUE",
    "",
    "",
    "",
    "",
    "",
    "SGD",
    totalAmount,
    "",
    "",
    "",
    "",
    ""
  ]);

  const worksheet1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Set number formats
  for (let r = startRowIdx; r <= endRowIdx; r++) {
    const cellRef = XLSX.utils.encode_cell({ r: r - 1, c: 7 });
    if (worksheet1[cellRef]) {
      worksheet1[cellRef].z = "#,##0.00";
    }
  }

  const totalCellRef = XLSX.utils.encode_cell({ r: totalRowLineIdx, c: 7 });
  if (worksheet1[totalCellRef]) {
    worksheet1[totalCellRef].z = "#,##0.00";
    if (approvedCount > 0) {
      worksheet1[totalCellRef].f = `SUM(H${startRowIdx}:H${endRowIdx})`;
    }
  }

  worksheet1["!cols"] = [
    { wch: 8 },  // No.
    { wch: 20 }, // Invoice Number
    { wch: 30 }, // Supplier Name
    { wch: 18 }, // PO Number
    { wch: 15 }, // Invoice Date
    { wch: 15 }, // Due Date
    { wch: 10 }, // Currency
    { wch: 18 }, // Invoice Amount
    { wch: 24 }, // Match Result
    { wch: 22 }, // Approval Status
    { wch: 20 }, // Approved By
    { wch: 20 }, // Approved Date
    { wch: 45 }  // Review Reason
  ];

  if (approvedCount > 0) {
    worksheet1["!autofilter"] = { ref: `A7:M${7 + approvedCount}` };
    worksheet1["!freeze"] = { xSplit: 0, ySplit: 7 };
  }

  // Sheet 2: AP Summary (Management Report Sheet)
  const sheet2Data: any[][] = [
    ["BOON HUAT HARDWARE & SUPPLIES PTE LTD"],
    ["APPROVED 3-WAY MATCH & DAILY APP 2 SUMMARY"],
    ["Report Date:", reportDateStr, "", "Generated At:", generatedAtStr],
    ["Prepared By:", "Madam Lim — Accounts Executive", "", "Approved Invoices:", approvedCount],
    ["Total Approved Amount:", formattedTotalStr, "", "Invoices On Hold:", onHoldList.length],
    ["Total Amount On Hold:", formattedOnHoldValStr, "", "Review Required:", reviewRequiredList.length],
    [],
    ["INFO NOTE:", "These invoices have completed App 2 three-way matching and human approval and may proceed to Payment Processing. Current review and hold information is provided below for follow-up."],
    [],
    ["APPROVED INVOICES"],
    [
      "Status",
      "Match Result",
      "Supplier Name",
      "Invoice Number",
      "Invoice Date",
      "Due Date",
      "PO Reference",
      "Currency",
      "Invoice Amount",
      "Approved By",
      "Approved Date",
      "Review / Approval Reason"
    ]
  ];

  approvedResults.forEach(r => {
    const isRevApp = r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW" || r.reviewResolution === "APPROVED_AFTER_REVIEW" || (r.humanReviewStatus as string) === "RESOLVED";
    const sourceInvoice = findSourceInvoice(r, importedInvoiceRecords);
    const rawInvoiceDate = sourceInvoice?.invoice_date || sourceInvoice?.invoiceDate || r.invoiceDate;
    const rawDueDate = sourceInvoice?.due_date || sourceInvoice?.dueDate || r.dueDate;

    sheet2Data.push([
      isRevApp ? "✓ Reviewed & Approved" : "✓ Approved",
      formatMatchStatusForDisplay(r.deterministicStatus || r.status),
      r.supplierName || "N/A",
      r.invoiceNumber || "N/A",
      formatDateDDMMYYYY(rawInvoiceDate),
      formatDateDDMMYYYY(rawDueDate),
      r.poNumber || "N/A",
      r.currency || "SGD",
      r.actualInvoiceAmount || 0,
      r.approvalConfirmedBy || "Madam Lim",
      formatDateTime(r.approvalConfirmedAt || r.reviewDate || now),
      r.reviewNotes || r.approvalJustification || (isRevApp ? "Approved after review" : "Confirmed clean match")
    ]);
  });

  const apSumTotalRowIdx = sheet2Data.length;
  sheet2Data.push([
    "TOTAL APPROVED AMOUNT",
    "",
    "",
    "",
    "",
    "",
    "",
    "SGD",
    totalAmount,
    "",
    "",
    ""
  ]);

  sheet2Data.push([]);
  sheet2Data.push([]);
  sheet2Data.push(["CURRENT REVIEW / HOLD REMINDERS"]);
  sheet2Data.push([
    "Status",
    "Supplier",
    "Invoice Number",
    "PO Reference",
    "Issue",
    "Invoice Amount",
    "Financial Impact",
    "Hold Reason",
    "Held Since",
    "Department"
  ]);

  if (onHoldList.length === 0 && reviewRequiredList.length === 0) {
    sheet2Data.push(["No pending holds or review required items at this time."]);
  } else {
    onHoldList.forEach(r => {
      sheet2Data.push([
        "⚠ On Hold",
        r.supplierName || "N/A",
        r.invoiceNumber || "N/A",
        r.poNumber || "N/A",
        formatMatchStatusForDisplay(r.deterministicStatus || r.status),
        r.actualInvoiceAmount || 0,
        r.potentialFinancialImpact || r.amountDifference || 0,
        r.holdReason || r.holdNote || "Pending delivery / clarification",
        formatDateTime(r.holdTimestamp || r.reviewDate || now),
        (r as any).department || "Warehouse"
      ]);
    });
    reviewRequiredList.forEach(r => {
      sheet2Data.push([
        "⚠ Review Required",
        r.supplierName || "N/A",
        r.invoiceNumber || "N/A",
        r.poNumber || "N/A",
        formatMatchStatusForDisplay(r.deterministicStatus || r.status),
        r.actualInvoiceAmount || 0,
        r.potentialFinancialImpact || r.amountDifference || 0,
        r.reviewNotes || "Requires supervisory review",
        formatDateTime(r.reviewDate || now),
        (r as any).department || "Accounts"
      ]);
    });
  }

  const worksheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  worksheet2["!cols"] = [
    { wch: 22 },
    { wch: 24 },
    { wch: 30 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 18 },
    { wch: 10 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 40 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet1, "Approved Payments");
  XLSX.utils.book_append_sheet(workbook, worksheet2, "AP Summary");

  const base64Excel = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
  const excelArrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const triggerDownload = () => {
    XLSX.writeFile(workbook, fileName);
  };

  return { 
    fileName, 
    base64Excel, 
    blob, 
    transferId, 
    triggerDownload, 
    rows: rowsData,
    approvedCount,
    totalAmount
  };
}

