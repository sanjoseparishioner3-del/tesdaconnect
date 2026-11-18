import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { TESDA_LOGO_RAW_BASE64 } from '@/lib/branding/tesdaLogoBase64';
import {
  calculateAgeFromBirthdate,
  CIVIL_STATUS_OPTIONS,
  DISABILITY_CAUSES,
  DISABILITY_TYPES,
  EDUCATIONAL_ATTAINMENT_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  MIS0301_CLASSIFICATIONS_COL1,
  MIS0301_CLASSIFICATIONS_COL2,
  MIS0301_CLASSIFICATIONS_COL3,
  type Mis0301Values,
} from '@/lib/forms/mis0301Schema';

export type Mis0301RenderMode = 'filled' | 'blank';

function cleanAscii(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function drawCheckbox(
  page: PDFPage,
  fontBold: PDFFont,
  fontReg: PDFFont,
  x: number,
  y: number,
  label: string,
  checked: boolean,
  maxWidth = 175,
  fontSize = 6.8,
) {
  const boxSize = 7.5;
  page.drawRectangle({
    x,
    y: y - 1,
    width: boxSize,
    height: boxSize,
    borderWidth: 0.7,
    borderColor: rgb(0.15, 0.18, 0.24),
  });
  if (checked) {
    page.drawText('X', {
      x: x + 1.5,
      y: y,
      size: 6.5,
      font: fontBold,
      color: rgb(0.05, 0.16, 0.38),
    });
  }
  const clipped = cleanAscii(label).slice(0, Math.floor(maxWidth / 3.4));
  page.drawText(clipped, {
    x: x + boxSize + 3.5,
    y: y,
    size: fontSize,
    font: fontReg,
    color: rgb(0.08, 0.1, 0.14),
  });
}

function drawSectionHeader(page: PDFPage, fontBold: PDFFont, y: number, title: string, width: number, left = 36): number {
  const h = 15;
  page.drawRectangle({
    x: left,
    y: y - h,
    width,
    height: h,
    color: rgb(0.9, 0.92, 0.94),
    borderWidth: 0.8,
    borderColor: rgb(0.2, 0.24, 0.3),
  });
  page.drawText(cleanAscii(title), {
    x: left + 5,
    y: y - 11,
    size: 8.5,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.15),
  });
  return y - h;
}

function drawBoxedField(
  page: PDFPage,
  fontBold: PDFFont,
  fontReg: PDFFont,
  x: number,
  y: number,
  width: number,
  height: number,
  caption: string,
  value: string,
  filled: boolean,
) {
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    borderWidth: 0.7,
    borderColor: rgb(0.25, 0.28, 0.34),
  });
  if (filled && value) {
    page.drawText(cleanAscii(value).slice(0, Math.floor(width / 4.2)), {
      x: x + 4,
      y: y - height + 11,
      size: 8,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  page.drawText(cleanAscii(caption), {
    x: x + 4,
    y: y - height + 2.5,
    size: 6.2,
    font: fontReg,
    color: rgb(0.25, 0.28, 0.35),
  });
}

function formatEntryDate(isoDate?: string): string {
  if (!isoDate) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[2] ?? ''}/${match[3] ?? ''}/${(match[1] ?? '').slice(2)}`;
}

function splitBirthdate(isoDate?: string): { mm: string; dd: string; yyyy: string; age: string } {
  if (!isoDate) return { mm: '', dd: '', yyyy: '', age: '' };
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return { mm: '', dd: '', yyyy: '', age: calculateAgeFromBirthdate(isoDate) };
  return {
    mm: match[2] ?? '',
    dd: match[3] ?? '',
    yyyy: match[1] ?? '',
    age: calculateAgeFromBirthdate(isoDate),
  };
}

export async function buildMis0301PdfBytes(
  values: Partial<Mis0301Values>,
  mode: Mis0301RenderMode = 'filled',
): Promise<Uint8Array> {
  const filled = mode === 'filled';
  const pdfDoc = await PDFDocument.create();
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 612;
  const pageHeight = 792;
  const left = 36;
  const contentWidth = pageWidth - left * 2; // 540

  // ==================== PAGE 1 ====================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - 30;

  // Header frame
  page1.drawRectangle({ x: left, y: y - 34, width: contentWidth, height: 34, borderWidth: 0.9, borderColor: rgb(0.15, 0.18, 0.25) });
  page1.drawLine({ start: { x: left + 70, y }, end: { x: left + 70, y: y - 34 }, thickness: 0.8, color: rgb(0.2, 0.24, 0.3) });
  page1.drawLine({ start: { x: left + contentWidth - 78, y }, end: { x: left + contentWidth - 78, y: y - 34 }, thickness: 0.8, color: rgb(0.2, 0.24, 0.3) });
  // Embed official TESDA logo
  let embeddedLogo = null;
  try {
    const binaryString = typeof atob === 'function' ? atob(TESDA_LOGO_RAW_BASE64) : Buffer.from(TESDA_LOGO_RAW_BASE64, 'base64').toString('binary');
    const logoBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      logoBytes[i] = binaryString.charCodeAt(i);
    }
    embeddedLogo = await pdfDoc.embedPng(logoBytes);
  } catch {
    embeddedLogo = null;
  }

  if (embeddedLogo) {
    page1.drawImage(embeddedLogo, {
      x: left + 21,
      y: y - 31,
      width: 28,
      height: 28,
    });
  } else {
    page1.drawCircle({ x: left + 35, y: y - 17, size: 11, borderWidth: 1.4, borderColor: rgb(0.08, 0.22, 0.48) });
    page1.drawText('TESDA', { x: left + 22.5, y: y - 19.5, size: 6.5, font: fontBold, color: rgb(0.08, 0.22, 0.48) });
  }

  page1.drawText('Technical Education and Skills Development Authority', { x: left + 125, y: y - 13, size: 9.5, font: fontBold, color: rgb(0.06, 0.1, 0.16) });
  page1.drawText('Pangasiwaan sa Edukasyong Teknikal at Pagpapaunlad ng Kasanayan', { x: left + 108, y: y - 25, size: 8.5, font: fontReg, color: rgb(0.15, 0.18, 0.25) });

  page1.drawText('MIS 03-01', { x: left + contentWidth - 62, y: y - 13, size: 8, font: fontBold, color: rgb(0.08, 0.1, 0.16) });
  page1.drawText('(ver. 2021)', { x: left + contentWidth - 65, y: y - 24, size: 7.5, font: fontItalic, color: rgb(0.15, 0.18, 0.25) });

  y -= 34;
  // Title bar
  page1.drawRectangle({ x: left, y: y - 24, width: contentWidth, height: 24, borderWidth: 0.9, borderColor: rgb(0.15, 0.18, 0.25) });
  page1.drawText('Registration Form', { x: left + 195, y: y - 17.5, size: 17, font: fontBold, color: rgb(0.05, 0.08, 0.12) });

  y -= 24;
  // LEARNERS PROFILE FORM + ID Picture box
  page1.drawRectangle({ x: left, y: y - 58, width: contentWidth, height: 58, borderWidth: 0.9, borderColor: rgb(0.15, 0.18, 0.25) });
  page1.drawText('LEARNERS PROFILE FORM', { x: left + 95, y: y - 34, size: 13.5, font: fontBold, color: rgb(0.05, 0.08, 0.12) });

  // Embed attached 2x2 ID picture if provided
  let embeddedIdPic: PDFImage | null = null;
  if (filled && values.id_picture_url && values.id_picture_url.startsWith('data:image/')) {
    try {
      const match = values.id_picture_url.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
      if (match && match[2]) {
        const format = match[1]?.toLowerCase();
        const b64 = match[2];
        const binaryString = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        const imgBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          imgBytes[i] = binaryString.charCodeAt(i);
        }
        if (format === 'png') {
          embeddedIdPic = await pdfDoc.embedPng(imgBytes);
        } else {
          embeddedIdPic = await pdfDoc.embedJpg(imgBytes);
        }
      }
    } catch {
      embeddedIdPic = null;
    }
  }

  page1.drawRectangle({ x: left + contentWidth - 96, y: y - 53, width: 82, height: 48, borderWidth: 0.8, borderColor: rgb(0.2, 0.22, 0.28) });
  if (embeddedIdPic) {
    page1.drawImage(embeddedIdPic, {
      x: left + contentWidth - 95,
      y: y - 52,
      width: 80,
      height: 46,
    });
  } else {
    page1.drawText('2x2 I.D. Picture', { x: left + contentWidth - 76, y: y - 31, size: 7, font: fontReg, color: rgb(0.25, 0.28, 0.35) });
  }

  y -= 58;
  // 1. T2MIS Auto Generated
  y = drawSectionHeader(page1, fontBold, y, '1. T2MIS Auto Generated', contentWidth, left);

  page1.drawRectangle({ x: left, y: y - 34, width: contentWidth, height: 34, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawText('1.1.  Unique Learner', { x: left + 6, y: y - 13, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  page1.drawText('Identifier (ULI) Number:', { x: left + 6, y: y - 24, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });

  const cleanUli = cleanAscii(values.uli_number ?? '').replace(/\s+/g, '');
  const uliMain = cleanUli.includes('-') ? cleanUli.split('-')[0] ?? '' : cleanUli.slice(0, 10);
  const uliSuffix = cleanUli.includes('-') ? cleanUli.split('-')[1] ?? '' : cleanUli.slice(10, 13);

  let boxX = left + 106;
  for (let i = 0; i < 10; i += 1) {
    page1.drawRectangle({ x: boxX, y: y - 26, width: 15, height: 18, borderWidth: 0.7, borderColor: rgb(0.2, 0.22, 0.28) });
    const digit = uliMain.charAt(i);
    if (filled && digit) {
      page1.drawText(digit, { x: boxX + 4.5, y: y - 20, size: 8.5, font: fontBold, color: rgb(0.05, 0.12, 0.32) });
    }
    boxX += 15;
  }
  page1.drawText('-', { x: boxX + 3, y: y - 20, size: 9, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  boxX += 10;
  for (let j = 0; j < 3; j += 1) {
    page1.drawRectangle({ x: boxX, y: y - 26, width: 15, height: 18, borderWidth: 0.7, borderColor: rgb(0.2, 0.22, 0.28) });
    const suffixDigit = uliSuffix.charAt(j);
    if (filled && suffixDigit) {
      page1.drawText(suffixDigit, { x: boxX + 4.5, y: y - 20, size: 8.5, font: fontBold, color: rgb(0.05, 0.12, 0.32) });
    }
    boxX += 15;
  }

  page1.drawText('1.2. Entry Date:', { x: left + 332, y: y - 19, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  page1.drawRectangle({ x: left + 402, y: y - 26, width: 128, height: 18, borderWidth: 0.7, borderColor: rgb(0.2, 0.22, 0.28) });
  const entryDateFormatted = formatEntryDate(values.entry_date);
  page1.drawText(filled && entryDateFormatted ? entryDateFormatted : 'mm/dd/yy', {
    x: left + 444,
    y: y - 20,
    size: 8,
    font: filled && entryDateFormatted ? fontBold : fontReg,
    color: filled && entryDateFormatted ? rgb(0.05, 0.12, 0.32) : rgb(0.4, 0.44, 0.5),
  });

  y -= 34;
  // 2. Learner/Manpower Profile
  y = drawSectionHeader(page1, fontBold, y, '2. Learner/Manpower Profile', contentWidth, left);

  // 2.1 Name
  page1.drawRectangle({ x: left, y: y - 34, width: contentWidth, height: 34, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawText('2.1.  Name:', { x: left + 6, y: y - 16, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  const lastAndExt = [values.last_name, values.extension_name].filter(Boolean).join(', ');
  drawBoxedField(page1, fontBold, fontReg, left + 75, y - 4, 170, 26, 'Last Name, Extension Name (Jr., Sr.)', lastAndExt, filled);
  drawBoxedField(page1, fontBold, fontReg, left + 250, y - 4, 155, 26, 'First', values.first_name ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 410, y - 4, 122, 26, 'Middle', values.middle_name ?? '', filled);

  y -= 34;
  // 2.2 Address
  page1.drawRectangle({ x: left, y: y - 92, width: contentWidth, height: 92, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawText('2.2   Complete', { x: left + 6, y: y - 15, size: 7.3, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  page1.drawText('Permanent Mailing', { x: left + 6, y: y - 25, size: 7.3, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  page1.drawText('Address:', { x: left + 6, y: y - 35, size: 7.3, font: fontBold, color: rgb(0.1, 0.12, 0.16) });

  drawBoxedField(page1, fontBold, fontReg, left + 82, y - 4, 180, 26, 'Number, Street', values.address_line ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 266, y - 4, 148, 26, 'Barangay', values.barangay ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 418, y - 4, 114, 26, 'District', values.district ?? '', filled);

  drawBoxedField(page1, fontBold, fontReg, left + 82, y - 33, 180, 26, 'City/Municipality', values.city_municipality ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 266, y - 33, 148, 26, 'Province', values.province ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 418, y - 33, 114, 26, 'Region', values.region ?? '', filled);

  drawBoxedField(page1, fontBold, fontReg, left + 82, y - 62, 180, 26, 'Email Address/Facebook Account:', values.email_or_facebook ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 266, y - 62, 148, 26, 'Contact No:', values.contact_number ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 418, y - 62, 114, 26, 'Nationality', values.nationality ?? '', filled);

  y -= 92;
  // 3. Personal Information
  y = drawSectionHeader(page1, fontBold, y, '3. Personal Information', contentWidth, left);

  // Row 3.1 / 3.2 / 3.3 (height 118)
  const pRowH = 118;
  page1.drawRectangle({ x: left, y: y - pRowH, width: contentWidth, height: pRowH, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawLine({ start: { x: left + 95, y }, end: { x: left + 95, y: y - pRowH }, thickness: 0.7, color: rgb(0.25, 0.28, 0.34) });
  page1.drawLine({ start: { x: left + 240, y }, end: { x: left + 240, y: y - pRowH }, thickness: 0.7, color: rgb(0.25, 0.28, 0.34) });

  page1.drawText('3.1. Sex', { x: left + 8, y: y - 12, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  drawCheckbox(page1, fontBold, fontReg, left + 12, y - 30, 'Male', filled && values.sex === 'Male', 75);
  drawCheckbox(page1, fontBold, fontReg, left + 12, y - 44, 'Female', filled && values.sex === 'Female', 75);

  page1.drawText('3.2. Civil Status', { x: left + 102, y: y - 12, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  CIVIL_STATUS_OPTIONS.forEach((opt, idx) => {
    const matched =
      filled &&
      (values.civil_status === opt ||
        (opt.startsWith('Separated') && values.civil_status === 'Separated') ||
        (opt.startsWith('Widow') && values.civil_status === 'Widowed'));
    drawCheckbox(page1, fontBold, fontReg, left + 106, y - 28 - idx * 14, opt, matched, 128);
  });

  page1.drawText('3.3  Employment (before the training)', { x: left + 248, y: y - 12, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  page1.drawText('Employment Status', { x: left + 248, y: y - 26, size: 7, font: fontBold, color: rgb(0.15, 0.18, 0.24) });
  EMPLOYMENT_STATUS_OPTIONS.forEach((opt, idx) => {
    const matched = filled && (values.employment_status === opt || (opt === 'Wage-Employed' && values.employment_status === 'Employed'));
    drawCheckbox(page1, fontBold, fontReg, left + 250, y - 40 - idx * 17, opt, matched, 100);
  });

  page1.drawText('Employment Type', { x: left + 365, y: y - 26, size: 7, font: fontBold, color: rgb(0.15, 0.18, 0.24) });
  page1.drawText('(if Wage-employed or Underemployed)', { x: left + 365, y: y - 34, size: 5.8, font: fontItalic, color: rgb(0.25, 0.28, 0.35) });
  const empTypesLeft = EMPLOYMENT_TYPE_OPTIONS.filter((_, i) => i % 2 === 0);
  const empTypesRight = EMPLOYMENT_TYPE_OPTIONS.filter((_, i) => i % 2 === 1);
  empTypesLeft.forEach((opt, idx) => {
    drawCheckbox(page1, fontBold, fontReg, left + 365, y - 48 - idx * 14, opt, filled && values.employment_type === opt, 80);
  });
  empTypesRight.forEach((opt, idx) => {
    drawCheckbox(page1, fontBold, fontReg, left + 455, y - 48 - idx * 14, opt, filled && values.employment_type === opt, 80);
  });

  y -= pRowH;
  // 3.4 Birthdate
  const bdate = splitBirthdate(values.birthdate);
  page1.drawRectangle({ x: left, y: y - 34, width: contentWidth, height: 34, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawText('3.4 Birthdate', { x: left + 6, y: y - 14, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  drawBoxedField(page1, fontBold, fontReg, left + 82, y - 4, 115, 26, 'Month of Birth', bdate.mm, filled);
  drawBoxedField(page1, fontBold, fontReg, left + 202, y - 4, 110, 26, 'Day of Birth', bdate.dd, filled);
  drawBoxedField(page1, fontBold, fontReg, left + 317, y - 4, 115, 26, 'Year of Birth', bdate.yyyy, filled);
  drawBoxedField(page1, fontBold, fontReg, left + 437, y - 4, 95, 26, 'Age', bdate.age, filled);

  y -= 34;
  // 3.5 Birthplace
  page1.drawRectangle({ x: left, y: y - 34, width: contentWidth, height: 34, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawText('3.5 Birthplace', { x: left + 6, y: y - 14, size: 7.5, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  drawBoxedField(page1, fontBold, fontReg, left + 82, y - 4, 165, 26, 'City/Municipality', values.birthplace_city ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 252, y - 4, 145, 26, 'Province', values.birthplace_province ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 402, y - 4, 130, 26, 'Region', values.birthplace_region ?? '', filled);

  y -= 34;
  // 3.6 Educational Attainment
  y = drawSectionHeader(page1, fontBold, y, '3.6  Educational Attainment Before the Training (Trainee)', contentWidth, left);
  const eduH = 88;
  page1.drawRectangle({ x: left, y: y - eduH, width: contentWidth, height: eduH, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  const eduCol1 = EDUCATIONAL_ATTAINMENT_OPTIONS.slice(0, 5);
  const eduCol2 = EDUCATIONAL_ATTAINMENT_OPTIONS.slice(5, 9);
  const eduCol3 = EDUCATIONAL_ATTAINMENT_OPTIONS.slice(9, 13);
  eduCol1.forEach((opt, i) => {
    drawCheckbox(page1, fontBold, fontReg, left + 8, y - 14 - i * 16, opt, filled && values.educational_attainment === opt, 135, 6.5);
  });
  eduCol2.forEach((opt, i) => {
    drawCheckbox(page1, fontBold, fontReg, left + 158, y - 14 - i * 18, opt, filled && values.educational_attainment === opt, 195, 6.2);
  });
  eduCol3.forEach((opt, i) => {
    drawCheckbox(page1, fontBold, fontReg, left + 375, y - 14 - i * 18, opt, filled && values.educational_attainment === opt, 155, 6.5);
  });

  y -= eduH;
  // 3.7 Parent/Guardian
  page1.drawRectangle({ x: left, y: y - 38, width: contentWidth, height: 38, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page1.drawText('3.7 Parent/Guardian', { x: left + 6, y: y - 14, size: 7.3, font: fontBold, color: rgb(0.1, 0.12, 0.16) });
  drawBoxedField(page1, fontBold, fontReg, left + 92, y - 5, 190, 28, 'Name', values.guardian_name ?? '', filled);
  drawBoxedField(page1, fontBold, fontReg, left + 286, y - 5, 246, 28, 'Complete Permanent Mailing Address', values.guardian_address ?? '', filled);

  // ==================== PAGE 2 ====================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y2 = pageHeight - 36;

  // 4. Learner/Trainee/Student Classification
  y2 = drawSectionHeader(page2, fontBold, y2, '4. Learner/Trainee/Student (Clients) Classification:', contentWidth, left);
  const classRowH = 22;
  const maxClassRows = 8;
  for (let r = 0; r < maxClassRows; r += 1) {
    const rowTop = y2 - r * classRowH;
    page2.drawRectangle({ x: left, y: rowTop - classRowH, width: contentWidth, height: classRowH, borderWidth: 0.6, borderColor: rgb(0.25, 0.28, 0.34) });
    page2.drawLine({ start: { x: left + 180, y: rowTop }, end: { x: left + 180, y: rowTop - classRowH }, thickness: 0.6, color: rgb(0.25, 0.28, 0.34) });
    page2.drawLine({ start: { x: left + 360, y: rowTop }, end: { x: left + 360, y: rowTop - classRowH }, thickness: 0.6, color: rgb(0.25, 0.28, 0.34) });

    const c1 = MIS0301_CLASSIFICATIONS_COL1[r];
    const c2 = MIS0301_CLASSIFICATIONS_COL2[r];
    const c3 = MIS0301_CLASSIFICATIONS_COL3[r];
    const picked = new Set(values.classifications ?? []);

    if (c1) drawCheckbox(page2, fontBold, fontReg, left + 6, rowTop - 13, c1, filled && picked.has(c1), 165, 6.2);
    if (c2) drawCheckbox(page2, fontBold, fontReg, left + 186, rowTop - 13, c2, filled && picked.has(c2), 165, 6.2);
    if (c3) {
      const label = c3 === 'Others' && filled && values.classification_other ? `Others: ${cleanAscii(values.classification_other)}` : c3 === 'Others' ? 'Others: ___________ (Please Specify)' : c3;
      drawCheckbox(page2, fontBold, fontReg, left + 366, rowTop - 13, label, filled && picked.has(c3), 165, 6.2);
    }
  }
  y2 -= classRowH * maxClassRows;

  // 5. Type of Disability
  y2 = drawSectionHeader(
    page2,
    fontBold,
    y2,
    '5. Type of Disability (for Persons with Disability Only): To be filled up by the TESDA personnel',
    contentWidth,
    left,
  );
  const disH = 58;
  page2.drawRectangle({ x: left, y: y2 - disH, width: contentWidth, height: disH, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  const pickedDis = new Set(values.disability_types ?? []);
  DISABILITY_TYPES.forEach((d, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const label = d.startsWith('Multiple Disabilities') && filled && values.disability_other ? `${d}: ${cleanAscii(values.disability_other)}` : d;
    drawCheckbox(page2, fontBold, fontReg, left + 10 + col * 180, y2 - 16 - row * 18, label, filled && pickedDis.has(d), 168, 6.3);
  });
  y2 -= disH;

  // 6. Causes of Disability
  y2 = drawSectionHeader(
    page2,
    fontBold,
    y2,
    '6. Causes of Disability (for Persons with Disability Only): To be filled up by the TESDA personnel',
    contentWidth,
    left,
  );
  page2.drawRectangle({ x: left, y: y2 - 22, width: contentWidth, height: 22, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  DISABILITY_CAUSES.forEach((cause, idx) => {
    const match = filled && (values.disability_cause?.toLowerCase() === cause.toLowerCase() || (cause.startsWith('Congenital') && values.disability_cause === 'congenital'));
    drawCheckbox(page2, fontBold, fontReg, left + 24 + idx * 175, y2 - 14, cause, match, 140, 6.8);
  });
  y2 -= 22;

  // 7. Course / Qualification
  y2 = drawSectionHeader(page2, fontBold, y2, '7. Name of Course/Qualification', contentWidth, left);
  page2.drawRectangle({ x: left, y: y2 - 24, width: contentWidth, height: 24, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  if (filled && (values.course_name || values.course_id)) {
    page2.drawText(cleanAscii(values.course_name || values.course_id).slice(0, 90), {
      x: left + 10,
      y: y2 - 16,
      size: 9,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  y2 -= 24;

  // 8. Scholarship Package
  y2 = drawSectionHeader(
    page2,
    fontBold,
    y2,
    '8. If Scholar, What Type of Scholarship Package (TWSP, PESFA, STEP, others)?',
    contentWidth,
    left,
  );
  page2.drawRectangle({ x: left, y: y2 - 24, width: contentWidth, height: 24, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  if (filled && values.scholarship_package) {
    page2.drawText(cleanAscii(values.scholarship_package).slice(0, 90), {
      x: left + 10,
      y: y2 - 16,
      size: 9,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  y2 -= 24;

  // 9. Privacy Consent and Disclaimer
  y2 = drawSectionHeader(page2, fontBold, y2, '9. Privacy Consent and Disclaimer', contentWidth, left);
  const privH = 74;
  page2.drawRectangle({ x: left, y: y2 - privH, width: contentWidth, height: privH, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  const privLines = [
    'I hereby attest that I have read and understood the Privacy Notice of TESDA through its website (https://www.tesda.gov.ph)',
    'and thereby giving my consent in the processing of my personal information indicated in this Learners Profile. The',
    'processing includes scholarships, employment, survey, and all other related TESDA programs that may be beneficial to my',
    'qualifications.',
  ];
  privLines.forEach((line, idx) => {
    page2.drawText(line, { x: left + 10, y: y2 - 13 - idx * 10.5, size: 7.3, font: fontItalic, color: rgb(0.1, 0.12, 0.16) });
  });
  drawCheckbox(page2, fontBold, fontReg, left + 175, y2 - 64, 'Agree', filled && values.privacy_consent === true, 80, 7.5);
  drawCheckbox(page2, fontBold, fontReg, left + 305, y2 - 64, 'Disagree', filled && values.privacy_consent === false, 80, 7.5);
  y2 -= privH;

  // 10. Applicant's Signature
  y2 = drawSectionHeader(page2, fontBold, y2, "10. Applicant's Signature", contentWidth, left);
  const sigH = 198;
  page2.drawRectangle({ x: left, y: y2 - sigH, width: contentWidth, height: sigH, borderWidth: 0.8, borderColor: rgb(0.2, 0.24, 0.3) });
  page2.drawText('This is to certify that the information stated above is true and correct.', {
    x: left + 150,
    y: y2 - 16,
    size: 7.2,
    font: fontItalic,
    color: rgb(0.15, 0.18, 0.24),
  });

  // Applicant signature line & Date accomplished
  const applicantPrintedName =
    cleanAscii(values.applicant_signature_name) ||
    cleanAscii([values.first_name, values.middle_name, values.last_name, values.extension_name].filter(Boolean).join(' '));
  if (filled && applicantPrintedName) {
    page2.drawText(applicantPrintedName.toUpperCase().slice(0, 34), {
      x: left + 22,
      y: y2 - 58,
      size: 8.5,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  page2.drawLine({ start: { x: left + 20, y: y2 - 62 }, end: { x: left + 215, y: y2 - 62 }, thickness: 0.8, color: rgb(0.1, 0.12, 0.16) });
  page2.drawText("APPLICANT'S SIGNATURE OVER PRINTED NAME", { x: left + 28, y: y2 - 71, size: 6.4, font: fontBold, color: rgb(0.15, 0.18, 0.24) });

  if (filled && values.date_accomplished) {
    page2.drawText(cleanAscii(values.date_accomplished), {
      x: left + 255,
      y: y2 - 58,
      size: 8.5,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  page2.drawLine({ start: { x: left + 235, y: y2 - 62 }, end: { x: left + 355, y: y2 - 62 }, thickness: 0.8, color: rgb(0.1, 0.12, 0.16) });
  page2.drawText('DATE ACCOMPLISHED', { x: left + 258, y: y2 - 71, size: 6.4, font: fontBold, color: rgb(0.15, 0.18, 0.24) });

  // Noted by Registrar / School Administrator
  page2.drawText('Noted by:', { x: left + 20, y: y2 - 118, size: 7.2, font: fontBold, color: rgb(0.15, 0.18, 0.24) });
  if (filled && values.noted_by_name) {
    page2.drawText(cleanAscii(values.noted_by_name).toUpperCase().slice(0, 34), {
      x: left + 40,
      y: y2 - 146,
      size: 8.5,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  page2.drawLine({ start: { x: left + 38, y: y2 - 150 }, end: { x: left + 225, y: y2 - 150 }, thickness: 0.8, color: rgb(0.1, 0.12, 0.16) });
  page2.drawText('REGISTRAR/SCHOOL ADMINISTRATOR', { x: left + 56, y: y2 - 159, size: 6.4, font: fontBold, color: rgb(0.15, 0.18, 0.24) });
  page2.drawText('(Signature Over Printed Name)', { x: left + 74, y: y2 - 167, size: 6.2, font: fontReg, color: rgb(0.15, 0.18, 0.24) });

  if (filled && values.date_received) {
    page2.drawText(cleanAscii(values.date_received), {
      x: left + 260,
      y: y2 - 146,
      size: 8.5,
      font: fontBold,
      color: rgb(0.05, 0.12, 0.32),
    });
  }
  page2.drawLine({ start: { x: left + 245, y: y2 - 150 }, end: { x: left + 355, y: y2 - 150 }, thickness: 0.8, color: rgb(0.1, 0.12, 0.16) });
  page2.drawText('DATE RECEIVED', { x: left + 272, y: y2 - 159, size: 6.4, font: fontBold, color: rgb(0.15, 0.18, 0.24) });

  // 1x1 / 2x2 photo box + Right Thumbmark box
  const photoBoxX = left + 390;
  page2.drawRectangle({ x: photoBoxX, y: y2 - 102, width: 112, height: 74, borderWidth: 0.8, borderColor: rgb(0.2, 0.22, 0.28) });
  if (embeddedIdPic) {
    page2.drawImage(embeddedIdPic, {
      x: photoBoxX + 1,
      y: y2 - 101,
      width: 110,
      height: 72,
    });
  } else {
    page2.drawText('1x1 picture taken', { x: photoBoxX + 26, y: y2 - 58, size: 7.2, font: fontReg, color: rgb(0.3, 0.34, 0.4) });
    page2.drawText('within the last 6', { x: photoBoxX + 29, y: y2 - 68, size: 7.2, font: fontReg, color: rgb(0.3, 0.34, 0.4) });
    page2.drawText('months', { x: photoBoxX + 43, y: y2 - 78, size: 7.2, font: fontReg, color: rgb(0.3, 0.34, 0.4) });
  }

  page2.drawRectangle({ x: photoBoxX, y: y2 - 178, width: 112, height: 68, borderWidth: 0.8, borderColor: rgb(0.2, 0.22, 0.28) });
  page2.drawText('Right Thumbmark', { x: photoBoxX + 22, y: y2 - 189, size: 7.5, font: fontBold, color: rgb(0.15, 0.18, 0.24) });

  return pdfDoc.save();
}

export async function downloadMis0301Pdf(
  values: Partial<Mis0301Values>,
  mode: Mis0301RenderMode = 'filled',
): Promise<void> {
  const bytes = await buildMis0301PdfBytes(values, mode);
  const nameSlug =
    mode === 'blank'
      ? 'BLANK-MANUAL-FILLUP'
      : `${values.last_name ?? 'LEARNER'}-${values.first_name ?? ''}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TESDA-MIS-03-01-${nameSlug}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
