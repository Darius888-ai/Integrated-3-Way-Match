import * as XLSX from "xlsx";
import { POData, GRNData, ExtractionStatus, ReviewStatus, FieldStatus } from "../types";
import {
  readWorkbook,
  findWorksheet,
  detectHeaderRow,
  normaliseHeader,
  parseExcelDate,
  parseNumber,
  isBlankRow,
} from "../services/excelImportService";

export interface ExcelImportResult<T> {
  valid: T[];
  review: T[];
  rejected: any[];
  sheetName: string;
  rowCount: number;
}

export interface ExcelHeaderMap {
  [key: string]: string[];
}

const PO_HEADER_MAP: ExcelHeaderMap = {
  poNumber: ["PO Number", "PO No", "Purchase Order Number"],
  poDate: ["PO Date", "Purchase Order Date"],
  supplierName: ["Supplier Name", "Supplier"],
  itemDescription: ["Item Description", "Description", "Item"],
  quantityOrdered: ["Qty Ordered", "Quantity Ordered", "Quantity"],
  unitPrice: ["Unit Price ($)", "Unit Price", "Price"],
  totalAmount: ["Total Amount ($)", "Total Amount", "Total"],
  expectedDeliveryDate: ["Expected Delivery", "Expected Delivery Date", "Delivery Date"],
};

const GRN_HEADER_MAP: ExcelHeaderMap = {
  grnNumber: ["GRN Number", "GRN No", "Goods Received Note Number"],
  grnDate: ["GRN Date", "Goods Received Date"],
  poReference: ["PO Number", "PO Reference", "Related PO"],
  supplierName: ["Supplier Name", "Supplier"],
  itemDescription: ["Item Description", "Description", "Item"],
  quantityOrdered: ["Qty Ordered", "Quantity Ordered"],
  quantityReceived: ["Qty Received", "Quantity Received", "Received Quantity"],
  condition: ["Condition", "Item Condition"],
  receivedBy: ["Received By", "Receiver"],
};

function mapRowToFields(row: any[], headerRow: string[], headerMap: ExcelHeaderMap): any {
  const result: any = {};
  for (const [field, variations] of Object.entries(headerMap)) {
    const normalizedVariations = variations.map(v => normaliseHeader(v));
    const columnIndex = headerRow.findIndex(h => h && normalizedVariations.includes(normaliseHeader(h)));
    if (columnIndex !== -1) {
      result[field] = row[columnIndex];
    } else {
      result[field] = null;
    }
  }
  return result;
}

export async function parsePOExcel(file: File): Promise<ExcelImportResult<POData>> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = readWorkbook(file, arrayBuffer);

  const targetSheetNames = ["Purchase Orders (POs)", "Purchase Orders", "Purchase Order", "POs", "PO"];
  const worksheet = findWorksheet(workbook, targetSheetNames);
  if (!worksheet) {
    throw new Error("The Purchase Orders worksheet could not be found in this workbook.");
  }

  const sheetName = workbook.SheetNames.find(sn => worksheet === workbook.Sheets[sn]) || "PO";

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  if (jsonData.length === 0) {
    throw new Error("The selected worksheet does not contain any records.");
  }

  const requiredHeaders = ["PO Number", "Supplier", "Item"];
  const headerIndex = detectHeaderRow(jsonData, requiredHeaders);
  if (headerIndex === -1) {
    throw new Error("The selected worksheet is missing one or more required columns.");
  }
  const headerRow = jsonData[headerIndex];
  const dataRows = jsonData.slice(headerIndex + 1);

  const valid: POData[] = [];
  const review: POData[] = [];
  const rejected: any[] = [];

  dataRows.forEach((row, idx) => {
    if (isBlankRow(row)) return;

    const fields = mapRowToFields(row, headerRow, PO_HEADER_MAP);
    const rowNum = headerIndex + idx + 2;

    const poNumber = String(fields.poNumber || "").trim();
    if (!poNumber) {
      rejected.push({ row: rowNum, reason: "Missing PO Number", data: row });
      return;
    }

    const validationReasons: string[] = [];
    const poDate = parseExcelDate(fields.poDate);
    if (!poDate && fields.poDate) {
      validationReasons.push("PO Date could not be interpreted.");
    }

    const expectedDeliveryDate = parseExcelDate(fields.expectedDeliveryDate);
    if (!expectedDeliveryDate && fields.expectedDeliveryDate) {
      validationReasons.push("Expected Delivery Date could not be interpreted.");
    }

    const quantityOrdered = parseNumber(fields.quantityOrdered);
    const unitPrice = parseNumber(fields.unitPrice);
    const totalAmount = parseNumber(fields.totalAmount);

    const record: POData = {
      poRecordId: crypto.randomUUID(),
      sourceRecordKey: `excel:${sheetName}:${rowNum}`,
      poNumber: poNumber,
      poDate: poDate || (fields.poDate ? String(fields.poDate) : null),
      supplierName: fields.supplierName ? String(fields.supplierName) : null,
      itemDescription: fields.itemDescription ? String(fields.itemDescription) : null,
      quantityOrdered: quantityOrdered,
      unitPrice: unitPrice,
      totalAmount: totalAmount,
      expectedDeliveryDate: expectedDeliveryDate || (fields.expectedDeliveryDate ? String(fields.expectedDeliveryDate) : null),
      currency: "SGD",
      sourceFileName: file.name,
      sourceSheet: sheetName,
      sourceRowNumber: rowNum,
      importedAt: new Date().toISOString(),
      sourcePageNumber: 0,
      sourceFileHash: "EXCEL_IMPORT",
      extractionConfidence: 1,
      fieldConfidence: {},
      extractionStatus: ExtractionStatus.COMPLETED,
      validationIssues: validationReasons,
      supplierAddress: null,
      unitOfMeasure: null,
      deliveryAddress: null,
      paymentTerms: null,
      authorisedBy: null,
    };

    // Validation Rules
    if (!record.poDate || !record.supplierName || !record.itemDescription || record.quantityOrdered === null || record.unitPrice === null || record.totalAmount === null) {
      record.validationStatus = "REVIEW_REQUIRED";
      if (!record.poDate) validationReasons.push("PO Date is missing.");
      if (!record.supplierName) validationReasons.push("Supplier Name is missing.");
      if (!record.itemDescription) validationReasons.push("Item Description is missing.");
      if (record.quantityOrdered === null) validationReasons.push("Quantity Ordered is missing.");
      if (record.unitPrice === null) validationReasons.push("Unit Price is missing.");
      if (record.totalAmount === null) validationReasons.push("Total Amount is missing.");
      review.push(record);
    } else {
      record.validationStatus = validationReasons.length > 0 ? "REVIEW_REQUIRED" : "VALID";
      if (record.validationStatus === "VALID") {
        valid.push(record);
      } else {
        review.push(record);
      }
    }
  });

  return {
    valid,
    review,
    rejected,
    sheetName,
    rowCount: dataRows.length
  };
}

export async function parseGRNExcel(file: File): Promise<ExcelImportResult<GRNData>> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = readWorkbook(file, arrayBuffer);

  const targetSheetNames = ["Goods Received Notes (GRNs)", "Goods Received Notes", "Goods Received Note", "GRNs", "GRN"];
  const worksheet = findWorksheet(workbook, targetSheetNames);
  if (!worksheet) {
    throw new Error("The Goods Received Notes worksheet could not be found in this workbook.");
  }

  const sheetName = workbook.SheetNames.find(sn => worksheet === workbook.Sheets[sn]) || "GRN";

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  if (jsonData.length === 0) {
    throw new Error("The selected worksheet does not contain any records.");
  }

  const requiredHeaders = ["GRN Number", "PO Number", "Supplier"];
  const headerIndex = detectHeaderRow(jsonData, requiredHeaders);
  if (headerIndex === -1) {
    throw new Error("The selected worksheet is missing one or more required columns.");
  }
  const headerRow = jsonData[headerIndex];
  const dataRows = jsonData.slice(headerIndex + 1);

  const valid: GRNData[] = [];
  const review: GRNData[] = [];
  const rejected: any[] = [];

  dataRows.forEach((row, idx) => {
    if (isBlankRow(row)) return;

    const fields = mapRowToFields(row, headerRow, GRN_HEADER_MAP);
    const rowNum = headerIndex + idx + 2;

    const grnNumber = String(fields.grnNumber || "").trim();
    if (!grnNumber) {
      rejected.push({ row: rowNum, reason: "Missing GRN Number", data: row });
      return;
    }

    const validationReasons: string[] = [];
    const grnDate = parseExcelDate(fields.grnDate);
    if (!grnDate && fields.grnDate) {
      validationReasons.push("GRN Date could not be interpreted.");
    }

    const quantityOrdered = parseNumber(fields.quantityOrdered);
    const quantityReceived = parseNumber(fields.quantityReceived);

    const record: GRNData = {
      grnRecordId: crypto.randomUUID(),
      sourceRecordKey: `excel:${sheetName}:${rowNum}`,
      grnNumber: grnNumber,
      grnDate: grnDate || (fields.grnDate ? String(fields.grnDate) : null),
      poNumber: fields.poReference ? String(fields.poReference) : null,
      supplierName: fields.supplierName ? String(fields.supplierName) : null,
      itemDescription: fields.itemDescription ? String(fields.itemDescription) : null,
      quantityOrdered: quantityOrdered,
      quantityReceived: quantityReceived,
      condition: fields.condition ? String(fields.condition) : null,
      receivedBy: fields.receivedBy ? String(fields.receivedBy) : null,
      sourceFileName: file.name,
      sourceSheet: sheetName,
      sourceRowNumber: rowNum,
      importedAt: new Date().toISOString(),
      sourcePageNumber: 0,
      sourceFileHash: "EXCEL_IMPORT",
      extractionConfidence: 1,
      fieldConfidence: {},
      extractionStatus: ExtractionStatus.COMPLETED,
      reviewStatus: ReviewStatus.READY,
      reviewReasons: [],
      validationIssues: validationReasons,
      damagedQuantity: null,
      rejectedQuantity: null,
      acceptedQuantity: quantityReceived,
      quantityDifference: (quantityOrdered !== null && quantityReceived !== null) ? quantityOrdered - quantityReceived : null,
      unitOfMeasure: null,
      warehouseNotes: null,
      signatureDetected: true,
      signatureReviewStatus: FieldStatus.CLEAR,
      quantityOrderedStatus: FieldStatus.CLEAR,
      quantityReceivedStatus: FieldStatus.CLEAR,
      humanCorrectedFields: [],
      reviewedBy: null,
      reviewedAt: null,
    };

    // Validation Rules
    if (!record.grnDate || !record.poNumber || !record.supplierName || !record.itemDescription || record.quantityOrdered === null || record.quantityReceived === null || !record.condition) {
      record.validationStatus = "REVIEW_REQUIRED";
      if (!record.grnDate) validationReasons.push("GRN Date is missing.");
      if (!record.poNumber) validationReasons.push("PO Number is missing.");
      if (!record.supplierName) validationReasons.push("Supplier Name is missing.");
      if (!record.itemDescription) validationReasons.push("Item Description is missing.");
      if (record.quantityOrdered === null) validationReasons.push("Quantity Ordered is missing.");
      if (record.quantityReceived === null) validationReasons.push("Quantity Received is missing.");
      if (!record.condition) validationReasons.push("Condition is missing.");
      review.push(record);
    } else {
      record.validationStatus = validationReasons.length > 0 ? "REVIEW_REQUIRED" : "VALID";
      if (record.validationStatus === "VALID") {
        valid.push(record);
      } else {
        review.push(record);
      }
    }
  });

  return {
    valid,
    review,
    rejected,
    sheetName,
    rowCount: dataRows.length
  };
}
