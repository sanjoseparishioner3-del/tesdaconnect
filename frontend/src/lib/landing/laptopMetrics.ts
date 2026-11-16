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
      { label: 'MIS 03-01 Intakes', value: '148', delta: 'Ready for review' },
      { label: 'Confirmed Scholars', value: '112', delta: 'ULI eligible' },
      { label: 'Active Batches', value: '8', delta: 'BST & MIF' },
      { label: 'Offline Queue', value: 'Synced', delta: 'IndexedDB active' },
    ],
    workflows: [
      { title: 'Registration Intake · MIS 03-01 (ver. 2021)', meta: 'Auto-calculated age & PDF ready', status: 'Active' },
      { title: 'Documentary Requirements (8 Required)', meta: 'PSA, Edu Records, ID, Medical + forms', status: 'Verified' },
      { title: 'Focal Progress & Achievement Charts', meta: 'Competency task validation', status: 'In Training' },
    ],
  },
  bst: {
    key: 'bst',
    label: 'Balli School of Tech (BST)',
    shortLabel: 'BST Campus',
    institutionTag: 'BST · Tech-Voc Operations',
    headline: 'Balli School of Technology',
    subline: 'Welding, Automotive Servicing, and laboratory batch coordination in Occidental Mindoro.',
    kpis: [
      { label: 'BST Applications', value: '84', delta: 'SMAW & Auto NC II' },
      { label: 'Confirmed Batches', value: '5', delta: 'Workshop labs' },
      { label: 'Post-Confirm ULI', value: '76', delta: 'TESDA Main issued' },
      { label: 'Docs Approved', value: '94%', delta: '8-item checklist' },
    ],
    workflows: [
      { title: 'SMAW-NCII Workshop Orientation', meta: 'Admin Scheduled · Laboratory Bay 2', status: 'Scheduled' },
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
      { label: 'MIF Scholars', value: '64', delta: 'OAP NC II Cohort' },
      { label: 'Field Schedules', value: '3', delta: 'Calendar synced' },
      { label: 'Progress Charts', value: '18', delta: 'Focal managed' },
      { label: 'Field Offline Mode', value: 'Ready', delta: 'Zero-signal safe' },
    ],
    workflows: [
      { title: 'Organic Agriculture Competency Tasks', meta: 'Focal Person progress & achievement logs', status: 'Tracked' },
      { title: 'Farm-Site Schedules & Announcements', meta: 'Calendar events synced offline', status: 'Offline Ready' },
      { title: 'Exportable Trainee Dossiers', meta: 'PDF MIS 03-01 & ExcelJS packs', status: 'Ready' },
    ],
  },
  sync: {
    key: 'sync',
    label: 'Offline Sync Engine',
    shortLabel: 'Offline PWA',
    institutionTag: 'Dexie.js + Workbox Engine',
    headline: 'Conflict-Safe Offline Sync',
    subline: 'View schedules, announcements, docs, and queue MIS 03-01 submissions without internet.',
    kpis: [
      { label: 'Local Vault', value: 'PBKDF2', delta: '12h TTL protection' },
      { label: 'Precached Assets', value: 'PWA', delta: 'Workbox SW active' },
      { label: 'Idempotent Queue', value: '0 Err', delta: 'Conflict guard on' },
      { label: 'Offline Docs', value: 'Cached', delta: 'Blob view/download' },
    ],
    workflows: [
      { title: 'Offline Login & Registration Intake', meta: 'Queued cleanly in IndexedDB outbox', status: 'Buffered' },
      { title: 'Offline Schedule & Announcement Cache', meta: 'Readable anytime in field centers', status: 'Cached' },
      { title: 'Foreground Reconnect Synchronization', meta: 'Manual conflict check on version drift', status: 'Guarded' },
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
  const lowPerformanceDevice = cores <= 1;

  return {
    prefersReducedMotion,
    webglAvailable,
    lowPerformanceDevice,
    useSimplifiedMorph: prefersReducedMotion || !webglAvailable || lowPerformanceDevice,
  };
}
