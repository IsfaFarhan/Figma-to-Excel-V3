
import ExcelJS from 'exceljs';
import { UploadedScreen, ColumnHeader } from '../types';

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

const fileToPngDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available for image conversion.'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for conversion.'));
    };
    img.src = url;
  });

export const generateExcelFile = async (screens: UploadedScreen[], fileName: string) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Copywriting Extraction');

  // Define columns
  worksheet.columns = [
    { header: ColumnHeader.REMARK, key: 'remark', width: 50 }, // Col A
    { header: ColumnHeader.SCREEN, key: 'screen', width: 60 }, // Col B
    { header: ColumnHeader.EN_DC, key: 'en_dc', width: 40 },
    { header: ColumnHeader.BM_DC, key: 'bm_dc', width: 40 },
    { header: ColumnHeader.EN_PMM, key: 'en_pmm', width: 40 },
    { header: ColumnHeader.BM_PMM, key: 'bm_pmm', width: 40 },
    { header: ColumnHeader.EN_TM, key: 'en_tm', width: 40 },
    { header: ColumnHeader.BM_TM, key: 'bm_tm', width: 40 },
    { header: ColumnHeader.EN_OC, key: 'en_oc', width: 40 },
    { header: ColumnHeader.BM_OC, key: 'bm_oc', width: 40 },
    { header: ColumnHeader.EN_CXM, key: 'en_cxm', width: 40 },
    { header: ColumnHeader.BM_CXM, key: 'bm_cxm', width: 40 },
    { header: ColumnHeader.FINAL_EN, key: 'final_en', width: 40 },
    { header: ColumnHeader.FINAL_BM, key: 'final_bm', width: 40 },
  ];

  // Styling Header
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF144EB6' } // Matches brand blue #144eb6
  };
  worksheet.getRow(1).height = 40;
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // Add data rows
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    const rowNumber = i + 2;
    const row = worksheet.addRow({
      remark: screen.extractedData?.remark || '',
    });

    // Excel row height is in points (1 pt ≈ 1.33 px). Max row height is 409 pt.
    // We aim to fit the image resolution.
    const imgWidth = screen.width || 400;
    const imgHeight = screen.height || 400;

    // Convert pixels to points roughly (px * 0.75)
    let calculatedHeight = imgHeight * 0.75;
    
    // Excel has a limit of 409 points per row height
    if (calculatedHeight > 409) {
      calculatedHeight = 409;
    }
    
    row.height = Math.max(calculatedHeight, 60); // Minimum height for readability
    row.alignment = { vertical: 'top', wrapText: true };

    // Adjust column width for Column B (Screen) if image is very wide
    // Column width is roughly characters, 1 unit ≈ 7 pixels
    const requiredColWidth = (imgWidth / 7);
    if (requiredColWidth > worksheet.getColumn(2).width!) {
       worksheet.getColumn(2).width = Math.min(requiredColWidth, 100); // Cap column width at 100 for sanity
    }

    try {
      let dataUrl: string;
      let extension: 'png' | 'jpeg' = 'png';

      if (screen.file.type === 'image/png') {
        dataUrl = await readFileAsDataUrl(screen.file);
        extension = 'png';
      } else if (screen.file.type === 'image/jpeg' || screen.file.type === 'image/jpg') {
        dataUrl = await readFileAsDataUrl(screen.file);
        extension = 'jpeg';
      } else {
        // Convert unsupported formats (e.g., webp) to PNG for ExcelJS compatibility.
        dataUrl = await fileToPngDataUrl(screen.file);
        extension = 'png';
      }

      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) {
        throw new Error('Invalid image data URL.');
      }

      const imageId = workbook.addImage({
        base64: base64Data,
        extension,
      });

      // Calculate the extension to preserve resolution as much as possible
      // If we hit the 409pt row limit, we scale the image to fit the row height while preserving aspect ratio
      let finalWidth = imgWidth;
      let finalHeight = imgHeight;

      if (imgHeight * 0.75 > 409) {
          const ratio = 409 / (imgHeight * 0.75);
          finalHeight = imgHeight * ratio;
          finalWidth = imgWidth * ratio;
      }

      // Fix: Removed offsetx and offsety as they are not valid properties for this object type
      worksheet.addImage(imageId, {
        tl: { col: 1, row: rowNumber - 1 },
        ext: { width: finalWidth, height: finalHeight },
        editAs: 'oneCell'
      });
    } catch (err) {
      console.error("Error adding image to excel", err);
    }
  }

  // Export
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName || 'copywriting_extraction'}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};
