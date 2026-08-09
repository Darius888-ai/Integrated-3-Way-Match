import React, { useState } from "react";
import { MatchResult } from "../types";
import { 
  PAYMENT_PROCESSING_EMAIL, 
  PAYMENT_EMAIL_ENDPOINT, 
  generateApprovedPaymentsExcel 
} from "../services/emailPaymentService";
import { 
  X, 
  Mail, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Loader2, 
  Send,
  FileSpreadsheet,
  ShieldCheck,
  Lock
} from "lucide-react";

interface EmailPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  approvedResults: MatchResult[];
  matchResults?: MatchResult[];
  approvalByResultKey?: Record<string, any>;
  getResultKey?: (r: any) => string;
  onSuccessEmailed: (emailedRecordIds: string[], transferId: string) => void;
  addAuditEntry?: (entry: any) => void;
  paymentEmailHistory?: Array<{
    transferId: string;
    sentAt: string;
    sentBy: string;
    recipient: string;
    approvedCount: number;
    totalApprovedAmount: number;
    invoiceNumbers: string[];
    action: string;
  }>;
  onRecordEmailHistory?: (entry: any) => void;
  invoiceRecords?: any[];
}

export function EmailPaymentModal({
  isOpen,
  onClose,
  approvedResults,
  matchResults,
  onSuccessEmailed,
  addAuditEntry,
  paymentEmailHistory,
  onRecordEmailHistory,
  invoiceRecords
}: EmailPaymentModalProps) {
  const [modalState, setModalState] = useState<"RESEND_NOTICE" | "PASSCODE_PROMPT" | "IDLE" | "GENERATING_EXCEL" | "SENDING_EMAIL" | "SUCCESS" | "FAILED" | "NOT_CONFIGURED">("IDLE");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [activeTransferId, setActiveTransferId] = useState<string>("");
  const [generatedExcel, setGeneratedExcel] = useState<{
    fileName: string;
    triggerDownload: () => void;
  } | null>(null);

  // Passcode state
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setPasscode("");
      setPasscodeError(null);
      if (paymentEmailHistory && paymentEmailHistory.length > 0) {
        setModalState("RESEND_NOTICE");
      } else {
        setModalState("PASSCODE_PROMPT");
      }
      setErrorMessage("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalAmount = approvedResults.reduce((sum, r) => sum + (r.actualInvoiceAmount || 0), 0);
  const formattedTotal = totalAmount.toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const handleVerifyPasscodeAndProceed = () => {
    if (passcode.trim() !== "1111") {
      setPasscodeError("INCORRECT PASSCODE. The App 2 report was not sent.");
      setPasscode("");
      return;
    }
    setPasscodeError(null);
    setPasscode("");

    if (addAuditEntry) {
      addAuditEntry({
        step_number: 4,
        action_type: "APP2_REPORT_EMAIL_AUTHORIZED",
        decision: "SUCCESS",
        decision_reason: "Madam Lim successfully authorized email report dispatch with 4-digit passcode."
      });
    }

    setModalState("IDLE");
  };

  const handleStartEmailFlow = async () => {
    const transferId = `TRF-PAY-${Date.now()}`;
    setActiveTransferId(transferId);
    setModalState("GENERATING_EXCEL");
    setErrorMessage("");

    try {
      // 1. Generate Excel
      const excelData = generateApprovedPaymentsExcel(approvedResults, matchResults || approvedResults, transferId, invoiceRecords || []);
      setGeneratedExcel({
        fileName: excelData.fileName,
        triggerDownload: excelData.triggerDownload
      });

      // Audit export created
      if (addAuditEntry) {
        addAuditEntry({
          step_number: 4,
          action_type: "PAYMENT_EXPORT_CREATED",
          source_filename: excelData.fileName,
          metadata: {
            transferId,
            approvedCount: approvedResults.length,
            totalAmount
          }
        });
      }

      // 2. Send Email
      setModalState("SENDING_EMAIL");

      const invoiceNumbers = approvedResults.map(r => r.invoiceNumber);
      const matchArr = matchResults || approvedResults;
      const todayStr = new Date().toISOString().split('T')[0];

      const approvedTodayList = approvedResults.filter(r => {
        const d = r.approvalConfirmedAt || r.reviewDate || r.approvedAt;
        if (!d) return true;
        return new Date(d).toISOString().split('T')[0] === todayStr;
      });
      const approvedTodayAmount = approvedTodayList.reduce((s, r) => s + (r.actualInvoiceAmount || 0), 0);

      const onHoldList = matchArr.filter(r => String(r.humanReviewStatus || "").toUpperCase() === "ON_HOLD");
      const onHoldInvoiceAmount = onHoldList.reduce((s, r) => s + (r.actualInvoiceAmount || 0), 0);
      const onHoldFinancialImpact = onHoldList.reduce((s, r) => s + (r.potentialFinancialImpact || r.amountDifference || 0), 0);

      const reviewRequiredList = matchArr.filter(r => {
        const st = String(r.deterministicStatus || r.status || "").toUpperCase();
        const hr = String(r.humanReviewStatus || "").toUpperCase();
        return (st.includes("REVIEW") || st.includes("MISMATCH") || st.includes("ISSUE") || st.includes("DUPLICATE") || st.includes("NO_PO") || st.includes("NO_GRN")) && hr !== "ON_HOLD" && hr !== "RESOLVED";
      });

      const now = new Date();
      const reportDateStr = String(now.getDate()).padStart(2, "0") + "/" + 
                            String(now.getMonth() + 1).padStart(2, "0") + "/" + 
                            String(now.getFullYear()).slice(-2);
      const generatedAtStr = reportDateStr + " " + 
                             String(now.getHours()).padStart(2, "0") + ":" + 
                             String(now.getMinutes()).padStart(2, "0");
      const emailSubject = `[Boon Huat AP] 3-Way Match Results & App 2 Action Report — ${reportDateStr}`;

      const payload = {
        action: "SEND_APP2_APPROVED_PAYMENTS",
        recipient: PAYMENT_PROCESSING_EMAIL,
        subject: emailSubject,
        reportDate: reportDateStr,
        generatedAt: generatedAtStr,
        transferId,
        approvedCount: approvedResults.length,
        currency: "SGD",
        totalAmount,
        fileName: excelData.fileName,
        fileBase64: excelData.base64Excel,
        sentBy: "Madam Lim",
        sentAt: new Date().toISOString(),
        approvedInvoices: approvedResults.map(r => ({
          invoiceNumber: r.invoiceNumber,
          supplierName: r.supplierName,
          poReference: r.poNumber || "N/A",
          totalAmount: r.actualInvoiceAmount || 0,
          approvalStatus: (r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW" || r.reviewResolution === "APPROVED_AFTER_REVIEW") ? "Reviewed & Approved" : "Approval Confirmed"
        })),
        onHoldCount: onHoldList.length,
        onHoldInvoiceAmount,
        onHoldFinancialImpact,
        onHoldInvoices: onHoldList.map(r => ({
          invoiceNumber: r.invoiceNumber,
          supplierName: r.supplierName,
          poReference: r.poNumber || "N/A",
          totalAmount: r.actualInvoiceAmount || 0,
          holdReason: r.holdReason || r.holdNote || "Pending delivery / clarification"
        })),
        reviewRequiredCount: reviewRequiredList.length,
        reviewRequiredInvoices: reviewRequiredList.map(r => ({
          invoiceNumber: r.invoiceNumber,
          supplierName: r.supplierName,
          poReference: r.poNumber || "N/A",
          totalAmount: r.actualInvoiceAmount || 0,
          deterministicStatus: r.deterministicStatus || r.status || "REVIEW REQUIRED"
        }))
      };

      if (onRecordEmailHistory) {
        onRecordEmailHistory({
          transferId,
          reportDate: reportDateStr,
          sentAt: new Date().toISOString(),
          sentBy: "Madam Lim",
          recipient: PAYMENT_PROCESSING_EMAIL,
          approvedCount: approvedResults.length,
          totalApprovedAmount: totalAmount,
          invoiceNumbers,
          action: paymentEmailHistory && paymentEmailHistory.length > 0 ? "RESEND" : "INITIAL_SEND"
        });
      }

      await fetch(PAYMENT_EMAIL_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload)
      });

      setModalState("SUCCESS");

      if (addAuditEntry) {
        const actionType = paymentEmailHistory && paymentEmailHistory.length > 0 ? "APP2_REPORT_EMAIL_RESEND_REQUESTED" : "APP2_REPORT_EMAIL_REQUESTED";
        addAuditEntry({
          step_number: 4,
          action_type: actionType,
          metadata: {
            recipient: PAYMENT_PROCESSING_EMAIL,
            transferId,
            reportDate: reportDateStr,
            approvedCount: approvedResults.length,
            reviewRequiredCount: reviewRequiredList.length,
            onHoldCount: onHoldList.length,
            totalAmount,
            requestedBy: "Madam Lim",
            requestedAt: new Date().toISOString()
          }
        });
      }

      const recordIds = approvedResults.map(r => r.matchRecordId || r.invoiceNumber);
      onSuccessEmailed(recordIds, transferId);

    } catch (err: any) {
      console.error("[PAYMENT EMAIL] request failed", err);
      setErrorMessage(err.message || "Unable to submit email request.");
      setModalState("FAILED");

      if (addAuditEntry) {
        addAuditEntry({
          step_number: 4,
          action_type: "PAYMENT_EMAIL_FAILED",
          metadata: {
            recipient: PAYMENT_PROCESSING_EMAIL,
            transferId,
            invoiceCount: approvedResults.length,
            error: err.message || "Email failed",
            sentBy: "Madam Lim",
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-800/80 rounded-xl border border-purple-700/50">
              <Mail className="w-6 h-6 text-purple-200" />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Email 3-Way Match & App 2 Report</h3>
              <p className="text-xs text-purple-200 font-medium">Boon Huat Accounts Payable – Madam Lim Authorization</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={modalState === "GENERATING_EXCEL" || modalState === "SENDING_EMAIL"}
            className="p-2 text-purple-200 hover:text-white rounded-lg hover:bg-purple-800/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* PASSCODE_PROMPT state */}
          {modalState === "PASSCODE_PROMPT" && (
            <div className="py-6 space-y-5 max-w-md mx-auto text-center">
              <div className="w-14 h-14 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto border border-purple-200 shadow-sm">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">AUTHORIZATION REQUIRED</h4>
                <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                  Enter Madam Lim's 4-digit authorization passcode to dispatch the App 2 3-Way Match report and Excel attachment.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                  4-Digit Authorization Passcode
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="••••"
                  className="w-48 mx-auto px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-xl font-black tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {passcodeError && (
                  <p className="text-xs font-bold text-rose-600 mt-1">{passcodeError}</p>
                )}
              </div>
            </div>
          )}

          {/* RESEND_NOTICE state */}
          {modalState === "RESEND_NOTICE" && (
            <div className="py-6 space-y-5 max-w-md mx-auto text-center">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2 text-left">
                <div className="flex items-center gap-2 text-purple-900 font-black text-sm uppercase">
                  <Mail className="w-5 h-5 text-purple-700" />
                  RESEND DAILY APP 2 REPORT?
                </div>
                <p className="text-xs font-semibold text-purple-800 leading-relaxed">
                  “This report has already been emailed previously. A new report will be generated using the latest App 2 information.”
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Enter Passcode to Authorize Resend
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="••••"
                  className="w-48 mx-auto px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-xl font-black tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {passcodeError && (
                  <p className="text-xs font-bold text-rose-600 mt-1">{passcodeError}</p>
                )}
              </div>
            </div>
          )}

          {/* IDLE state */}
          {modalState === "IDLE" && (
            <>
              {/* Target & Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-700">Recipient Email</span>
                  <p className="text-xs font-extrabold text-purple-950 truncate" title={PAYMENT_PROCESSING_EMAIL}>
                    {PAYMENT_PROCESSING_EMAIL}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Approved Invoices</span>
                  <p className="text-lg font-black text-slate-900">{approvedResults.length}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Total Payment Value</span>
                  <p className="text-lg font-black text-emerald-900">SGD {formattedTotal}</p>
                </div>
              </div>

              {/* Invoice List Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Eligible Invoices for Dispatch ({approvedResults.length})
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">Verified by Madam Lim</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Invoice Number</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">PO Reference</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-center">Approval Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {approvedResults.map((r) => {
                        const isApprovedAfterReview = 
                          r.approvalRecommendationStatus === "CONFIRMED_AFTER_REVIEW" || 
                          r.reviewResolution === "APPROVED_AFTER_REVIEW" ||
                          (r.humanReviewStatus as string) === "RESOLVED";

                        return (
                          <tr key={r.matchRecordId || r.invoiceNumber} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-black text-slate-900">{r.invoiceNumber}</td>
                            <td className="px-4 py-3 font-semibold text-slate-700">{r.supplierName}</td>
                            <td className="px-4 py-3 font-bold text-indigo-600">{r.poNumber || "N/A"}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                              SGD {(r.actualInvoiceAmount || 0).toLocaleString("en-SG", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isApprovedAfterReview ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> APPROVED AFTER REVIEW
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-300">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> APPROVAL CONFIRMED
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* GENERATING_EXCEL / SENDING_EMAIL state */}
          {(modalState === "GENERATING_EXCEL" || modalState === "SENDING_EMAIL") && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
              <div className="space-y-1">
                <h4 className="text-lg font-black uppercase tracking-tight text-slate-900">
                  {modalState === "GENERATING_EXCEL" ? "GENERATING EXCEL…" : "SENDING EMAIL…"}
                </h4>
                <p className="text-xs font-semibold text-slate-500">
                  {modalState === "GENERATING_EXCEL" 
                    ? "Building Boon_Huat_App2_Approved_Payments workbook..." 
                    : `Dispatching payment approval data to ${PAYMENT_PROCESSING_EMAIL}...`}
                </p>
              </div>
            </div>
          )}

          {/* SUCCESS state */}
          {modalState === "SUCCESS" && (
            <div className="py-8 flex flex-col items-center text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-300 shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-black uppercase tracking-tight text-emerald-950">EMAIL REQUEST SUBMITTED</h4>
                <p className="text-xs font-semibold text-slate-600 max-w-md leading-relaxed">
                  “The approved payment workbook and 3-way match action report have been submitted to Gmail.”
                </p>
              </div>

              <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Recipient:</span>
                  <span className="font-black text-slate-900">{PAYMENT_PROCESSING_EMAIL}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Approved Invoices:</span>
                  <span className="font-black text-slate-900">{approvedResults.length}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold">Total Payment Amount:</span>
                  <span className="font-black text-emerald-700">SGD {formattedTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">Transfer ID:</span>
                  <span className="font-mono font-bold text-indigo-600">{activeTransferId}</span>
                </div>
              </div>
            </div>
          )}

          {/* FAILED state */}
          {modalState === "FAILED" && (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl space-y-4 text-rose-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-base font-black uppercase tracking-wide text-rose-900">EMAIL REQUEST FAILED</h4>
                  <p className="text-xs font-semibold text-rose-800 leading-relaxed">
                    {errorMessage || "Unable to submit email request."}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 p-4 px-6 border-t border-slate-200 flex flex-wrap justify-end gap-3">
          {modalState === "PASSCODE_PROMPT" && (
            <>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPasscodeAndProceed}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95"
              >
                <Lock className="w-4 h-4" />
                Authorize & Send Report
              </button>
            </>
          )}

          {modalState === "RESEND_NOTICE" && (
            <>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPasscodeAndProceed}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
                Authorize & Resend Email
              </button>
            </>
          )}

          {modalState === "IDLE" && (
            <>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleStartEmailFlow}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
                Generate Excel & Send Email
              </button>
            </>
          )}

          {modalState === "SUCCESS" && (
            <>
              <button
                onClick={() => setModalState("PASSCODE_PROMPT")}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
              >
                <Send className="w-4 h-4" />
                Send Again
              </button>
              {generatedExcel?.triggerDownload && (
                <button
                  onClick={() => generatedExcel.triggerDownload()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Excel
                </button>
              )}
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all"
              >
                Close
              </button>
            </>
          )}

          {modalState === "FAILED" && (
            <>
              <button
                onClick={handleStartEmailFlow}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all"
              >
                <Send className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase hover:bg-slate-300 transition-all"
              >
                Close
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
