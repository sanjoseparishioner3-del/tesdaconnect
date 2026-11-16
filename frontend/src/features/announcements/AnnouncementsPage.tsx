import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, CloudOff, Download, Eye, Megaphone, Paperclip, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, usePagination } from '@/components/ui/pagination';
import {
  canRolePublishAnnouncements,
  expandAndSanitizeTargetRoles,
  formatTargetRolesSummary,
  getAllowedAnnouncementTargetsForRole,
  type SelectableTargetGroup,
} from '@/lib/announcements/audienceRules';
import { offlineDb } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueueMutation, generateStableId } from '@/lib/sync/syncEngine';
import { formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

interface LiveAnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: string;
  target_roles?: string[];
  announcement_type?: string;
  event_date?: string | null;
  event_time?: string | null;
  is_draft: boolean;
  published_at: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function AnnouncementsPage() {
  const profile = useAuthStore((s) => s.profile);
  const { isOnline, lastSyncedAt } = useConnectivityStore();
  const queryClient = useQueryClient();
  const userId = profile?.id ?? '';

  const allowedTargetOptions = React.useMemo(
    () => getAllowedAnnouncementTargetsForRole(profile?.role),
    [profile?.role],
  );
  const canPublish = canRolePublishAnnouncements(profile?.role);

  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [selectedGroups, setSelectedGroups] = React.useState<SelectableTargetGroup[]>(() =>
    allowedTargetOptions.map((o) => o.id),
  );
  const [announcementType, setAnnouncementType] = React.useState<'general' | 'schedule' | 'deadline'>('general');
  const [eventDate, setEventDate] = React.useState('');
  const [eventTime, setEventTime] = React.useState('');
  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setSelectedGroups(allowedTargetOptions.map((o) => o.id));
  }, [allowedTargetOptions]);

  const liveQuery = useQuery<LiveAnnouncementRow[]>({
    queryKey: ['live-announcements', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('announcements')
        .select('id, title, body, audience, target_roles, announcement_type, event_date, event_time, is_draft, published_at, attachment_path, attachment_name')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
        .returns<LiveAnnouncementRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const cachedBulletins = useLiveQuery(
    () => (userId ? offlineDb.cachedAnnouncements.where('userId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const localDrafts = useLiveQuery(
    () =>
      userId
        ? offlineDb.localDrafts
            .where('userId')
            .equals(userId)
            .filter((d) => d.draftType === 'announcement')
            .toArray()
        : [],
    [userId],
    [],
  );

  function toggleTargetGroup(groupId: SelectableTargetGroup) {
    setSelectedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId],
    );
  }

  async function handleSaveAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!canPublish || !userId) return;
    if (title.trim().length < 3 || body.trim().length < 5) {
      toast.error('Provide a headline and announcement body.');
      return;
    }
    if (selectedGroups.length === 0) {
      toast.error('Select at least one allowed target role.');
      return;
    }
    if (attachmentFile && attachmentFile.size > MAX_ATTACHMENT_BYTES) {
      toast.error('Announcement attachment cannot exceed 10 MB.');
      return;
    }

    const { targetRoles, legacyAudience } = expandAndSanitizeTargetRoles(profile?.role, selectedGroups);
    if (targetRoles.length === 0) {
      toast.error('Target audience is empty or not permitted for your role.');
      return;
    }

    setSaving(true);
    try {
      const draftId = generateStableId();
      const nowIso = new Date().toISOString();
      const instId = profile?.institutions?.[0]?.institutionId ?? null;
      const client = getSupabaseClient();

      if (isOnline && client && isSupabaseConfigured) {
        let attachmentPath: string | null = null;
        if (attachmentFile) {
          const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const prefix = instId ?? 'global';
          attachmentPath = `${prefix}/${userId}/${Date.now()}_${safeName}`;
          const { error: uploadErr } = await client.storage.from('announcement-attachments').upload(attachmentPath, attachmentFile, {
            contentType: attachmentFile.type || 'application/octet-stream',
            upsert: false,
          });
          if (uploadErr) {
            toast.error(uploadErr.message);
            return;
          }
        }

        const { error: insertErr } = await client.from('announcements').insert({
          client_draft_id: draftId,
          institution_id: instId,
          author_user_id: userId,
          title: title.trim(),
          body: body.trim(),
          audience: legacyAudience,
          target_roles: targetRoles,
          announcement_type: announcementType,
          event_date: eventDate || null,
          event_time: eventTime.trim() || null,
          is_draft: false,
          published_at: nowIso,
          attachment_path: attachmentPath,
          attachment_name: attachmentFile?.name ?? null,
          attachment_mime: attachmentFile?.type || null,
          attachment_size: attachmentFile?.size ?? null,
        });
        if (insertErr) {
          toast.error(insertErr.message);
          return;
        }
        toast.success('Published announcement cleanly.');
        await queryClient.invalidateQueries({ queryKey: ['live-announcements'] });
      } else {
        await offlineDb.localDrafts.put({
          clientDraftId: draftId,
          userId,
          draftType: 'announcement',
          title: title.trim(),
          institutionId: instId,
          payload: {
            title: title.trim(),
            body: body.trim(),
            audience: legacyAudience,
            target_roles: targetRoles,
            announcement_type: announcementType,
            event_date: eventDate || null,
            event_time: eventTime.trim() || null,
            // Hard requirement: offline-created announcements remain local drafts until synced online
            is_draft: true,
            published_at: null,
          },
          baseVersion: null,
          status: 'editing',
          updatedAt: nowIso,
          createdAt: nowIso,
        });

        await enqueueMutation({
          userId,
          entityType: 'announcement_draft',
          entityId: draftId,
          operation: 'upsert',
          payload: {
            client_draft_id: draftId,
            institution_id: instId,
            title: title.trim(),
            body: body.trim(),
            audience: legacyAudience,
            target_roles: targetRoles,
            announcement_type: announcementType,
            event_date: eventDate || null,
            event_time: eventTime.trim() || null,
            is_draft: true,
          },
          baseVersion: null,
        });

        toast.success('Saved locally as an UNSENT DRAFT. It will sync to Supabase when online.');
      }

      setTitle('');
      setBody('');
      setEventDate('');
      setEventTime('');
      setAnnouncementType('general');
      setAttachmentFile(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadAttachment(path: string) {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error } = await client.storage.from('announcement-attachments').createSignedUrl(path, 120);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? 'Unable to generate temporary download URL.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const displayedBulletins =
    isOnline && liveQuery.data && liveQuery.data.length > 0
      ? liveQuery.data.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          audienceLabel: formatTargetRolesSummary(a.target_roles, a.audience),
          announcementType: a.announcement_type ?? 'general',
          eventDate: a.event_date ?? null,
          eventTime: a.event_time ?? null,
          isDraft: a.is_draft,
          attachmentPath: a.attachment_path,
          attachmentName: a.attachment_name,
        }))
      : cachedBulletins.map((b) => ({
          id: b.id,
          title: b.title,
          body: b.body,
          audienceLabel: formatTargetRolesSummary(b.targetRoles, b.audience),
          announcementType: b.announcementType ?? 'general',
          eventDate: b.eventDate ?? null,
          eventTime: b.eventTime ?? null,
          isDraft: false,
          attachmentPath: null as string | null,
          attachmentName: null as string | null,
        }));

  const bulletinsPagination = usePagination({
    totalRecords: displayedBulletins.length,
    initialPageSize: 10,
  });
  const pagedBulletins = displayedBulletins.slice(bulletinsPagination.startIndex, bulletinsPagination.endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Megaphone className="h-6 w-6 text-teal-700" />
            Institutional Announcements
          </h1>
          <p className="text-sm text-slate-500">
            {profile?.role === 'registrar'
              ? 'Registrars may announce exclusively to Focal Persons and Scholars / Students.'
              : canPublish
                ? 'Administrators may announce to Scholars / Students, Registrar, and Focal Person. Schedule notices appear on the Calendar.'
                : 'View-only campus announcements and schedule notices from Administrators and Registrars (viewable offline once synced).'}
          </p>
        </div>

        <Badge variant={isOnline ? 'success' : 'warning'}>
          {isOnline ? (
            'Online Delivery Status Verified'
          ) : (
            <span className="inline-flex items-center gap-1">
              <CloudOff className="h-3.5 w-3.5" /> Offline Snapshot ({lastSyncedAt ? formatShortDateTime(lastSyncedAt) : 'Cached'})
            </span>
          )}
        </Badge>
      </div>

      {!canPublish && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <Eye className="h-4 w-4 text-slate-600" />
          View-only bulletin access: Focal Persons and Scholars/Students receive and review announcements published by Administrators and Registrars.
        </div>
      )}

      {canPublish && (
        <Card>
          <CardHeader>
            <CardTitle>Compose Announcement</CardTitle>
            <CardDescription>
              {profile?.role === 'registrar'
                ? 'Allowed targets for Registrar: Focal Person and Scholars / Students only.'
                : 'Allowed targets for Admin: Scholars / Students, Registrar, and Focal Person.'}{' '}
              Add an optional Event Date to display this announcement in Student &amp; Staff Schedules Calendar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAnnouncement} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ann_title">Headline</Label>
                  <Input
                    id="ann_title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Assessment Orientation / Document Submission"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ann_type">Announcement Type</Label>
                  <select
                    id="ann_type"
                    value={announcementType}
                    onChange={(e) => setAnnouncementType(e.target.value as 'general' | 'schedule' | 'deadline')}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="general">General Bulletin</option>
                    <option value="schedule">Scheduled Session / Event</option>
                    <option value="deadline">Requirement / Filing Deadline</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ann_event_date">Calendar Date (Optional)</Label>
                  <Input
                    id="ann_event_date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Allowed Recipient Roles</Label>
                  <div className="flex flex-wrap gap-2">
                    {allowedTargetOptions.map((opt) => {
                      const active = selectedGroups.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => toggleTargetGroup(opt.id)}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ann_event_time">Event Time (Optional)</Label>
                  <Input
                    id="ann_event_time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    placeholder="e.g., 08:30 AM - 11:30 AM"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ann_body">Message Body</Label>
                <textarea
                  id="ann_body"
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  placeholder="Enter verified instructions, venue, dates, or documentary requirements..."
                />
              </div>

              {isOnline && (
                <div className="space-y-1.5">
                  <Label htmlFor="ann_attachment" className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" /> Optional Attachment (&lt;= 10 MB)
                  </Label>
                  <Input id="ann_attachment" type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} />
                </div>
              )}

              <Button type="submit" variant="secondary" disabled={saving}>
                <Send className="h-4 w-4" />
                {isOnline ? 'Publish Announcement' : 'Save Local Draft (Not Yet Delivered)'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {localDrafts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-900">Local Unsynced Drafts ({localDrafts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {localDrafts.map((d) => (
              <div key={d.clientDraftId} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-3">
                <span className="font-medium text-slate-900">{d.title}</span>
                <Badge variant="warning">Draft Only — Not Delivered</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bulletins ({displayedBulletins.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {displayedBulletins.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No bulletins loaded yet. Online Supabase bulletins synchronize here and remain cached for offline reading.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {pagedBulletins.map((b) => (
                  <div key={b.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{b.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {b.isDraft && <Badge variant="warning">Draft</Badge>}
                        {b.eventDate && (
                          <Badge variant="info">
                            <CalendarDays className="h-3 w-3" /> {b.eventDate} {b.eventTime ? `· ${b.eventTime}` : ''}
                          </Badge>
                        )}
                        <Badge variant="outline" className="capitalize">{b.announcementType}</Badge>
                        <Badge variant="secondary">{b.audienceLabel}</Badge>
                      </div>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">{b.body}</p>
                    {b.attachmentPath && isOnline && (
                      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void handleDownloadAttachment(b.attachmentPath!)}>
                        <Download className="h-3.5 w-3.5" /> {b.attachmentName ?? 'Download Attachment'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <Pagination
                  currentPage={bulletinsPagination.currentPage}
                  totalPages={bulletinsPagination.totalPages}
                  totalRecords={displayedBulletins.length}
                  pageSize={bulletinsPagination.pageSize}
                  onPageChange={bulletinsPagination.goToPage}
                  onPageSizeChange={bulletinsPagination.setPageSize}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
