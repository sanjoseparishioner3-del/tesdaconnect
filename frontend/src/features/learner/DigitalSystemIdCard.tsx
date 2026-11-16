import React from 'react';
import {
  Download,
  IdCard,
  Mail,
  Phone,
  Printer,
  RotateCw,
  Scissors,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadDigitalSystemIdPdf, type DigitalSystemIdCardProps } from '@/lib/forms/generateDigitalIdPdf';

export type { DigitalSystemIdCardProps };

function buildDeterministicBars(seed: string): number[] {
  const input = seed || 'TESDA-CONNECT';
  const widths: number[] = [];
  for (let i = 0; i < 38; i += 1) {
    const code = input.charCodeAt(i % input.length);
    widths.push(((code + i * 7) % 3) + 1);
  }
  return widths;
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
  verified: 'bg-sky-100 text-sky-800 ring-sky-300',
  submitted: 'bg-indigo-100 text-indigo-800 ring-indigo-300',
  returned: 'bg-rose-100 text-rose-800 ring-rose-300',
};

export function DigitalSystemIdCard(props: DigitalSystemIdCardProps) {
  const [flipped, setFlipped] = React.useState(false);
  const [kick, setKick] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [printModalOpen, setPrintModalOpen] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);

  const sysCode = `TC-${props.systemAccountId.slice(0, 8).toUpperCase()}`;
  const status = (props.enrollmentStatus || 'draft').toLowerCase();
  const isConfirmed = status === 'confirmed';
  const initials = (props.fullName || 'TC')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  const barcodeWidths = React.useMemo(() => buildDeterministicBars(props.systemAccountId), [props.systemAccountId]);

  // Synchronously mount print sheet before browser print dialog snapshots the DOM
  React.useEffect(() => {
    const onBefore = () => setIsPrinting(true);
    const onAfter = () => setIsPrinting(false);
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, []);

  function toggleFlip() {
    setFlipped((f) => !f);
    setKick(true);
    window.setTimeout(() => setKick(false), 900);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadDigitalSystemIdPdf(props);
      toast.success('Digital System Account ID PDF downloaded (works offline too).');
    } finally {
      setDownloading(false);
    }
  }

  function handleTriggerPrint() {
    // Open preview modal first so scholar sees the printable sheet and options
    setPrintModalOpen(true);
  }

  function executeDirectPrint() {
    setIsPrinting(true);
    window.setTimeout(() => {
      window.print();
    }, 100);
  }

  return (
    <>
      {/* ================= INTERACTIVE ON-SCREEN 3D CARD ================= */}
      <div className="flex w-full flex-col items-center gap-4 print:hidden">
        <div className={`id-lanyard-sway relative flex w-full max-w-[330px] flex-col items-center ${kick ? 'is-flipping' : ''}`}>
          {/* Woven school lanyard */}
          <svg viewBox="0 0 260 112" className="h-24 w-60 drop-shadow-sm" aria-hidden="true">
            <defs>
              <linearGradient id="lanyardLeft" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0b224a" />
                <stop offset="50%" stopColor="#143a77" />
                <stop offset="100%" stopColor="#0f295c" />
              </linearGradient>
              <linearGradient id="lanyardRight" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b224a" />
                <stop offset="50%" stopColor="#174288" />
                <stop offset="100%" stopColor="#0f295c" />
              </linearGradient>
              <linearGradient id="metalClip" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#94a3b8" />
                <stop offset="45%" stopColor="#f1f5f9" />
                <stop offset="100%" stopColor="#64748b" />
              </linearGradient>
            </defs>
            <polygon points="34,0 74,0 132,74 112,74" fill="url(#lanyardLeft)" />
            <line x1="42" y1="2" x2="117" y2="73" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 4" opacity="0.85" />
            <text x="66" y="31" fill="#f8fafc" fontSize="7" fontWeight="700" letterSpacing="1.6" transform="rotate(42 66 31)">
              TESDAConnect
            </text>
            <polygon points="226,0 186,0 128,74 148,74" fill="url(#lanyardRight)" />
            <line x1="218" y1="2" x2="143" y2="73" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 4" opacity="0.85" />
            <text x="161" y="53" fill="#f8fafc" fontSize="7" fontWeight="700" letterSpacing="1.6" transform="rotate(-42 161 53)">
              SYSTEM ID
            </text>
            <rect x="114" y="70" width="32" height="12" rx="3" fill="url(#metalClip)" stroke="#475569" strokeWidth="1" />
            <circle cx="130" cy="88" r="5" fill="none" stroke="#64748b" strokeWidth="2.5" />
            <path d="M130 93 L130 105 C130 110 123 110 123 105" fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" />
          </svg>

          {/* 3D flip scene */}
          <div className="id-flip-scene -mt-2 w-full">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={flipped}
              aria-label={flipped ? 'Show front of ID card' : 'Flip ID card to view back'}
              title="I-click para i-flip ang ID"
              onClick={toggleFlip}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleFlip();
                }
              }}
              className={`id-flip-inner cursor-pointer rounded-[22px] outline-none focus-visible:ring-4 focus-visible:ring-teal-400/50 ${flipped ? 'is-flipped' : ''}`}
            >
              {/* ================= FRONT ================= */}
              <div className="id-flip-face" aria-hidden={flipped}>
                <div className="h-full rounded-[22px] border-2 border-slate-300 bg-white/90 p-1.5 shadow-[0_18px_40px_-12px_rgba(15,41,92,0.45)]">
                  <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50">
                    <div className="id-holo-shine absolute inset-0 z-10" />
                    <div className="mx-auto mt-2 h-2.5 w-14 rounded-full border border-slate-300 bg-slate-200/80 shadow-inner" />

                    {/* Header */}
                    <div className="relative mt-2 overflow-hidden bg-gradient-to-br from-[#0f295c] via-[#143a77] to-[#0b224a] px-4 py-3 text-white">
                      <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full bg-amber-400/15" />
                      <div className="relative flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <img src="/tesda-logo.png" alt="" className="h-8 w-8 rounded-full bg-white p-0.5" />
                          <div>
                            <p className="text-sm font-bold leading-tight tracking-tight">
                              TESDA<span className="text-amber-400">Connect</span>
                            </p>
                            <p className="max-w-[170px] truncate text-[9.5px] font-medium uppercase tracking-wider text-slate-200">
                              {props.institutionName || 'TESDA Training Institution'}
                            </p>
                          </div>
                        </div>
                        <span className="rounded bg-amber-400 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-950">
                          {props.institutionCode || 'PORTAL'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-teal-500 to-[#0f295c]" />

                    {/* Photo & identity */}
                    <div className="flex flex-col items-center px-5 pt-4 text-center">
                      <div className="relative">
                        <div className="h-28 w-28 overflow-hidden rounded-xl border-[3px] border-[#0f295c] bg-white shadow-md">
                          {props.photoUrl ? (
                            <img src={props.photoUrl} alt={`${props.fullName} ID`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 text-[#0f295c]">
                              <span className="text-3xl font-extrabold tracking-tight">{initials || 'TC'}</span>
                              <span className="mt-1 px-2 text-[9px] font-medium text-slate-500">2x2 ID Photo</span>
                            </div>
                          )}
                        </div>
                        <span
                          className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${
                            STATUS_STYLES[status] ?? 'bg-amber-100 text-amber-800 ring-amber-300'
                          }`}
                        >
                          {props.enrollmentStatus || 'draft'}
                        </span>
                      </div>

                      <h3 className="mt-4 text-[15px] font-extrabold uppercase leading-tight tracking-tight text-slate-900">
                        {props.fullName || 'Learner Profile'}
                      </h3>
                      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-teal-700">
                        {props.roleLabel || 'Scholar / Student System Account'}
                      </p>
                    </div>

                    {/* Details */}
                    <dl className="mt-3 space-y-1.5 border-t border-slate-200 px-4 py-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">System Account ID</dt>
                        <dd className="font-mono font-bold text-slate-900">{sysCode}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Qualification</dt>
                        <dd className="max-w-[170px] truncate font-semibold text-slate-900" title={props.courseName ?? undefined}>
                          {props.courseName || 'Not assigned yet'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scholar / Batch</dt>
                        <dd className="font-semibold text-slate-800">{props.scholarId || props.batchName || 'Pending batch'}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-1.5">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TESDA Main ULI</dt>
                        <dd className={`font-mono text-[11px] font-semibold ${isConfirmed && props.uliNumber ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {isConfirmed && props.uliNumber ? props.uliNumber : 'Pending TESDA Main ULI'}
                        </dd>
                      </div>
                    </dl>

                    {/* Barcode */}
                    <div className="mt-auto border-t border-slate-200 bg-slate-50 px-4 pb-3 pt-2.5 text-center">
                      <div className="mx-auto flex h-7 items-end justify-center gap-[2px]" aria-hidden="true">
                        {barcodeWidths.map((w, idx) => (
                          <span
                            key={idx}
                            className="inline-block bg-slate-900"
                            style={{ width: `${w}px`, height: idx % 3 === 0 ? '26px' : '20px' }}
                          />
                        ))}
                      </div>
                      <p className="mt-1 font-mono text-[10px] tracking-widest text-slate-600">{props.systemAccountId.slice(0, 18)}</p>
                      <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] leading-snug text-amber-950">
                        <strong className="block font-bold">SYSTEM ACCOUNT DIGITAL ID ONLY</strong>
                        For TCTESDAConnect system account use only. Not an official TESDA certificate or government ID.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================= BACK ================= */}
              <div className="id-flip-face id-flip-back" aria-hidden={!flipped}>
                <div className="h-full rounded-[22px] border-2 border-slate-300 bg-white/90 p-1.5 shadow-[0_18px_40px_-12px_rgba(15,41,92,0.45)]">
                  <div className="relative flex h-full flex-col overflow-hidden rounded-[16px] border border-slate-200 bg-gradient-to-b from-slate-50 to-white text-xs text-slate-700">
                    <div className="id-holo-shine absolute inset-0 z-10" />
                    <div className="mx-auto mt-2 h-2.5 w-14 rounded-full border border-slate-300 bg-slate-200/80 shadow-inner" />

                    <div className="mt-2 bg-gradient-to-br from-[#0f295c] to-[#0b224a] px-4 py-3 text-white">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">TCTESDAConnect Terms of Use</p>
                      <p className="text-sm font-semibold">Digital System Account Card</p>
                    </div>
                    <div className="h-1.5 w-full bg-gradient-to-r from-[#0f295c] via-teal-500 to-amber-500" />

                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px]">
                        <p className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                          <span className="truncate">{props.email || '—'}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                          <span>{props.contactNumber || 'No contact number on file'}</span>
                        </p>
                        <p className="break-all border-t border-dashed border-slate-200 pt-2 font-mono text-[9.5px] text-slate-500">
                          REF · {props.systemAccountId}
                        </p>
                      </div>

                      <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-snug text-amber-950">
                        <p className="flex items-center gap-1.5 font-bold">
                          <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                          Important System Notice
                        </p>
                        <p>
                          This woven-lanyard digital card identifies your active <strong>TCTESDAConnect System Account</strong> inside the portal and training
                          center workflow.
                        </p>
                        <p>
                          Your <strong>Unique Learner Identifier</strong> appears on the front only after enrollment confirmation and
                          encoding by the Registrar or Administrator from TESDA Main.
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10.5px] leading-snug text-slate-600">
                        <p className="font-semibold text-slate-800">If found, please return to:</p>
                        <p>{props.institutionName || 'TESDA Training Institution'} · Registrar&apos;s Office</p>
                      </div>

                      <div className="mt-auto flex items-end justify-between border-t border-slate-200 pt-3">
                        <div className="text-center">
                          <div className="h-6 w-28 border-b border-slate-400 font-serif text-[13px] italic text-slate-700">
                            {(props.fullName || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0]}
                          </div>
                          <p className="mt-0.5 text-[9px] uppercase tracking-wider text-slate-500">Holder Signature</p>
                        </div>
                        <img src="/tesda-logo.png" alt="" className="h-9 w-9 opacity-80" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
          <Button type="button" size="sm" variant="outline" onClick={toggleFlip}>
            <RotateCw className={`h-3.5 w-3.5 transition-transform duration-700 ${flipped ? 'rotate-180' : ''}`} />
            {flipped ? 'Show Front' : 'Flip Card (Back)'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleTriggerPrint}>
            <Printer className="h-3.5 w-3.5" /> Print ID
          </Button>
          <Button type="button" size="sm" onClick={() => void handleDownload()} disabled={downloading}>
            <Download className="h-3.5 w-3.5" /> {downloading ? 'Generating PDF...' : 'Download ID PDF'}
          </Button>
        </div>

        <p className="flex items-center gap-1.5 text-center text-[11px] text-slate-500 print:hidden">
          <IdCard className="h-3.5 w-3.5 text-slate-400" />
          Tip: I-click ang card para i-flip · Gumagana offline kapag naka-cache ang profile.
        </p>
      </div>

      {/* ================= PRINT PREVIEW MODAL ================= */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-sm print:hidden">
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
                  <Printer className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Printable Digital ID Cut-Out Sheet
                  </h3>
                  <p className="text-xs text-slate-500">
                    Official CR80 Vertical Badge (54mm × 86mm) · Front &amp; Back side-by-side with cut guidelines
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPrintModalOpen(false)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Body Preview */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
              <div className="mx-auto max-w-3xl rounded-xl border border-slate-300 bg-white p-6 shadow-md">
                <div className="mb-4 border-b border-slate-200 pb-3 text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Technical Education and Skills Development Authority
                  </p>
                  <p className="text-sm font-extrabold text-[#0f295c]">
                    TCTESDAConnect Digital System Account ID Sheet
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Standard A4 / Letter Cut-Out Sheet · Ready for Laminating or PVC ID Card Slot
                  </p>
                </div>

                {/* Side-by-side preview with fold guide */}
                <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:items-stretch">
                  {/* FRONT CARD PREVIEW */}
                  <div className="w-[270px] shrink-0 rounded-2xl border-2 border-slate-400 bg-white p-1 shadow-sm">
                    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 text-xs">
                      <div className="bg-[#0f295c] px-3 py-2 text-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <img src="/tesda-logo.png" alt="" className="h-6 w-6 rounded-full bg-white p-0.5" />
                            <div>
                              <p className="text-xs font-bold leading-none">TESDA<span className="text-amber-400">Connect</span></p>
                              <p className="text-[8px] uppercase tracking-wider text-slate-200 truncate max-w-[130px]">
                                {props.institutionName || 'TESDA Institution'}
                              </p>
                            </div>
                          </div>
                          <span className="rounded bg-amber-400 px-1.5 py-0.2 text-[8px] font-extrabold text-slate-950">
                            {props.institutionCode || 'PORTAL'}
                          </span>
                        </div>
                      </div>
                      <div className="h-1 bg-gradient-to-r from-amber-500 via-teal-500 to-[#0f295c]" />

                      <div className="flex flex-col items-center p-3 text-center">
                        <div className="h-20 w-20 overflow-hidden rounded-lg border-2 border-[#0f295c] bg-white shadow-sm">
                          {props.photoUrl ? (
                            <img src={props.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-[#0f295c]">
                              <span className="text-xl font-bold">{initials}</span>
                              <span className="text-[7.5px] text-slate-500">2x2 Photo</span>
                            </div>
                          )}
                        </div>
                        <h4 className="mt-2 text-xs font-extrabold uppercase text-slate-900 leading-tight">
                          {props.fullName}
                        </h4>
                        <p className="text-[9px] font-semibold text-teal-700 uppercase">
                          {props.roleLabel || 'Scholar System Account'}
                        </p>
                      </div>

                      <div className="space-y-1 border-t border-slate-200 px-3 py-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Account ID:</span>
                          <span className="font-mono font-bold">{sysCode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Course:</span>
                          <span className="font-medium truncate max-w-[140px]">{props.courseName || 'Unassigned'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Batch:</span>
                          <span className="font-medium">{props.scholarId || props.batchName || 'Pending'}</span>
                        </div>
                        <div className="flex justify-between border-t border-dashed border-slate-200 pt-1">
                          <span className="text-slate-500">TESDA ULI:</span>
                          <span className="font-mono font-semibold">
                            {isConfirmed && props.uliNumber ? props.uliNumber : 'Pending TESDA Main ULI'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-auto border-t border-slate-200 bg-slate-50 p-2 text-center">
                        <div className="mx-auto flex h-5 items-end justify-center gap-[1.5px]" aria-hidden="true">
                          {barcodeWidths.slice(0, 24).map((w, idx) => (
                            <span key={idx} className="inline-block bg-slate-900" style={{ width: `${w}px`, height: '16px' }} />
                          ))}
                        </div>
                        <p className="mt-1 font-mono text-[8px] text-slate-500">{props.systemAccountId.slice(0, 16)}</p>
                        <div className="mt-1 rounded bg-amber-50 p-1 text-[8px] leading-tight text-amber-950 border border-amber-200">
                          <strong>SYSTEM ACCOUNT DIGITAL ID ONLY</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CENTER FOLD/CUT GUIDE */}
                  <div className="flex flex-col items-center justify-center text-slate-400 py-2 sm:py-0">
                    <div className="hidden sm:block h-full border-r-2 border-dashed border-slate-300" />
                    <div className="my-2 flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-700">
                      <Scissors className="h-3 w-3" /> FOLD / CUT
                    </div>
                    <div className="hidden sm:block h-full border-r-2 border-dashed border-slate-300" />
                  </div>

                  {/* BACK CARD PREVIEW */}
                  <div className="w-[270px] shrink-0 rounded-2xl border-2 border-slate-400 bg-white p-1 shadow-sm">
                    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white text-xs p-3">
                      <div className="bg-[#0f295c] -mx-3 -mt-3 p-2.5 text-white">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-amber-300">TCTESDAConnect Terms of Use</p>
                        <p className="text-xs font-semibold">Digital System Account Card</p>
                      </div>
                      <div className="h-1 -mx-3 bg-gradient-to-r from-[#0f295c] via-teal-500 to-amber-500" />

                      <div className="mt-3 space-y-2 text-[10px]">
                        <div className="rounded bg-white p-2 border border-slate-200 space-y-1">
                          <p className="truncate"><strong>Email:</strong> {props.email || '—'}</p>
                          <p><strong>Contact:</strong> {props.contactNumber || 'None'}</p>
                          <p className="font-mono text-[8px] text-slate-400 truncate">REF: {props.systemAccountId}</p>
                        </div>

                        <div className="rounded bg-amber-50 p-2 text-[9px] leading-snug text-amber-950 border border-amber-200">
                          <p className="font-bold flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-amber-700" /> System Notice
                          </p>
                          <p className="mt-0.5">Identifies active TCTESDAConnect System Account. Official ULI appears upon enrollment confirmation by Registrar.</p>
                        </div>

                        <div className="rounded bg-white p-2 text-[9px] border border-slate-200">
                          <p className="font-semibold text-slate-800">Return to:</p>
                          <p className="text-slate-600">{props.institutionName || 'TESDA Center'} · Registrar&apos;s Office</p>
                        </div>
                      </div>

                      <div className="mt-auto flex items-end justify-between border-t border-slate-200 pt-2">
                        <div>
                          <div className="h-5 w-24 border-b border-slate-400 font-serif text-[11px] italic text-slate-700">
                            {(props.fullName || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0]}
                          </div>
                          <p className="text-[8px] uppercase tracking-wider text-slate-500">Holder Signature</p>
                        </div>
                        <img src="/tesda-logo.png" alt="" className="h-7 w-7 opacity-80" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Scissors className="h-3.5 w-3.5" />
                    Paalala sa Pag-print:
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-teal-800">
                    Kapag lumabas ang Print dialog ng browser, siguraduhin pong naka-check ang <strong>&quot;Background graphics&quot;</strong> para lumabas ang bughaw at gintong kulay ng badge. Gupitin sa may dashed lines at i-fold sa gitna para maging back-to-back ID.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 bg-slate-50">
              <Button type="button" variant="outline" size="sm" onClick={() => setPrintModalOpen(false)}>
                Close
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDownload()}
                  disabled={downloading}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {downloading ? 'Downloading...' : 'Download PDF File'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={executeDirectPrint}
                  className="bg-[#0f295c] font-semibold text-white hover:bg-[#143a77]"
                >
                  <Printer className="mr-1.5 h-3.5 w-3.5" />
                  Print ID Now (Open Printer)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= DEDICATED PRINT-ONLY SHEET (#tesda-id-print-sheet) ================= */}
      {/* Mounted only when printModalOpen or isPrinting is active so it never pollutes screen DOM or test queries */}
      {(printModalOpen || isPrinting) && (
        <div id="tesda-id-print-sheet" aria-hidden="true" className="hidden print:block">
          <div className="mx-auto max-w-[760px] p-4 text-slate-900">
            {/* Sheet Institutional Header */}
            <div className="mb-4 border-b-2 border-slate-900 pb-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <img src="/tesda-logo.png" alt="" className="h-8 w-8" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
                    Technical Education and Skills Development Authority
                  </p>
                  <p className="text-sm font-extrabold text-[#0f295c]">
                    TCTESDAConnect Training Operations Workflow System
                  </p>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                Official Digital System Account ID Card Cut-Out Sheet · CR80 Standard Specification (54mm × 86mm)
              </p>
            </div>

            {/* Side-by-side ID Cards container for 1-page paper cutting */}
            <div className="flex items-stretch justify-center gap-6">
              {/* FRONT ID CARD */}
              <div className="w-[300px] shrink-0 rounded-2xl border-2 border-dashed border-slate-400 p-1.5">
                <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-[#0f295c] bg-white text-xs">
                  <div className="bg-[#0f295c] px-3.5 py-2.5 text-white">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <img src="/tesda-logo.png" alt="" className="h-7 w-7 rounded-full bg-white p-0.5" />
                        <div>
                          <p className="text-xs font-bold">TESDA<span className="text-amber-400">Connect</span></p>
                          <p className="text-[8px] uppercase tracking-wider text-slate-200 truncate max-w-[150px]">
                            {props.institutionName || 'TESDA Training Center'}
                          </p>
                        </div>
                      </div>
                      <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[8.5px] font-extrabold text-slate-950">
                        {props.institutionCode || 'PORTAL'}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gradient-to-r from-amber-500 via-teal-500 to-[#0f295c]" />

                  <div className="flex flex-col items-center p-3 text-center">
                    <div className="h-24 w-24 overflow-hidden rounded-xl border-2 border-[#0f295c] bg-white shadow-sm">
                      {props.photoUrl ? (
                        <img src={props.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 text-[#0f295c]">
                          <span className="text-2xl font-bold">{initials}</span>
                          <span className="text-[8px] text-slate-500">2x2 Photo</span>
                        </div>
                      )}
                    </div>
                    <h4 className="mt-2 text-sm font-extrabold uppercase text-slate-900 leading-tight">
                      {props.fullName}
                    </h4>
                    <p className="text-[9.5px] font-semibold text-teal-700 uppercase">
                      {props.roleLabel || 'Scholar System Account'}
                    </p>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-200 px-3.5 py-2 text-[10.5px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">System Account ID:</span>
                      <span className="font-mono font-bold text-slate-900">{sysCode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Qualification:</span>
                      <span className="font-semibold text-slate-900 truncate max-w-[150px]">{props.courseName || 'Not assigned'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Scholar / Batch:</span>
                      <span className="font-semibold text-slate-800">{props.scholarId || props.batchName || 'Pending batch'}</span>
                    </div>
                    <div className="flex justify-between border-t border-dashed border-slate-200 pt-1">
                      <span className="text-slate-500">TESDA Main ULI:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {isConfirmed && props.uliNumber ? props.uliNumber : 'Pending TESDA Main ULI'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-auto border-t border-slate-200 bg-slate-50 p-2.5 text-center">
                    <div className="mx-auto flex h-6 items-end justify-center gap-[2px]" aria-hidden="true">
                      {barcodeWidths.map((w, idx) => (
                        <span key={idx} className="inline-block bg-slate-900" style={{ width: `${w}px`, height: '20px' }} />
                      ))}
                    </div>
                    <p className="mt-1 font-mono text-[9px] tracking-wider text-slate-600">{props.systemAccountId.slice(0, 18)}</p>
                    <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-1 text-[8.5px] text-amber-950 font-bold">
                      SYSTEM ACCOUNT DIGITAL ID ONLY
                    </div>
                  </div>
                </div>
              </div>

              {/* CENTER FOLD / CUT GUIDELINE */}
              <div className="flex flex-col items-center justify-between text-slate-400 py-4">
                <div className="h-full border-r-2 border-dashed border-slate-400" />
                <div className="my-2 flex flex-col items-center gap-1 rounded bg-slate-100 p-1 text-[8px] font-bold text-slate-600 border border-slate-300">
                  <Scissors className="h-3.5 w-3.5" />
                  <span>FOLD</span>
                  <span>HERE</span>
                </div>
                <div className="h-full border-r-2 border-dashed border-slate-400" />
              </div>

              {/* BACK ID CARD */}
              <div className="w-[300px] shrink-0 rounded-2xl border-2 border-dashed border-slate-400 p-1.5">
                <div className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-[#0f295c] bg-white text-xs p-3.5">
                  <div className="bg-[#0f295c] -mx-3.5 -mt-3.5 px-3.5 py-2.5 text-white">
                    <p className="text-[8.5px] font-bold uppercase tracking-wider text-amber-300">TCTESDAConnect Terms of Use</p>
                    <p className="text-xs font-semibold">Digital System Account Card</p>
                  </div>
                  <div className="h-1.5 -mx-3.5 bg-gradient-to-r from-[#0f295c] via-teal-500 to-amber-500" />

                  <div className="mt-3 space-y-2.5 text-[10px]">
                    <div className="rounded-lg border border-slate-200 p-2.5 space-y-1 bg-slate-50">
                      <p className="truncate"><strong>Account Email:</strong> {props.email || '—'}</p>
                      <p><strong>Contact No.:</strong> {props.contactNumber || '—'}</p>
                      <p className="font-mono text-[8.5px] text-slate-500 truncate pt-1 border-t border-dashed border-slate-200">
                        REF · {props.systemAccountId}
                      </p>
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[9.5px] leading-snug text-amber-950">
                      <p className="font-bold flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-700" />
                        Important System Notice
                      </p>
                      <p className="mt-1">
                        This card identifies your active <strong>TCTESDAConnect System Account</strong> inside the training center portal.
                      </p>
                      <p className="mt-0.5">
                        Your Unique Learner Identifier appears on the front only after enrollment confirmation from TESDA Main.
                      </p>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-2 text-[9.5px] text-slate-700">
                      <p className="font-semibold text-slate-900">If found, please return to:</p>
                      <p>{props.institutionName || 'TESDA Center'} · Registrar&apos;s Office</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-end justify-between border-t border-slate-200 pt-3">
                    <div>
                      <div className="h-6 w-28 border-b border-slate-400 font-serif text-[12px] italic text-slate-700">
                        {(props.fullName || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(-1)[0]}
                      </div>
                      <p className="mt-0.5 text-[8.5px] uppercase tracking-wider text-slate-500">Holder Signature</p>
                    </div>
                    <img src="/tesda-logo.png" alt="" className="h-8 w-8 opacity-80" />
                  </div>
                </div>
              </div>
            </div>

            {/* Sheet Footer Guide */}
            <div className="mt-4 border-t border-slate-200 pt-2 text-center text-[9px] text-slate-500">
              ✂️ Cut along outer dashed lines. Fold along center line to create a double-sided ID badge or slide both into a standard vertical pouch.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
