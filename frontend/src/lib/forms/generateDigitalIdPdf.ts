import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface DigitalSystemIdCardProps {
  fullName: string;
  email?: string | null;
  systemAccountId: string;
  roleLabel?: string;
  institutionCode?: string | null;
  institutionName?: string | null;
  courseName?: string | null;
  batchName?: string | null;
  scholarId?: string | null;
  enrollmentStatus?: string | null;
  uliNumber?: string | null;
  photoUrl?: string | null;
  contactNumber?: string | null;
}

export async function downloadDigitalSystemIdPdf(props: DigitalSystemIdCardProps): Promise<void> {
  const doc = await PDFDocument.create();
  // CR80-proportioned scaled page for crisp desktop/mobile viewing & printing
  const page = doc.addPage([320, 500]);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await doc.embedFont(StandardFonts.Helvetica);

  const navy = rgb(0.059, 0.161, 0.361);
  const amber = rgb(0.961, 0.62, 0.043);
  const slate900 = rgb(0.059, 0.09, 0.165);
  const slate600 = rgb(0.278, 0.333, 0.412);
  const lightBg = rgb(0.965, 0.976, 0.992);

  page.drawRectangle({ x: 0, y: 0, width: 320, height: 500, color: lightBg });
  page.drawRectangle({ x: 0, y: 420, width: 320, height: 80, color: navy });
  page.drawRectangle({ x: 0, y: 414, width: 320, height: 6, color: amber });

  page.drawText('TCTESDAConnect', { x: 20, y: 468, size: 15, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('DIGITAL SYSTEM ACCOUNT ID', { x: 20, y: 450, size: 8.5, font: fontBold, color: amber });
  page.drawText(props.institutionName || 'TESDA Training Operations Portal', {
    x: 20,
    y: 432,
    size: 8.5,
    font: fontReg,
    color: rgb(0.86, 0.91, 0.98),
  });

  // Photo box
  page.drawRectangle({
    x: 110,
    y: 294,
    width: 100,
    height: 100,
    color: rgb(1, 1, 1),
    borderColor: navy,
    borderWidth: 1.5,
  });
  const initials = (props.fullName || 'TC')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  page.drawText(initials || 'TC', { x: 142, y: 336, size: 22, font: fontBold, color: navy });

  // Name & role
  page.drawText((props.fullName || 'Learner').toUpperCase().slice(0, 32), {
    x: 20,
    y: 266,
    size: 12,
    font: fontBold,
    color: slate900,
  });
  page.drawText(props.roleLabel || 'Scholar / Student System Account', {
    x: 20,
    y: 248,
    size: 9,
    font: fontReg,
    color: slate600,
  });

  const sysCode = `TC-${props.systemAccountId.slice(0, 8).toUpperCase()}`;
  const isConfirmed = props.enrollmentStatus === 'confirmed';
  const uliLine =
    isConfirmed && props.uliNumber
      ? props.uliNumber
      : 'Pending TESDA Main ULI (after confirmation)';

  const rows: Array<[string, string]> = [
    ['System Account No.', sysCode],
    ['Campus Code', props.institutionCode || 'DEFAULT'],
    ['Qualification', (props.courseName || 'Not assigned yet').slice(0, 34)],
    ['Scholar / Batch', props.scholarId || props.batchName || 'Pending batch'],
    ['Status', (props.enrollmentStatus || 'active').toUpperCase()],
    ['TESDA ULI', uliLine.slice(0, 38)],
  ];

  let y = 216;
  for (const [k, v] of rows) {
    page.drawText(k.toUpperCase(), { x: 20, y, size: 7, font: fontBold, color: slate600 });
    page.drawText(v, { x: 112, y, size: 8.5, font: fontReg, color: slate900 });
    y -= 22;
  }

  page.drawRectangle({
    x: 16,
    y: 24,
    width: 288,
    height: 48,
    color: rgb(1, 0.973, 0.914),
    borderColor: amber,
    borderWidth: 1,
  });
  page.drawText('SYSTEM ACCOUNT DIGITAL ID ONLY', {
    x: 24,
    y: 54,
    size: 8,
    font: fontBold,
    color: rgb(0.57, 0.25, 0.05),
  });
  page.drawText('For TCTESDAConnect system login & portal identification only.', {
    x: 24,
    y: 41,
    size: 7.2,
    font: fontReg,
    color: rgb(0.45, 0.22, 0.05),
  });
  page.drawText('Not an official TESDA Certificate or government ID.', {
    x: 24,
    y: 31,
    size: 7.2,
    font: fontReg,
    color: rgb(0.45, 0.22, 0.05),
  });

  const bytes = await doc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TCTESDA_System_ID_${sysCode}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
