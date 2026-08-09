import * as XLSX from "xlsx";

export function readWorkbook(file: File, arrayBuffer: ArrayBuffer) {
  try {
    return XLSX.read(arrayBuffer, {
      type: "array",
      cellDates: true,
      raw: false,
    });
  } catch (err) {
    throw new Error("The Excel workbook could not be read.");
  }
}

export function findWorksheet(workbook: XLSX.WorkBook, possibleNames: string[]): XLSX.WorkSheet | null {
  for (const name of possibleNames) {
    const exactMatch = workbook.SheetNames.find(sn => sn === name);
    if (exactMatch) {
      return workbook.Sheets[exactMatch];
    }
  }
  for (const name of possibleNames) {
    const match = workbook.SheetNames.find(sn => sn.toLowerCase() === name.toLowerCase());
    if (match) {
      return workbook.Sheets[match];
    }
  }
  return null;
}

export function detectHeaderRow(jsonData: any[][], requiredHeaders: string[]): number {
  for (let i = 0; i < Math.min(jsonData.length, 50); i++) {
    const row = jsonData[i];
    if (!row) continue;
    const normalisedRow = row.map(val => normaliseHeader(val));
    const hasRequired = requiredHeaders.every(req => 
      normalisedRow.some(h => h && h.includes(normaliseHeader(req)))
    );
    if (hasRequired) {
      return i;
    }
  }
  return -1;
}

export function normaliseHeader(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'number') {
    // Excel serial date
    const date = new Date(Date.UTC(1899, 11, 30) + (value - 1) * 86400000);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
       return parsed.toISOString().split('T')[0];
    }
  }
  return null;
}

export function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === 'number') return value;
  const str = String(value).replace(/[$£€\s,]/g, "");
  const num = Number(str);
  return isNaN(num) ? null : num;
}

export function isBlankRow(row: any[]): boolean {
  return !row || row.every(cell => cell === null || cell === undefined || cell === "");
}

export function worksheetToObjects(worksheet: XLSX.WorkSheet, headerRowIndex: number): any[] {
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  if (jsonData.length <= headerRowIndex + 1) return [];
  const headerRow = jsonData[headerRowIndex].map(normaliseHeader);
  const dataRows = jsonData.slice(headerRowIndex + 1);
  const results = [];
  for (const row of dataRows) {
    if (isBlankRow(row)) continue;
    const obj: any = {};
    for (let i = 0; i < headerRow.length; i++) {
      if (headerRow[i]) {
        obj[headerRow[i]] = row[i] !== undefined ? row[i] : null;
      }
    }
    results.push(obj);
  }
  return results;
}
