export const LEARNER_TABS = ['overview', 'intake', 'requirements', 'progress', 'schedules'] as const;

export type LearnerTab = (typeof LEARNER_TABS)[number];

export const DEFAULT_LEARNER_TAB: LearnerTab = 'overview';

export function parseLearnerTab(value: string | null | undefined): LearnerTab {
  return LEARNER_TABS.includes(value as LearnerTab) ? (value as LearnerTab) : DEFAULT_LEARNER_TAB;
}

/** URL of a scholar portal section; the tab lives in `?tab=` so it survives reloads and back. */
export function learnerTabHref(tab: LearnerTab): string {
  return tab === DEFAULT_LEARNER_TAB ? '/learner' : `/learner?tab=${tab}`;
}
