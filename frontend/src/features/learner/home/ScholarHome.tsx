import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  FileText,
  IdCard,
  Megaphone,
  Upload,
} from 'lucide-react';
import { DigitalSystemIdCard } from '@/features/learner/DigitalSystemIdCard';
import type { LearnerTab } from '@/features/learner/learnerTabs';
import type { DigitalSystemIdCardProps } from '@/lib/forms/generateDigitalIdPdf';
import { formatShortDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface ScholarHomeProps {
  fullName: string;
  roleLabel: string;
  campusName: string;
  campusCode: string;
  isOnline: boolean;
  photoUrl: string | null;
  appStatus: string;
  referenceNo: string | null;
  completeness: number;
  remarks: string | null;
  docsSubmitted: number;
  docsRequired: number;
  docsWaiting: number;
  courseName: string | null;
  scholarId: string | null;
  uli: string | null;
  nextClass: { title: string; startsAt: string; venue: string | null } | null;
  latestAnnouncement: { title: string; body: string; date: string | null } | null;
  isLoading: boolean;
  onNavigate: (tab: LearnerTab) => void;
  onCopy: (text: string, label: string) => void;
  idCardProps: DigitalSystemIdCardProps;
}

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'Submitted', className: 'bg-sky-50 text-sky-800' },
  returned: { label: 'Needs changes', className: 'bg-amber-50 text-amber-800' },
  verified: { label: 'Verified', className: 'bg-teal-50 text-teal-800' },
  confirmed: { label: 'Enrolled', className: 'bg-emerald-50 text-emerald-800' },
};

function initialsOf(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || 'TC';
}

function firstNameOf(name: string): string {
  return name.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? name;
}

function Bar({ value, tone = 'teal' }: { value: number; tone?: 'teal' | 'emerald' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-500', tone === 'emerald' ? 'bg-emerald-500' : 'bg-teal-600')} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-100', className)} aria-hidden="true" />;
}

/**
 * Compact, mobile-first home for scholars and applicants. Every value comes from the learner's
 * own records (server data when online, the device cache when offline); empty states are shown
 * when there is nothing yet.
 */
export function ScholarHome(props: ScholarHomeProps) {
  const {
    fullName, roleLabel, campusName, campusCode, photoUrl, appStatus, referenceNo, completeness, remarks,
    docsSubmitted, docsRequired, docsWaiting, courseName, scholarId, uli, nextClass, latestAnnouncement, isLoading,
    onNavigate, onCopy, idCardProps,
  } = props;
  const [showId, setShowId] = React.useState(false);
  const status = STATUS[appStatus] ?? STATUS.draft!;
  const docsDone = docsRequired > 0 && docsSubmitted >= docsRequired;
  const formDone = completeness >= 100;

  // The single most useful next action, from the learner's real state.
  const nextStep = (() => {
    if (appStatus === 'returned') {
      return { title: 'Your registration was returned', text: 'Review the remarks below and update your form.', cta: 'Update form', tab: 'intake' as LearnerTab };
    }
    if (appStatus === 'draft' && !formDone) {
      return { title: 'Finish your registration form', text: `${completeness}% of the MIS 03-01 form is complete.`, cta: 'Continue form', tab: 'intake' as LearnerTab };
    }
    if (!docsDone) {
      const left = Math.max(0, docsRequired - docsSubmitted);
      return {
        title: 'Upload your documents',
        text: docsWaiting > 0 ? `${docsWaiting} file(s) saved on this device will be sent when you are online.` : `${left} required document${left === 1 ? '' : 's'} still missing.`,
        cta: 'Open documents',
        tab: 'requirements' as LearnerTab,
      };
    }
    if (appStatus === 'draft') {
      return { title: 'Submit your registration', text: 'Your form and documents are ready. Submit them for review.', cta: 'Review and submit', tab: 'intake' as LearnerTab };
    }
    if (appStatus === 'confirmed') return null;
    return { title: 'Under review', text: 'The registrar is checking your registration and documents.', cta: null, tab: null };
  })();

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Greeting */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#0f295c] text-lg font-bold text-white">
            {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : initialsOf(fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">Welcome back</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">{firstNameOf(fullName)}</h1>
            <p className="truncate text-xs text-slate-600">
              {roleLabel} · {campusCode ? `${campusCode} · ` : ''}
              {campusName}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
          {isLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <>
              <span className={cn('rounded-full px-2.5 py-1 font-semibold', status.className)}>{status.label}</span>
              {courseName && <span className="truncate text-slate-600">{courseName}</span>}
              {referenceNo && (
                <button
                  type="button"
                  onClick={() => onCopy(referenceNo, 'Reference number')}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[11px] text-slate-500 hover:bg-slate-100"
                  title="Copy reference number"
                >
                  {referenceNo} <Copy className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {/* Registrar remarks */}
      {remarks && (
        <section className="flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold">Registrar remarks</p>
            <p className="mt-0.5 text-xs leading-relaxed">{remarks}</p>
          </div>
        </section>
      )}

      {/* Next step */}
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        nextStep && (
          <section className="rounded-2xl bg-gradient-to-br from-[#0f295c] to-[#0b4a5c] p-4 text-white shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Next step</p>
            <h2 className="mt-1 text-base font-semibold">{nextStep.title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-200">{nextStep.text}</p>
            {nextStep.cta && nextStep.tab && (
              <button
                type="button"
                onClick={() => onNavigate(nextStep.tab)}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0f295c] active:scale-[0.98]"
              >
                {nextStep.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </section>
        )
      )}

      {/* Progress */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('intake')}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm active:bg-slate-50"
        >
          <div className="flex items-center justify-between">
            <FileText className="h-4 w-4 text-teal-700" aria-hidden="true" />
            <span className="text-sm font-bold text-slate-900">{completeness}%</span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700">Registration form</p>
          <div className="mt-2">
            <Bar value={completeness} tone={formDone ? 'emerald' : 'teal'} />
          </div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('requirements')}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm active:bg-slate-50"
        >
          <div className="flex items-center justify-between">
            <Upload className="h-4 w-4 text-teal-700" aria-hidden="true" />
            <span className="text-sm font-bold text-slate-900">
              {docsSubmitted}/{docsRequired}
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700">Documents</p>
          <div className="mt-2">
            <Bar value={docsRequired ? (docsSubmitted / docsRequired) * 100 : 0} tone={docsDone ? 'emerald' : 'teal'} />
          </div>
        </button>
      </section>

      {/* Coming up */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button type="button" onClick={() => onNavigate('schedules')} className="flex w-full items-start gap-3 p-4 text-left active:bg-slate-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <CalendarDays className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Next class</span>
            {nextClass ? (
              <>
                <span className="block truncate text-sm font-semibold text-slate-900">{nextClass.title}</span>
                <span className="block text-xs text-slate-600">
                  {formatShortDateTime(nextClass.startsAt)}
                  {nextClass.venue ? ` · ${nextClass.venue}` : ''}
                </span>
              </>
            ) : (
              <span className="block text-sm text-slate-500">No upcoming classes yet.</span>
            )}
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
        <div className="border-t border-slate-100" />
        <button type="button" onClick={() => onNavigate('schedules')} className="flex w-full items-start gap-3 p-4 text-left active:bg-slate-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Megaphone className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Latest announcement</span>
            {latestAnnouncement ? (
              <>
                <span className="block truncate text-sm font-semibold text-slate-900">{latestAnnouncement.title}</span>
                <span className="line-clamp-2 text-xs text-slate-600">{latestAnnouncement.body}</span>
              </>
            ) : (
              <span className="block text-sm text-slate-500">No announcements yet.</span>
            )}
          </span>
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </section>

      {/* Identifiers */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scholar ID</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{scholarId ?? 'Assigned after confirmation'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">TESDA ULI</p>
            {uli && appStatus === 'confirmed' && (
              <button type="button" onClick={() => onCopy(uli, 'ULI')} className="text-slate-400 hover:text-slate-700" title="Copy ULI">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
            {uli && appStatus === 'confirmed' ? uli : 'Issued after confirmation'}
          </p>
        </div>
      </section>

      {/* Digital ID */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowId((v) => !v)}
          aria-expanded={showId}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0f295c]/10 text-[#0f295c]">
            <IdCard className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">Digital ID</span>
            <span className="block text-xs text-slate-500">{showId ? 'Tap the card to flip it' : 'Show your digital system ID'}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', showId && 'rotate-180')} aria-hidden="true" />
        </button>
        {showId && (
          <div className="border-t border-slate-100 p-3 sm:p-5">
            <DigitalSystemIdCard {...idCardProps} />
          </div>
        )}
      </section>

      {docsDone && formDone && appStatus === 'confirmed' && (
        <p className="flex items-center justify-center gap-1.5 pb-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Everything is complete. You are enrolled.
        </p>
      )}

      <p className="hidden items-center justify-center gap-1.5 pb-1 text-[11px] text-slate-400 md:flex">
        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Use the tabs above to open your form, documents, progress and schedule.
      </p>
    </div>
  );
}
