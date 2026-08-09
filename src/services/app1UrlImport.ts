export interface App1TransferLineItem {
  lineNumber: number;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  lineAmount: number;
}

export interface App1TransferInvoice {
  app1RecordId?: string;
  app1Status?: string;

  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  poReference: string;

  currency?: string;

  lineItems: App1TransferLineItem[];

  calculatedSubtotal?: number | null;
  taxAmount?: number | null;
  totalAmount: number;

  sourceFileName?: string;
  approvedBy?: string;
  approvedAt?: string;
  reviewNotes?: string;
}

export interface App1Envelope {
  type: "BOON_HUAT_APP1_APPROVED_INVOICES";
  version: 1;
  sourceApp: "APP1";
  destinationApp: "APP2";

  transferId: string;
  sentAt: string;
  approvedInvoiceCount: number;

  invoices: App1TransferInvoice[];
}

export const parseApp1UrlPayload = (searchParams: string): App1Envelope | null => {
  const params = new URLSearchParams(searchParams);
  const data = params.get("invoiceData");
  if (!data) return null;

  try {
    // URL-safe Base64 -> Base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const payload = JSON.parse(jsonStr) as App1Envelope;

    // Validation
    if (
        payload.type === "BOON_HUAT_APP1_APPROVED_INVOICES" &&
        payload.version === 1 &&
        payload.sourceApp === "APP1" &&
        payload.destinationApp === "APP2" &&
        Array.isArray(payload.invoices) &&
        payload.approvedInvoiceCount === payload.invoices.length
    ) {
        return payload;
    }
    return null;
  } catch (e) {
    console.error("Failed to parse app1 payload", e);
    return null;
  }
};

export const clearApp1TransferParams = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("invoiceData");
    window.history.replaceState({}, "", url.toString());
};
