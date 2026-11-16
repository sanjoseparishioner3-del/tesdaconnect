import { BookOpen, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS, type AppRole } from '@/types/auth';

const ROLE_GUIDE_SECTIONS: Array<{
  role: AppRole;
  summary: string;
  responsibilities: string[];
}> = [
  {
    role: 'system_administrator',
    summary: 'Cross-campus oversight across BST and MIF, scheduling control, trainee record/document management, announcements, and security auditing.',
    responsibilities: [
      'Manage Training Schedules & Batches (Admin-exclusive creation/updates), publish announcements to Scholars/Students, Registrar, and Focal Person, and review Trainee Records & all 8 Documentary Requirements.',
      'Encode TESDA Main ULI numbers for trainees ONLY AFTER enrollment status is confirmed.',
      'Monitor Progress & Achievement Charts read-only (managed strictly by the Focal Person) and assign user roles/account statuses.',
    ],
  },
  {
    role: 'institutional_administrator',
    summary: 'Campus-level supervision scoped to assigned institutions across scheduling, trainee records, and campus announcements.',
    responsibilities: [
      'Create and update Training Schedules & Batches, publish announcements to Scholars/Students, Registrar, and Focal Person, and view/edit confirmed trainee records & documents.',
      'Encode TESDA Main ULI numbers strictly after enrollment confirmation and monitor Progress & Achievement Charts read-only.',
    ],
  },
  {
    role: 'registrar',
    summary: 'Authoritative Registration Intake, enrollment verification/confirmation, full student record & document management, and post-confirmation ULI encoding.',
    responsibilities: [
      'Process MIS 03-01 (ver. 2021) Registration Intakes (with filled and blank printable/PDF generation), review all 8 required student documents, and return incomplete filings with clear remarks.',
      'Verify 100% completeness, check potential duplicate profiles manually, confirm Scholar IDs, and encode TESDA Main ULI strictly after enrollment confirmation.',
      'Publish announcements targeted ONLY to Focal Persons and Scholars/Students, and view Admin-managed schedules.',
    ],
  },
  {
    role: 'focal_person',
    summary: 'Exclusive manager of student Progress & Achievement Charts (structured tasks), operational docs, and view-only consumer of schedules & announcements.',
    responsibilities: [
      'Configure Competency Units and Progress / Achievement Chart tasks, score scholar task progress, lock verified units, and submit competency report workflows.',
      'View Admin-assigned training schedules/batches and view announcements from Administrators and Registrars.',
    ],
  },
  {
    role: 'trainer',
    summary: 'Assigned-batch instructional delivery and course learning materials coordination.',
    responsibilities: [
      'Access course materials and schedules for batches assigned to your trainer profile.',
      'Coordinate instructional delivery alongside the Focal Person who manages official Progress & Achievement Charts.',
    ],
  },
  {
    role: 'applicant',
    summary: 'Prospective trainee completing Registration Inputs (MIS 03-01), submitting required documents (offline/online), and tracking enrollment.',
    responsibilities: [
      'Fill out Registration Inputs online or offline to auto-populate Enrollment Confirmation and generate Filled/Blank MIS 03-01 PDFs.',
      'Upload and preview all 8 documentary requirements (<= 10 MB each, cached for offline access) and preview your Digital System Account ID.',
    ],
  },
  {
    role: 'scholar',
    summary: 'Confirmed TESDA student accessing Digital System Account ID, MIS 03-01 records, 8 documents, Progress & Achievement Charts, and Calendar offline/online.',
    responsibilities: [
      'Access your woven-lanyard Digital System Account ID Card (for TCTESDAConnect system account use only) and view your post-confirmation TESDA Main ULI.',
      'Track your Progress & Achievement Chart tasks, view/download your 8 important documents offline or online, and view Schedules & Announcements Calendar.',
    ],
  },
];

export function UserGuidePage() {
  const profile = useAuthStore((s) => s.profile);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0c2352] via-[#12356d] to-teal-700 p-6 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-cyan-200 uppercase">TESDA Connect Help Center</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
              <BookOpen className="h-6 w-6 text-amber-300" />
              User Guide &amp; Role Handbook
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">
              Official role boundaries, workflow sequence, RA 10173 privacy guardrails, and offline PWA synchronization instructions for BST &amp; MIF operations.
            </p>
          </div>
          {profile && (
            <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm backdrop-blur-xs">
              <p className="text-xs text-cyan-100">Signed in role</p>
              <p className="font-bold text-white">{ROLE_LABELS[profile.role]}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-teal-700" /> Core End-to-End Workflow
            </CardTitle>
            <CardDescription>Preserved sequence from Registration Intake through Progress &amp; Achievement tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p><strong>1. Registration Intake &amp; Inputs:</strong> Student or Registrar completes MIS 03-01 (ver. 2021) inputs (printable/downloadable filled or blank) and 8 documentary requirements.</p>
            <p><strong>2. Verification &amp; ULI Lock:</strong> Registrar/Admin verifies 100% completeness, confirms Scholar ID, and encodes TESDA Main ULI strictly after confirmation.</p>
            <p><strong>3. Scheduling &amp; Announcements:</strong> Admins manage schedules and campus announcements (Registrars announce to Focal Person &amp; Scholars/Students only); students view them in the Calendar.</p>
            <p><strong>4. Progress &amp; Achievement Charts:</strong> Focal Person manages unit tasks and scoring; Scholars track tasks and carry their woven-lanyard Digital System Account ID.</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-950">
              <ShieldCheck className="h-5 w-5 text-amber-700" /> Privacy &amp; Offline Rules
            </CardTitle>
            <CardDescription>RA 10173 &amp; shared-device protections enforced across client and PostgreSQL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-950">
            <p><strong>Shared-Device Offline Opt-In:</strong> Offline caching starts OFF by default; signing out clears IndexedDB user caches.</p>
            <p><strong>No Fake Delivery Status:</strong> Announcements written offline remain unpublished local drafts until acknowledged by Supabase online.</p>
            <p><strong>No Auto-Merge or Invented Forms:</strong> Duplicate candidates warn staff for manual review; operational checklists are internal working templates.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {ROLE_GUIDE_SECTIONS.map((sec) => {
          const isCurrent = profile?.role === sec.role;
          return (
            <Card key={sec.role} className={isCurrent ? 'border-teal-600 ring-2 ring-teal-500/20' : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{ROLE_LABELS[sec.role]}</CardTitle>
                  {isCurrent && <Badge variant="success">Your Role</Badge>}
                </div>
                <CardDescription>{sec.summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-600">
                  {sec.responsibilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
