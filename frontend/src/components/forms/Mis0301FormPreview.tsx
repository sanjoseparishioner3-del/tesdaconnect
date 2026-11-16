import { Download, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadMis0301Pdf, type Mis0301RenderMode } from '@/lib/forms/generateMis0301Pdf';
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

interface Mis0301FormPreviewProps {
  values: Partial<Mis0301Values>;
  mode: Mis0301RenderMode;
  onModeChange?: (mode: Mis0301RenderMode) => void;
  onClose?: () => void;
}

function CheckboxCell({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className="inline-flex items-start gap-1.5 text-[11px] leading-tight text-slate-900">
      <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-slate-700 bg-white text-[9px] font-bold">
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function Mis0301FormPreview({ values, mode, onModeChange, onClose }: Mis0301FormPreviewProps) {
  const filled = mode === 'filled';
  const cleanUli = (values.uli_number ?? '').replace(/\s+/g, '');
  const uliMain = (cleanUli.includes('-') ? cleanUli.split('-')[0] : cleanUli.slice(0, 10)) ?? '';
  const uliSuffix = (cleanUli.includes('-') ? cleanUli.split('-')[1] : cleanUli.slice(10, 13)) ?? '';
  const bParts = values.birthdate ? values.birthdate.split('-') : [];
  const age = calculateAgeFromBirthdate(values.birthdate);

  const applicantPrintedName =
    values.applicant_signature_name ||
    [values.first_name, values.middle_name, values.last_name, values.extension_name].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-100 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-800">MIS 03-01 (ver. 2021) View Mode:</span>
          {onModeChange && (
            <>
              <Button type="button" size="sm" variant={filled ? 'secondary' : 'outline'} onClick={() => onModeChange('filled')}>
                Pre-Filled Registration Inputs
              </Button>
              <Button type="button" size="sm" variant={!filled ? 'secondary' : 'outline'} onClick={() => onModeChange('blank')}>
                Blank Manual Fill-Up Copy
              </Button>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print {filled ? 'Filled' : 'Blank'} Form
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void downloadMis0301Pdf(values, mode)}>
            <Download className="h-3.5 w-3.5" /> Download PDF ({filled ? 'Filled' : 'Blank'})
          </Button>
          {onClose && (
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" /> Close
            </Button>
          )}
        </div>
      </div>

      {/* PAGE 1 */}
      <div className="mx-auto max-w-[820px] border-2 border-slate-800 bg-white p-4 text-slate-900 shadow-sm print:shadow-none">
        <div className="grid grid-cols-12 border border-slate-800 text-center">
          <div className="col-span-2 flex items-center justify-center border-r border-slate-800 p-2">
            <img
              src="/tesda-logo.png"
              alt="TESDA Logo"
              className="h-12 w-12 object-contain"
            />
          </div>
          <div className="col-span-8 flex flex-col justify-center p-2">
            <p className="text-xs font-bold">Technical Education and Skills Development Authority</p>
            <p className="text-[11px]">Pangasiwaan sa Edukasyong Teknikal at Pagpapaunlad ng Kasanayan</p>
          </div>
          <div className="col-span-2 flex flex-col justify-center border-l border-slate-800 p-2 text-[11px]">
            <p className="font-bold">MIS 03-01</p>
            <p className="italic">(ver. 2021)</p>
          </div>
        </div>

        <div className="border-x border-b border-slate-800 py-1.5 text-center">
          <h2 className="text-2xl font-black tracking-tight">Registration Form</h2>
        </div>

        <div className="flex items-center justify-between border-x border-b border-slate-800 px-6 py-3">
          <p className="text-base font-black tracking-wide uppercase">LEARNERS PROFILE FORM</p>
          <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden border border-slate-700 bg-slate-50 text-[11px] text-slate-600 shadow-inner">
            {filled && values.id_picture_url ? (
              <img
                src={values.id_picture_url}
                alt="2x2 I.D. Picture"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="text-center p-1">
                <span className="block font-bold">2x2 I.D. Picture</span>
                <span className="text-[9px] text-slate-500">Attach photo</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 1 */}
        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          1. T2MIS Auto Generated
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-x border-b border-slate-800 px-2 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold leading-tight">
              1.1. Unique Learner Identifier (ULI) Number:
            </span>
            <div className="flex items-center">
              {Array.from({ length: 10 }).map((_, idx) => (
                <span key={`m-${idx}`} className="flex h-6 w-5 items-center justify-center border border-slate-700 font-mono text-xs font-bold text-blue-950">
                  {filled ? (uliMain[idx] ?? '') : ''}
                </span>
              ))}
              <span className="mx-1 font-bold">-</span>
              {Array.from({ length: 3 }).map((_, idx) => (
                <span key={`s-${idx}`} className="flex h-6 w-5 items-center justify-center border border-slate-700 font-mono text-xs font-bold text-blue-950">
                  {filled ? (uliSuffix[idx] ?? '') : ''}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">1.2. Entry Date:</span>
            <span className="flex h-6 min-w-[100px] items-center justify-center border border-slate-700 px-2 font-mono text-xs font-bold text-blue-950">
              {filled && values.entry_date ? values.entry_date : 'mm/dd/yy'}
            </span>
          </div>
        </div>

        {/* Section 2 */}
        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          2. Learner/Manpower Profile
        </div>
        <div className="space-y-2 border-x border-b border-slate-800 p-2 text-xs">
          <div className="grid grid-cols-12 items-start gap-2">
            <span className="col-span-2 pt-1 font-bold">2.1. Name:</span>
            <div className="col-span-4 border border-slate-700 px-2 py-1">
              <p className="min-h-[16px] font-bold uppercase text-blue-950">
                {filled ? [values.last_name, values.extension_name].filter(Boolean).join(', ') : ''}
              </p>
              <p className="text-[10px] text-slate-600">Last Name, Extension Name (Jr., Sr.)</p>
            </div>
            <div className="col-span-3 border border-slate-700 px-2 py-1">
              <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.first_name ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">First</p>
            </div>
            <div className="col-span-3 border border-slate-700 px-2 py-1">
              <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.middle_name ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">Middle</p>
            </div>
          </div>

          <div className="grid grid-cols-12 items-start gap-2">
            <span className="col-span-2 pt-1 font-bold leading-tight">2.2 Complete Permanent Mailing Address:</span>
            <div className="col-span-10 grid grid-cols-3 gap-2">
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.address_line ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Number, Street</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.barangay ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Barangay</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.district ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">District</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.city_municipality ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">City/Municipality</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.province ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Province</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.region ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Region</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] truncate font-bold text-blue-950">{filled ? (values.email_or_facebook ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Email Address/Facebook Account:</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold text-blue-950">{filled ? (values.contact_number ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Contact No:</p>
              </div>
              <div className="border border-slate-700 px-2 py-1">
                <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.nationality ?? '') : ''}</p>
                <p className="text-[10px] text-slate-600">Nationality</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          3. Personal Information
        </div>
        <div className="grid grid-cols-12 border-x border-b border-slate-800 text-xs">
          <div className="col-span-2 border-r border-slate-800 p-2">
            <p className="mb-1.5 font-bold">3.1. Sex</p>
            <div className="flex flex-col gap-1">
              <CheckboxCell label="Male" checked={filled && values.sex === 'Male'} />
              <CheckboxCell label="Female" checked={filled && values.sex === 'Female'} />
            </div>
          </div>
          <div className="col-span-4 border-r border-slate-800 p-2">
            <p className="mb-1.5 font-bold">3.2. Civil Status</p>
            <div className="flex flex-col gap-1">
              {CIVIL_STATUS_OPTIONS.map((opt) => (
                <CheckboxCell key={opt} label={opt} checked={filled && values.civil_status === opt} />
              ))}
            </div>
          </div>
          <div className="col-span-6 p-2">
            <p className="mb-1 font-bold">3.3 Employment (before the training)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold">Employment Status</p>
                <div className="flex flex-col gap-1">
                  {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
                    <CheckboxCell key={opt} label={opt} checked={filled && values.employment_status === opt} />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold">Employment Type</p>
                <div className="grid grid-cols-2 gap-1">
                  {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                    <CheckboxCell key={opt} label={opt} checked={filled && values.employment_type === opt} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 items-center gap-2 border-x border-b border-slate-800 p-2 text-xs">
          <span className="col-span-2 font-bold">3.4 Birthdate</span>
          <div className="col-span-10 grid grid-cols-4 gap-2">
            <div className="border border-slate-700 px-2 py-0.5 text-center">
              <p className="min-h-[16px] font-bold text-blue-950">{filled ? (bParts[1] ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">Month of Birth</p>
            </div>
            <div className="border border-slate-700 px-2 py-0.5 text-center">
              <p className="min-h-[16px] font-bold text-blue-950">{filled ? (bParts[2] ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">Day of Birth</p>
            </div>
            <div className="border border-slate-700 px-2 py-0.5 text-center">
              <p className="min-h-[16px] font-bold text-blue-950">{filled ? (bParts[0] ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">Year of Birth</p>
            </div>
            <div className="border border-slate-700 px-2 py-0.5 text-center">
              <p className="min-h-[16px] font-bold text-blue-950">{filled ? age : ''}</p>
              <p className="text-[10px] text-slate-600">Age</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 items-center gap-2 border-x border-b border-slate-800 p-2 text-xs">
          <span className="col-span-2 font-bold">3.5 Birthplace</span>
          <div className="col-span-10 grid grid-cols-3 gap-2">
            <div className="border border-slate-700 px-2 py-0.5">
              <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.birthplace_city ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">City/Municipality</p>
            </div>
            <div className="border border-slate-700 px-2 py-0.5">
              <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.birthplace_province ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">Province</p>
            </div>
            <div className="border border-slate-700 px-2 py-0.5">
              <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.birthplace_region ?? '') : ''}</p>
              <p className="text-[10px] text-slate-600">Region</p>
            </div>
          </div>
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          3.6 Educational Attainment Before the Training (Trainee)
        </div>
        <div className="grid grid-cols-3 gap-1.5 border-x border-b border-slate-800 p-2">
          {EDUCATIONAL_ATTAINMENT_OPTIONS.map((opt) => (
            <CheckboxCell key={opt} label={opt} checked={filled && values.educational_attainment === opt} />
          ))}
        </div>

        <div className="grid grid-cols-12 items-center gap-2 border-x border-b border-slate-800 p-2 text-xs">
          <span className="col-span-2 font-bold">3.7 Parent/Guardian</span>
          <div className="col-span-4 border border-slate-700 px-2 py-0.5">
            <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.guardian_name ?? '') : ''}</p>
            <p className="text-[10px] text-slate-600">Name</p>
          </div>
          <div className="col-span-6 border border-slate-700 px-2 py-0.5">
            <p className="min-h-[16px] font-bold uppercase text-blue-950">{filled ? (values.guardian_address ?? '') : ''}</p>
            <p className="text-[10px] text-slate-600">Complete Permanent Mailing Address</p>
          </div>
        </div>
      </div>

      {/* PAGE 2 */}
      <div className="mx-auto max-w-[820px] break-before-page border-2 border-slate-800 bg-white p-4 text-slate-900 shadow-sm print:shadow-none">
        <div className="border border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          4. Learner/Trainee/Student (Clients) Classification:
        </div>
        <div className="grid grid-cols-3 border-x border-b border-slate-800">
          {[MIS0301_CLASSIFICATIONS_COL1, MIS0301_CLASSIFICATIONS_COL2, MIS0301_CLASSIFICATIONS_COL3].map((col, colIdx) => (
            <div key={colIdx} className={colIdx < 2 ? 'border-r border-slate-800' : ''}>
              {col.map((item) => {
                const picked = filled && (values.classifications ?? []).includes(item);
                const label =
                  item === 'Others' && filled && values.classification_other
                    ? `Others: ${values.classification_other}`
                    : item === 'Others'
                      ? 'Others: ________ (Please Specify)'
                      : item;
                return (
                  <div key={item} className="border-b border-slate-300 px-2 py-1 last:border-b-0">
                    <CheckboxCell label={label} checked={picked} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          5. Type of Disability (for Persons with Disability Only): <span className="font-normal italic">To be filled up by the TESDA personnel</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 border-x border-b border-slate-800 p-2">
          {DISABILITY_TYPES.map((dis) => {
            const label =
              dis.startsWith('Multiple') && filled && values.disability_other
                ? `${dis}: ${values.disability_other}`
                : dis;
            return <CheckboxCell key={dis} label={label} checked={filled && (values.disability_types ?? []).includes(dis)} />;
          })}
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          6. Causes of Disability (for Persons with Disability Only): <span className="font-normal italic">To be filled up by the TESDA personnel</span>
        </div>
        <div className="grid grid-cols-3 gap-2 border-x border-b border-slate-800 p-2">
          {DISABILITY_CAUSES.map((cause) => (
            <CheckboxCell
              key={cause}
              label={cause}
              checked={filled && (values.disability_cause === cause || (cause.startsWith('Congenital') && values.disability_cause === 'congenital'))}
            />
          ))}
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          7. Name of Course/Qualification
        </div>
        <div className="min-h-[28px] border-x border-b border-slate-800 px-3 py-1 text-xs font-bold uppercase text-blue-950">
          {filled ? (values.course_name || values.course_id || '') : ''}
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          8. If Scholar, What Type of Scholarship Package (TWSP, PESFA, STEP, others)?
        </div>
        <div className="min-h-[28px] border-x border-b border-slate-800 px-3 py-1 text-xs font-bold uppercase text-blue-950">
          {filled ? (values.scholarship_package ?? '') : ''}
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          9. Privacy Consent and Disclaimer
        </div>
        <div className="space-y-2 border-x border-b border-slate-800 p-2.5 text-xs">
          <p className="italic leading-snug">
            I hereby attest that I have read and understood the Privacy Notice of TESDA through its website (https://www.tesda.gov.ph) and thereby giving my consent in the processing of my personal information indicated in this Learners Profile. The processing includes scholarships, employment, survey, and all other related TESDA programs that may be beneficial to my qualifications.
          </p>
          <div className="flex justify-center gap-16">
            <CheckboxCell label="Agree" checked={filled && (values.privacy_consent as boolean | undefined) === true} />
            <CheckboxCell label="Disagree" checked={filled && (values.privacy_consent as boolean | undefined) === false} />
          </div>
        </div>

        <div className="border-x border-b border-slate-800 bg-slate-200 px-2 py-0.5 text-xs font-bold">
          10. Applicant&apos;s Signature
        </div>
        <div className="grid grid-cols-12 gap-3 border-x border-b border-slate-800 p-3 text-xs">
          <p className="col-span-12 text-center text-[11px] italic">
            This is to certify that the information stated above is true and correct.
          </p>
          <div className="col-span-9 space-y-8 pt-2">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="col-span-2">
                <p className="min-h-[18px] border-b border-slate-800 font-bold uppercase text-blue-950">
                  {filled ? applicantPrintedName : ''}
                </p>
                <p className="pt-1 text-[10px] font-bold">APPLICANT&apos;S SIGNATURE OVER PRINTED NAME</p>
              </div>
              <div>
                <p className="min-h-[18px] border-b border-slate-800 font-mono font-bold text-blue-950">
                  {filled ? (values.date_accomplished ?? '') : ''}
                </p>
                <p className="pt-1 text-[10px] font-bold">DATE ACCOMPLISHED</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="col-span-2">
                <p className="mb-1 text-left text-[11px] font-bold">Noted by:</p>
                <p className="min-h-[18px] border-b border-slate-800 font-bold uppercase text-blue-950">
                  {filled ? (values.noted_by_name ?? '') : ''}
                </p>
                <p className="pt-1 text-[10px] font-bold">REGISTRAR/SCHOOL ADMINISTRATOR</p>
                <p className="text-[10px]">(Signature Over Printed Name)</p>
              </div>
              <div className="pt-5">
                <p className="min-h-[18px] border-b border-slate-800 font-mono font-bold text-blue-950">
                  {filled ? (values.date_received ?? '') : ''}
                </p>
                <p className="pt-1 text-[10px] font-bold">DATE RECEIVED</p>
              </div>
            </div>
          </div>

          <div className="col-span-3 flex flex-col items-center gap-2">
            <div className="relative flex h-20 w-24 flex-col items-center justify-center overflow-hidden border border-slate-800 bg-slate-50 p-1 text-center text-[10px] text-slate-600 shadow-inner">
              {filled && values.id_picture_url ? (
                <img
                  src={values.id_picture_url}
                  alt="Attached Photo"
                  className="h-full w-full object-cover"
                />
              ) : (
                '1x1 picture taken within the last 6 months'
              )}
            </div>
            <div className="w-24">
              <div className="h-16 border border-slate-800 bg-white" />
              <p className="pt-1 text-center text-[10px] font-bold">Right Thumbmark</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
