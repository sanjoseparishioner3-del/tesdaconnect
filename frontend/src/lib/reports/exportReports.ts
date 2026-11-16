import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ReportMetadata {
  reportTitle: string;
  institutionLabel: string;
  generatedBy: string;
  isOfflineSnapshot: boolean;
  lastSyncedAt: string | null;
}

export interface TraineeSummaryRow {
  referenceNo: string;
  scholarId: string | null;
  uliNumber: string | null;
  fullName: string;
  courseName: string;
  status: string;
  completeness: number;
  missingRequirements: string;
}

function triggerBrowserDownload(bytes: Uint8Array | ArrayBuffer, filename: string, mimeType: string): void {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobPart = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function buildTraineeReportWorkbook(
  rows: TraineeSummaryRow[],
  meta: ReportMetadata,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TCTESDAConnect';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Trainee Summary');
  sheet.addRow([meta.reportTitle]);
  sheet.addRow([`Institution: ${meta.institutionLabel}`, `Prepared by: ${meta.generatedBy}`]);

  if (meta.isOfflineSnapshot) {
    sheet.addRow([
      `WARNING: GENERATED FROM OFFLINE/CACHED DATA (Last Sync: ${meta.lastSyncedAt ?? 'Unknown'}). Verify online before official submission.`,
    ]);
  } else {
    sheet.addRow([`Verified online query snapshot (${new Date().toISOString()})`]);
  }

  sheet.addRow([]);
  const headerRow = sheet.addRow([
    'Reference No',
    'Scholar ID',
    'ULI Number',
    'Trainee Name',
    'Program / Course',
    'Status',
    'Completeness %',
    'Missing Fields / Docs',
  ]);
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow([
      row.referenceNo,
      row.scholarId ?? 'Unassigned',
      row.uliNumber ?? 'Pending ULI',
      row.fullName,
      row.courseName,
      row.status,
      `${row.completeness}%`,
      row.missingRequirements || 'None',
    ]);
  }

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function exportTraineeReportExcel(rows: TraineeSummaryRow[], meta: ReportMetadata): Promise<void> {
  const bytes = await buildTraineeReportWorkbook(rows, meta);
  triggerBrowserDownload(
    bytes,
    `tctesda-report-${Date.now()}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

export async function buildTraineeReportPdf(
  rows: TraineeSummaryRow[],
  meta: ReportMetadata,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 792;
  const pageHeight = 612;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 48;

  const drawHeader = () => {
    page.drawText('TCTESDAConnect — Institutional Training Operations Summary', {
      x: 40,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0.06, 0.16, 0.36),
    });
    y -= 18;
    page.drawText(`${meta.reportTitle} · ${meta.institutionLabel}`, {
      x: 40,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.25, 0.32, 0.42),
    });
    y -= 16;

    if (meta.isOfflineSnapshot) {
      page.drawText(
        `OFFLINE CACHE REPORT — POTENTIALLY OUTDATED (Last Sync: ${meta.lastSyncedAt ?? 'Not recorded'})`,
        {
          x: 40,
          y,
          size: 9,
          font: fontBold,
          color: rgb(0.72, 0.25, 0.05),
        },
      );
      y -= 18;
    }

    page.drawLine({
      start: { x: 40, y },
      end: { x: pageWidth - 40, y },
      thickness: 1,
      color: rgb(0.82, 0.85, 0.9),
    });
    y -= 18;
  };

  drawHeader();

  if (rows.length === 0) {
    page.drawText('No authorized trainee records match the selected filters.', {
      x: 40,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.48),
    });
  } else {
    for (const row of rows) {
      if (y < 60) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - 48;
        drawHeader();
      }
      const line = `${row.referenceNo} | ${row.fullName} | ${row.courseName} | ${row.status} | ${row.completeness}%`;
      page.drawText(line.slice(0, 115), {
        x: 40,
        y,
        size: 9,
        font: fontRegular,
        color: rgb(0.1, 0.15, 0.22),
      });
      y -= 14;
    }
  }

  return pdfDoc.save();
}

export async function exportTraineeReportPdf(rows: TraineeSummaryRow[], meta: ReportMetadata): Promise<void> {
  const bytes = await buildTraineeReportPdf(rows, meta);
  triggerBrowserDownload(bytes, `tctesda-report-${Date.now()}.pdf`, 'application/pdf');
}
