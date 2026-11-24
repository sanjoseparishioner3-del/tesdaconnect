export type HeroPresetKey = 'core' | 'bst' | 'mif' | 'sync';

export interface PresetDashboardSpec {
  key: HeroPresetKey;
  label: string;
  shortLabel: string;
  institutionTag: string;
  headline: string;
  subline: string;
  kpis: ReadonlyArray<{
    label: string;
    value: string;
    delta: string;
  }>;
  workflows: ReadonlyArray<{
    title: string;
    meta: string;
    status: string;
  }>;
}

export const HERO_PRESETS: Record<HeroPresetKey, PresetDashboardSpec> = {
  core: {
    key: 'core',
    label: 'Operations Core',
    shortLabel: 'Unified Core',
    institutionTag: 'BST & MIF Unified Operations',
    headline: 'TESDA Training Operations Hub',
    subline: 'Real-time MIS 03-01 registration intake, 8-document verification, and ULI readiness.',
    kpis: [
      { label: 'Registration', value: 'MIS 03-01', delta: 'Digital intake & PDF' },
      { label: 'Requirements', value: 'Checklist', delta: 'Upload & verification' },
      { label: 'Campuses', value: '2', delta: 'BST & MIF' },
      { label: 'Offline', value: 'Ready', delta: 'Works without signal' },
    ],
    workflows: [
      { title: 'Registration Intake · MIS 03-01 (ver. 2021)', meta: 'Auto-calculated age & PDF ready', status: 'Active' },
      { title: 'Documentary Requirements', meta: 'PSA, educational records, ID, medical + forms', status: 'Checklist' },
      { title: 'Focal Progress & Achievement Charts', meta: 'Competency task validation', status: 'In Training' },
    ],
  },
  bst: {
    key: 'bst',
    label: 'Balli School of Tech (BST)',
    shortLabel: 'BST Campus',
    institutionTag: 'BST · Tech-Voc Operations',
    headline: 'Balli School of Technology',
    subline: 'Shielded Metal Arc Welding NC II and workshop batch coordination, opening next year in Occidental Mindoro.',
    kpis: [
      { label: 'Programs', value: 'SMAW', delta: 'NC II qualification' },
      { label: 'Registration', value: 'MIS 03-01', delta: 'Digital intake' },
      { label: 'ULI', value: 'Registrar', delta: 'Encoded after confirmation' },
      { label: 'Documents', value: 'Checklist', delta: 'Verified by registrar' },
    ],
    workflows: [
      { title: 'Training Schedules', meta: 'Published by the administrator', status: 'Calendar' },
      { title: 'Registrar Dossier & ULI Encoding', meta: 'Locked until status = Confirmed', status: 'Protected' },
      { title: 'Digital System Account ID Cards', meta: 'Lanyard portal ID + offline PDF', status: 'Enabled' },
    ],
  },
  mif: {
    key: 'mif',
    label: 'Mamburao Integrated Farm (MIF)',
    shortLabel: 'MIF Campus',
    institutionTag: 'MIF · Organic Agriculture',
    headline: 'Mamburao Integrated Farm',
    subline: 'Organic Agriculture Production NC II intake, field schedules, and offline chart updates.',
    kpis: [
      { label: 'Program', value: 'OAP NC II', delta: 'Organic Agriculture' },
      { label: 'Schedules', value: 'Calendar', delta: 'Cached for offline' },
      { label: 'Progress', value: 'Charts', delta: 'Managed by Focal Person' },
      { label: 'Field Mode', value: 'Offline', delta: 'Works without signal' },
    ],
    workflows: [
      { title: 'Organic Agriculture Competency Tasks', meta: 'Focal Person progress & achievement logs', status: 'Tracked' },
      { title: 'Farm-Site Schedules & Announcements', meta: 'Calendar events synced offline', status: 'Offline Ready' },
      { title: 'Exportable Trainee Dossiers', meta: 'PDF MIS 03-01 & ExcelJS packs', status: 'Ready' },
    ],
  },
  sync: {
    key: 'sync',
    label: 'Offline Mode',
    shortLabel: 'Offline',
    institutionTag: 'Offline mode',
    headline: 'Keeps working without signal',
    subline: 'Read schedules and announcements, and save forms and files with no internet. They send by themselves later.',
    kpis: [
      { label: 'Sign in', value: 'Once online', delta: 'Then works offline' },
      { label: 'App', value: 'Installable', delta: 'Add to home screen' },
      { label: 'Uploads', value: 'Retry-safe', delta: 'No duplicate files' },
      { label: 'Documents', value: 'On device', delta: 'View & download offline' },
    ],
    workflows: [
      { title: 'Offline sign-in and registration', meta: 'Saved on the device until you reconnect', status: 'Saved' },
      { title: 'Saved schedules and announcements', meta: 'Readable anytime in the field', status: 'Cached' },
      { title: 'Automatic sync when online', meta: 'Files and forms are sent for you', status: 'Auto' },
    ],
  },
};

export interface MorphModuleCardSpec {
  id: string;
  code: string;
  title: string;
  description: string;
  roleTag: string;
  accentLabel: string;
}

export const MORPH_MODULE_CARDS: ReadonlyArray<MorphModuleCardSpec> = [
  {
    id: 'intake',
    code: 'MOD 01',
    title: 'Trainee Intake',
    description: 'Guided 5-step MIS 03-01 (ver. 2021) learner profiling, student inputs, and instant filled or blank PDF generation.',
    roleTag: 'Registrar · Applicant · Admin',
    accentLabel: 'MIS 03-01 Ready',
  },
  {
    id: 'records',
    code: 'MOD 02',
    title: 'Records',
    description: 'Full dossier editor, 8 required TESDA documents viewer/downloader, Digital System ID, and post-confirmation ULI lock.',
    roleTag: 'Registrar · Admin',
    accentLabel: '8 Docs + ULI Guard',
  },
  {
    id: 'batches',
    code: 'MOD 03',
    title: 'Training Batches',
    description: 'Admin-controlled batch creation, campus slot limits, trainer assignment, and overlap validation across BST & MIF.',
    roleTag: 'Admin Managed',
    accentLabel: 'BST & MIF Cohorts',
  },
  {
    id: 'schedules',
    code: 'MOD 04',
    title: 'Schedules',
    description: 'Unified FullCalendar timeline blending Admin training batches and dated announcements, cached cleanly offline.',
    roleTag: 'All Scoped Roles',
    accentLabel: 'Offline Calendar',
  },
  {
    id: 'announcements',
    code: 'MOD 05',
    title: 'Announcements',
    description: 'Role-targeted institutional notices (Admin -> all operational roles; Registrar -> Focal Persons & Scholars).',
    roleTag: 'Admin · Registrar',
    accentLabel: 'Audience Scoped',
  },
  {
    id: 'reports',
    code: 'MOD 06',
    title: 'Reports',
    description: 'Audit-ready ExcelJS workbooks and pdf-lib printable TESDA compliance exports with formula sanitization.',
    roleTag: 'Admin · Registrar · Focal',
    accentLabel: 'ExcelJS & pdf-lib',
  },
];

export interface LandingCapabilityCheck {
  prefersReducedMotion: boolean;
  webglAvailable: boolean;
  lowPerformanceDevice: boolean;
  useSimplifiedMorph: boolean;
}

export function detectLandingCapabilities(): LandingCapabilityCheck {
  if (typeof window === 'undefined') {
    return {
      prefersReducedMotion: false,
      webglAvailable: false,
      lowPerformanceDevice: true,
      useSimplifiedMorph: true,
    };
  }

  const prefersReducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let webglAvailable = false;
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') ?? probeCanvas.getContext('webgl');
    webglAvailable = Boolean(gl);
    const loseExt = gl && 'getExtension' in gl ? gl.getExtension('WEBGL_lose_context') : null;
    if (loseExt && typeof (loseExt as { loseContext?: () => void }).loseContext === 'function') {
      (loseExt as { loseContext: () => void }).loseContext();
    }
  } catch {
    webglAvailable = false;
  }

  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 4;
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  // Very weak phones (<= 2 cores or <= 2 GB) get the light 2D hero instead of WebGL.
  const lowPerformanceDevice = cores <= 2 || (typeof memoryGb === 'number' && memoryGb <= 2);

  return {
    prefersReducedMotion,
    webglAvailable,
    lowPerformanceDevice,
    useSimplifiedMorph: prefersReducedMotion || !webglAvailable || lowPerformanceDevice,
  };
}
