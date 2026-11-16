export interface RequiredDocumentSpec {
  key: string;
  label: string;
  description: string;
  optionalNote?: string;
}

export const TESDA_REQUIRED_DOCUMENTS: RequiredDocumentSpec[] = [
  {
    key: 'registration_form',
    label: 'Application / Registration Form',
    description:
      'Duly accomplished TESDA application form (MIS 03-01) or BSRS (Biometric-Based Students Registration System) profile.',
  },
  {
    key: 'psa_birth_certificate',
    label: 'PSA Birth Certificate',
    description: 'Clear photocopy of your Philippine Statistics Authority birth certificate.',
  },
  {
    key: 'educational_records',
    label: 'Educational Records',
    description:
      'Photocopy of your High School Diploma, Form 138 (report card), ALS Certificate, College Diploma, or Transcript of Records (TOR) depending on the course level.',
  },
  {
    key: 'id_pictures',
    label: 'ID Pictures',
    description:
      'Colored ID photos with a white background and collar (typically 4 pieces of passport-size and/or 4 pieces of 1x1-inch photos, with some centers requiring a name tag at the bottom).',
  },
  {
    key: 'government_id',
    label: 'Valid Government-Issued ID',
    description: 'Original and photocopy of a valid ID.',
  },
  {
    key: 'medical_certificate',
    label: 'Medical Certificate',
    description:
      'A medical or health certificate stating you are physically and mentally fit (especially required for physically demanding or health-related courses).',
  },
  {
    key: 'marriage_certificate',
    label: 'Marriage Certificate',
    description: 'Photocopy of your marriage certificate (if applicable/married).',
    optionalNote: 'If applicable',
  },
  {
    key: 'additional_documents',
    label: 'Additional Documents',
    description:
      'A Barangay Clearance, Certificate of Indigency, or specific scholarship forms may be requested depending on the provider.',
  },
];

const LEGACY_DOC_KEY_ALIASES: Record<string, string> = {
  birth_certificate: 'psa_birth_certificate',
  form_137: 'educational_records',
  id_photo: 'id_pictures',
  valid_id: 'government_id',
  barangay_clearance: 'additional_documents',
};

export function normalizeDocumentTypeKey(rawType: string): string {
  return LEGACY_DOC_KEY_ALIASES[rawType] ?? rawType;
}

export function getDocumentLabel(rawType: string): string {
  const canonical = normalizeDocumentTypeKey(rawType);
  return TESDA_REQUIRED_DOCUMENTS.find((d) => d.key === canonical)?.label ?? rawType;
}
