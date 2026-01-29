
export interface ExtractedCopy {
  remark: string;
}

export interface UploadedScreen {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorStage?: 'ocr' | 'ai';
  extractedData?: ExtractedCopy;
  width?: number;
  height?: number;
}

export enum ColumnHeader {
  REMARK = "Remark",
  SCREEN = "Screen",
  EN_DC = "EN copywriting (DC)",
  BM_DC = "BM copywriting (DC)",
  EN_PMM = "EN copywriting (PMM)",
  BM_PMM = "BM copywriting (PMM)",
  EN_TM = "EN copywriting (TM)",
  BM_TM = "BM copywriting (TM)",
  EN_OC = "EN copywriting (OC)",
  BM_OC = "BM copywriting (OC)",
  EN_CXM = "EN copywriting (CXM)",
  BM_CXM = "BM copywriting (CXM)",
  FINAL_EN = "Finalise copywriting (EN)",
  FINAL_BM = "Finalise copywriting (BM)"
}
