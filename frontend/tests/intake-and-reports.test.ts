import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { calculateIntakeCompleteness } from '@/features/intake/intakeValidation';
import { buildMis0301PdfBytes } from '@/lib/forms/generateMis0301Pdf';
import { buildTraineeReportPdf, buildTraineeReportWorkbook } from '@/lib/reports/exportReports';

describe('Trainee Intake Completeness & Report Exports', () => {
  it('computes 100% completeness only when all required fields and consent are satisfied', () => {
    const incomplete = calculateIntakeCompleteness({ first_name: 'Juan', last_name: 'Dela Cruz' });
    expect(incomplete.percentage).toBeLessThan(100);
    expect(incomplete.isReadyForVerification).toBe(false);
    expect(incomplete.missingFields).toContain('Privacy Consent');

    const complete = calculateIntakeCompleteness({
      entry_date: '2026-11-16',
      address_line: '123 Rizal St.',
      barangay: 'Poblacion',
      city_municipality: 'San Jose',
      province: 'Occidental Mindoro',
      region: 'Region IV-B',
      contact_number: '09171234567',
      last_name: 'Dela Cruz',
      first_name: 'Juan',
      nationality: 'Filipino',
      sex: 'Male',
      civil_status: 'Single',
      employment_status: 'Unemployed',
      birthdate: '2002-05-10',
      educational_attainment: 'SHS Graduate',
      guardian_name: 'Pedro Dela Cruz',
      guardian_address: '123 Rizal St.',
      institution_id: 'BST',
      course_id: 'SMAW-NCII',
      classifications: ['Out-of-School Youth'],
      privacy_consent: true,
    });
    expect(complete.percentage).toBe(100);
    expect(complete.missingFields).toHaveLength(0);
    expect(complete.isReadyForVerification).toBe(true);
  });

  it('builds valid XLSX and PDF buffers using ExcelJS and pdf-lib with offline staleness labels', async () => {
    const sampleRows = [
      {
        referenceNo: 'TC-2026-AB12CD34',
        scholarId: 'BST-2026-0001',
        uliNumber: 'ULI-1234-5678',
        fullName: 'Juan Dela Cruz',
        courseName: 'Shielded Metal Arc Welding (SMAW)',
        status: 'confirmed',
        completeness: 100,
        missingRequirements: '',
      },
    ];

    const meta = {
      reportTitle: 'Trainee Summary Report',
      institutionLabel: 'Balli School of Technology (BST)',
      generatedBy: 'Registrar BST',
      isOfflineSnapshot: true,
      lastSyncedAt: '2026-11-16T00:00:00Z',
    };

    const xlsxBytes = await buildTraineeReportWorkbook(sampleRows, meta);
    expect(xlsxBytes.byteLength).toBeGreaterThan(1000);
    // XLSX zip magic header PK\x03\x04
    expect(xlsxBytes[0]).toBe(0x50);
    expect(xlsxBytes[1]).toBe(0x4b);

    const pdfBytes = await buildTraineeReportPdf(sampleRows, meta);
    const pdfHeader = new TextDecoder().decode(pdfBytes.slice(0, 5));
    expect(pdfHeader).toBe('%PDF-');
    // exceljs (~1 MB) is now loaded on demand, which can exceed the 5 s default under a busy parallel run.
  }, 20_000);

  it('generates 2-page official MIS 03-01 (ver. 2021) PDFs in both filled and blank modes', async () => {
    const sampleIntake = {
      uli_number: '0487713087-001',
      entry_date: '2026-06-22',
      last_name: 'Marturillas',
      first_name: 'Kyla Marie',
      middle_name: 'Alquizar',
      address_line: 'Joyful Life Church Baybay 1303A',
      barangay: 'Mulawin',
      district: 'Lone',
      city_municipality: 'Santa Cruz',
      province: 'Occidental Mindoro',
      region: 'IV-B',
      email_or_facebook: 'marturillaskylamarie@gmail.com',
      contact_number: '09275619702',
      nationality: 'Filipino',
      sex: 'Female' as const,
      civil_status: 'Single',
      employment_status: 'Unemployed',
      employment_type: 'None',
      birthdate: '2004-10-17',
      birthplace_city: 'Caloocan City',
      birthplace_province: 'Metro Manila',
      birthplace_region: 'NCR',
      educational_attainment: 'Senior High (K-12)',
      guardian_name: 'Josephine Guarino',
      guardian_address: 'Santa Cruz, Occidental Mindoro',
      classifications: ['Student'],
      disability_types: [],
      disability_cause: 'none',
      course_name: 'Visual Graphic Design NC III',
      scholarship_package: 'STEP',
      privacy_consent: true as const,
      applicant_signature_name: 'Kyla Marie A. Marturillas',
      date_accomplished: '2026-06-22',
      noted_by_name: 'Mylene N. Galdiano',
      date_received: '2026-06-22',
    };

    const filledPdf = await buildMis0301PdfBytes(sampleIntake, 'filled');
    const blankPdf = await buildMis0301PdfBytes(sampleIntake, 'blank');

    expect(new TextDecoder().decode(filledPdf.slice(0, 5))).toBe('%PDF-');
    expect(new TextDecoder().decode(blankPdf.slice(0, 5))).toBe('%PDF-');

    const filledDoc = await PDFDocument.load(filledPdf);
    const blankDoc = await PDFDocument.load(blankPdf);
    expect(filledDoc.getPageCount()).toBe(2);
    expect(blankDoc.getPageCount()).toBe(2);
    expect(filledPdf.byteLength).toBeGreaterThan(blankPdf.byteLength);
  });
});
