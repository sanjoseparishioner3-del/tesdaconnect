import { z } from 'zod';

export const SEX_OPTIONS = ['Male', 'Female'] as const;

export const CIVIL_STATUS_OPTIONS = [
  'Single',
  'Married',
  'Separated/ Divorced/ Annulled',
  'Widow/er',
  'Common Law/ Live-in',
] as const;

export const EMPLOYMENT_STATUS_OPTIONS = [
  'Wage-Employed',
  'Underemployed',
  'Self-Employed',
  'Unemployed',
] as const;

export const EMPLOYMENT_TYPE_OPTIONS = [
  'None',
  'Regular',
  'Casual',
  'Job Order',
  'Probationary',
  'Permanent',
  'Contractual',
  'Temporary',
] as const;

export const EDUCATIONAL_ATTAINMENT_OPTIONS = [
  'No Grade Completed',
  'Elementary Undergraduate',
  'Elementary Graduate',
  'High School Undergraduate',
  'High School Graduate',
  'Junior High (K-12)',
  'Senior High (K-12)',
  'Post-Secondary Non-Tertiary/ Technical Vocational Course Undergraduate',
  'Post-Secondary Non-Tertiary/ Technical Vocational Course Graduate',
  'College Undergraduate',
  'College Graduate',
  'Masteral',
  'Doctorate',
] as const;

export const MIS0301_CLASSIFICATIONS_COL1 = [
  '4Ps Beneficiary',
  'Displaced Workers',
  'Family Members of AFP and PNP Wounded in-Action',
  'Industry Workers',
  'Out-of-School-Youth',
  'Rebel Returnees/Decommissioned Combatants',
  'TESDA Alumni',
  'Victim of Natural Disasters and Calamities',
] as const;

export const MIS0301_CLASSIFICATIONS_COL2 = [
  'Agrarian Reform Beneficiary',
  'Drug Dependents Surrenderees/Surrenderers',
  'Farmers and Fishermen',
  'Inmates and Detainees',
  'Overseas Filipino Workers (OFW) Dependent',
  'Returning/Repatriated Overseas Filipino Workers (OFW)',
  'TVET Trainers',
  'Wounded-in-Action AFP & PNP Personnel',
] as const;

export const MIS0301_CLASSIFICATIONS_COL3 = [
  'Balik Probinsya',
  'Family Members of AFP and PNP Killed-in-Action',
  'Indigenous People & Cultural Communities',
  'MILF Beneficiary',
  'RCEF-RESP',
  'Student',
  'Uniformed Personnel',
  'Others',
] as const;

export const CLASSIFICATIONS_OPTIONS = [
  ...MIS0301_CLASSIFICATIONS_COL1,
  ...MIS0301_CLASSIFICATIONS_COL2,
  ...MIS0301_CLASSIFICATIONS_COL3,
] as const;

export const DISABILITY_TYPES = [
  'Mental/Intellectual',
  'Visual Disability',
  'Orthopedic (Musculoskeletal) Disability',
  'Hearing Disability',
  'Speech Impairment',
  'Multiple Disabilities, specify',
  'Psychosocial Disability',
  'Disability Due to Chronic Illness',
  'Learning Disability',
] as const;

export const DISABILITY_CAUSES = [
  'Congenital/Inborn',
  'Illness',
  'Injury',
] as const;

export function calculateAgeFromBirthdate(birthdate?: string | null): string {
  if (!birthdate) return '';
  const parsed = new Date(birthdate);
  if (Number.isNaN(parsed.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? String(age) : '';
}

export const mis0301Schema = z.object({
  // Section 1: T2MIS Auto Generated
  uli_number: z.string().optional().default(''),
  entry_date: z.string().min(1, 'Entry date is required.'),
  id_picture_url: z.string().optional().default(''),

  // Section 2: Learner/Manpower Profile
  last_name: z.string().min(2, 'Last name is required.'),
  first_name: z.string().min(2, 'First name is required.'),
  middle_name: z.string().optional().default(''),
  extension_name: z.string().optional().default(''),
  address_line: z.string().min(3, 'Number / Street address is required.'),
  barangay: z.string().min(2, 'Barangay is required.'),
  district: z.string().optional().default(''),
  city_municipality: z.string().min(2, 'City or municipality is required.'),
  province: z.string().min(2, 'Province is required.'),
  region: z.string().min(2, 'Region is required.'),
  email_or_facebook: z.string().optional().default(''),
  contact_number: z.string().min(7, 'Valid contact number is required.'),
  nationality: z.string().min(2, 'Nationality is required.'),

  // Section 3: Personal Information
  sex: z.enum(['Male', 'Female']),
  civil_status: z.string().min(2, 'Civil status is required.'),
  employment_status: z.string().min(2, 'Employment status is required.'),
  employment_type: z.string().optional().default('None'),
  birthdate: z.string().min(1, 'Birthdate is required.'),
  birthplace_city: z.string().optional().default(''),
  birthplace_province: z.string().optional().default(''),
  birthplace_region: z.string().optional().default(''),
  educational_attainment: z.string().min(2, 'Educational attainment is required.'),
  guardian_name: z.string().min(2, 'Parent / guardian name is required.'),
  guardian_address: z.string().min(3, 'Parent / guardian address is required.'),

  // Section 4, 5, 6: Classification & Disability
  classifications: z.array(z.string()).min(1, 'Select at least one learner classification.'),
  classification_other: z.string().optional().default(''),
  disability_types: z.array(z.string()).default([]),
  disability_other: z.string().optional().default(''),
  disability_cause: z.string().optional().default('none'),

  // Section 7, 8, 9, 10: Course, Scholarship, Privacy & Signature
  institution_id: z.string().min(1, 'Select a TESDA institution (BST or MIF).'),
  course_id: z.string().min(1, 'Select a training qualification / course.'),
  course_name: z.string().optional().default(''),
  scholarship_package: z.string().optional().default(''),
  privacy_consent: z.literal(true, {
    errorMap: () => ({ message: 'RA 10173 privacy consent (Agree) is required before submission.' }),
  }),
  applicant_signature_name: z.string().optional().default(''),
  date_accomplished: z.string().optional().default(''),
  noted_by_name: z.string().optional().default(''),
  date_received: z.string().optional().default(''),
});

export type Mis0301Values = z.infer<typeof mis0301Schema>;

export interface CompletenessReport {
  percentage: number;
  missingFields: string[];
  isReadyForVerification: boolean;
}

const REQUIRED_VERIFICATION_KEYS: Array<{ key: keyof Mis0301Values; label: string }> = [
  { key: 'entry_date', label: 'Entry Date' },
  { key: 'address_line', label: 'Street Address' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'city_municipality', label: 'City/Municipality' },
  { key: 'province', label: 'Province' },
  { key: 'region', label: 'Region' },
  { key: 'contact_number', label: 'Contact Number' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'first_name', label: 'First Name' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'sex', label: 'Sex' },
  { key: 'civil_status', label: 'Civil Status' },
  { key: 'employment_status', label: 'Employment Status' },
  { key: 'birthdate', label: 'Birthdate' },
  { key: 'educational_attainment', label: 'Educational Attainment' },
  { key: 'guardian_name', label: 'Parent/Guardian Name' },
  { key: 'guardian_address', label: 'Parent/Guardian Address' },
  { key: 'institution_id', label: 'Institution' },
  { key: 'course_id', label: 'Training Program' },
  { key: 'privacy_consent', label: 'Privacy Consent' },
];

export function calculateIntakeCompleteness(values: Partial<Mis0301Values>): CompletenessReport {
  const missingFields: string[] = [];

  for (const field of REQUIRED_VERIFICATION_KEYS) {
    const val = values[field.key];
    if (field.key === 'privacy_consent') {
      if (val !== true) missingFields.push(field.label);
      continue;
    }
    if (typeof val !== 'string' || val.trim().length === 0) {
      missingFields.push(field.label);
    }
  }

  if (!Array.isArray(values.classifications) || values.classifications.length === 0) {
    missingFields.push('Learner Classification');
  }

  const total = REQUIRED_VERIFICATION_KEYS.length + 1;
  const completed = total - missingFields.length;
  const percentage = Math.round((completed / total) * 100);

  return {
    percentage,
    missingFields,
    isReadyForVerification: missingFields.length === 0,
  };
}

export function createEmptyMis0301Values(defaultInstitution = ''): Mis0301Values {
  const today = new Date().toISOString().slice(0, 10);
  return {
    uli_number: '',
    entry_date: today,
    id_picture_url: '',
    last_name: '',
    first_name: '',
    middle_name: '',
    extension_name: '',
    address_line: '',
    barangay: '',
    district: '',
    city_municipality: '',
    province: 'Occidental Mindoro',
    region: 'IV-B',
    email_or_facebook: '',
    contact_number: '',
    nationality: 'Filipino',
    sex: 'Male',
    civil_status: 'Single',
    employment_status: 'Unemployed',
    employment_type: 'None',
    birthdate: '',
    birthplace_city: '',
    birthplace_province: '',
    birthplace_region: '',
    educational_attainment: 'Senior High (K-12)',
    guardian_name: '',
    guardian_address: '',
    classifications: [],
    classification_other: '',
    disability_types: [],
    disability_other: '',
    disability_cause: 'none',
    institution_id: defaultInstitution,
    course_id: '',
    course_name: '',
    scholarship_package: '',
    privacy_consent: true,
    applicant_signature_name: '',
    date_accomplished: today,
    noted_by_name: '',
    date_received: '',
  };
}
