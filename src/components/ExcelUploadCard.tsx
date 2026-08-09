import React, { useRef } from 'react';
import { FileUp, FileImage, Database, Trash2, RefreshCcw } from 'lucide-react';
import { cn } from '../lib/utils';

export function ExcelUploadCard({
  title,
  subtitle,
  uploadText,
  supportingText,
  buttonText,
  onExcelUpload,
  onPdfUpload,
  isLoading,
  onReset,
  step
}: {
  title: string;
  subtitle: string;
  uploadText: string;
  supportingText: string;
  buttonText?: string;
  onExcelUpload: (files: FileList | null) => void;
  onPdfUpload?: (files: FileList | null) => void;
  isLoading: boolean;
  onReset: () => void;
  step: 1 | 2 | 3;
}) {
  const excelRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 flex flex-col items-center justify-center gap-6">
      <div className="text-center space-y-2">
         <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900">{uploadText}</h3>
         <p className="text-sm font-medium text-slate-500 max-w-xl mx-auto">{supportingText}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
        <input 
          type="file" 
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" 
          className="hidden" 
          ref={excelRef} 
          onChange={(e) => onExcelUpload(e.target.files)} 
        />
        <button 
          onClick={() => excelRef.current?.click()}
          disabled={isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
        >
           {isLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
           {buttonText || (step === 3 ? "Browse App 1 Excel Workbook" : "Browse Excel Workbook")}
        </button>

        {step !== 3 && onPdfUpload && (
          <>
            <input 
              type="file" 
              multiple 
              accept=".pdf,.jpg,.jpeg,.png" 
              className="hidden" 
              ref={pdfRef} 
              onChange={(e) => onPdfUpload(e.target.files)} 
            />
            <button 
              onClick={() => pdfRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 border border-slate-200 text-slate-700 rounded-lg font-black uppercase text-xs tracking-widest hover:bg-slate-50 transition-colors"
            >
              <FileImage className="w-4 h-4" /> View Supporting {step === 1 ? "PO Documents" : "Handwritten GRNs"}
            </button>
          </>
        )}

        <button 
          onClick={onReset}
          className="flex items-center gap-2 px-6 py-3 border border-slate-200 text-rose-600 rounded-lg font-black uppercase text-xs tracking-widest hover:bg-rose-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Reset Step {step} Data
        </button>
      </div>
    </div>
  );
}
