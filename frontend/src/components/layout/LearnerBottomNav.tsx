import type React from 'react';
import { CalendarDays, ClipboardCheck, FileText, Home, Upload } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { learnerTabHref, parseLearnerTab, type LearnerTab } from '@/features/learner/learnerTabs';
import { cn } from '@/lib/utils';

const ITEMS: Array<{ tab: LearnerTab; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { tab: 'overview', label: 'Home', Icon: Home },
  { tab: 'intake', label: 'Form', Icon: FileText },
  { tab: 'requirements', label: 'Docs', Icon: Upload },
  { tab: 'progress', label: 'Progress', Icon: ClipboardCheck },
  { tab: 'schedules', label: 'Schedule', Icon: CalendarDays },
];

/**
 * Thumb-reachable bottom tab bar for scholars and applicants on phones. Hidden from
 * md and up, where the portal shows its own section tabs and the sidebar is available.
 */
export function LearnerBottomNav() {
  const location = useLocation();
  const onPortal = location.pathname === '/learner';
  const activeTab = onPortal ? parseLearnerTab(new URLSearchParams(location.search).get('tab')) : null;

  return (
    <nav
      aria-label="Scholar portal"
      className="no-print shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ tab, label, Icon }) => {
          const isActive = activeTab === tab;
          return (
            <li key={tab}>
              <Link
                to={learnerTabHref(tab)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium',
                  isActive ? 'text-[#0f295c]' : 'text-slate-500 active:bg-slate-100',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-[#0f295c]/10',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
