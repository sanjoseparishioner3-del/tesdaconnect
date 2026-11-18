import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, BookOpen, CheckCircle2, Download, FileUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb } from '@/lib/db/dexie';
import { processStaffUploadQueue, saveStaffUpload } from '@/lib/documents/staffUploadQueue';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { refreshReactiveQueueCounts } from '@/lib/sync/connectivityMonitor';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

interface CourseRow {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  qualification_level: string | null;
  training_hours: number | null;
  is_active: boolean;
  archived_at: string | null;
}

interface InstitutionRow {
  id: string;
  code: string;
  name: string;
}

interface MaterialRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  original_name: string;
  storage_path: string;
  size_bytes: number;
  is_published: boolean;
  created_at: string;
}

const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

export function CoursesAndMaterialsPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();

  const canManageMaterials =
    profile?.role === 'system_administrator' ||
    profile?.role === 'institutional_administrator' ||
    profile?.role === 'focal_person' ||
    profile?.role === 'trainer';

  const canManageCatalog =
    profile?.role === 'system_administrator' ||
    profile?.role === 'institutional_administrator' ||
    profile?.role === 'focal_person';

  const [courseFilter, setCourseFilter] = React.useState('');
  const [selectedCourseId, setSelectedCourseId] = React.useState('');
  const [showArchivedCourses, setShowArchivedCourses] = React.useState(false);

  const [newCode, setNewCode] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const [newLevel, setNewLevel] = React.useState('NC II');
  const [newHours, setNewHours] = React.useState('268');
  const [newInstId, setNewInstId] = React.useState('');

  const [materialTitle, setMaterialTitle] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  const institutionsQuery = useQuery<InstitutionRow[]>({
    queryKey: ['course-institutions'],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('institutions')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code', { ascending: true })
        .returns<InstitutionRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const coursesQuery = useQuery<CourseRow[]>({
    queryKey: ['courses-catalog', showArchivedCourses],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      let query = client
        .from('courses')
        .select('id, institution_id, code, name, qualification_level, training_hours, is_active, archived_at')
        .order('code', { ascending: true });
      if (!showArchivedCourses) {
        query = query.is('archived_at', null);
      }
      const { data, error } = await query.returns<CourseRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const materialsQuery = useQuery<MaterialRow[]>({
    queryKey: ['course-materials', selectedCourseId],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      let query = client
        .from('course_materials')
        .select('id, course_id, title, description, original_name, storage_path, size_bytes, is_published, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (selectedCourseId) {
        query = query.eq('course_id', selectedCourseId);
      }

      const { data, error } = await query.returns<MaterialRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Keep the lists on the device so the page opens offline (scholars and staff).
  const userId = profile?.id;
  React.useEffect(() => {
    if (!userId || !coursesQuery.data) return;
    const syncedAt = new Date().toISOString();
    void offlineDb.cachedCourses
      .bulkPut(
        coursesQuery.data.map((c) => ({
          id: c.id,
          userId,
          institutionId: c.institution_id,
          code: c.code,
          name: c.name,
          qualificationLevel: c.qualification_level,
          trainingHours: c.training_hours,
          isActive: c.is_active,
          archivedAt: c.archived_at,
          syncedAt,
        })),
      )
      .catch(() => undefined);
  }, [userId, coursesQuery.data]);
  React.useEffect(() => {
    if (!userId || !materialsQuery.data) return;
    const syncedAt = new Date().toISOString();
    void offlineDb.cachedMaterials
      .bulkPut(
        materialsQuery.data.map((m) => ({
          id: m.id,
          userId,
          courseId: m.course_id,
          title: m.title,
          description: m.description,
          originalName: m.original_name,
          storagePath: m.storage_path,
          sizeBytes: m.size_bytes,
          isPublished: m.is_published,
          createdAt: m.created_at,
          syncedAt,
        })),
      )
      .catch(() => undefined);
  }, [userId, materialsQuery.data]);

  const cachedCourses = useLiveQuery(() => (userId ? offlineDb.cachedCourses.where('userId').equals(userId).toArray() : []), [userId], []);
  const cachedMaterials = useLiveQuery(() => (userId ? offlineDb.cachedMaterials.where('userId').equals(userId).toArray() : []), [userId], []);
  const savedFiles = useLiveQuery(() => (userId ? offlineDb.cachedMaterialFiles.where('userId').equals(userId).toArray() : []), [userId], []);
  const savedFileIds = new Set(savedFiles.map((f) => f.id));

  const courses: CourseRow[] =
    isOnline && coursesQuery.data
      ? coursesQuery.data
      : cachedCourses
          .filter((c) => showArchivedCourses || !c.archivedAt)
          .map((c) => ({
            id: c.id,
            institution_id: c.institutionId,
            code: c.code,
            name: c.name,
            qualification_level: c.qualificationLevel,
            training_hours: c.trainingHours,
            is_active: c.isActive,
            archived_at: c.archivedAt,
          }))
          .sort((a, b) => a.code.localeCompare(b.code));
  const materials: MaterialRow[] =
    isOnline && materialsQuery.data
      ? materialsQuery.data
      : cachedMaterials
          .filter((m) => !selectedCourseId || m.courseId === selectedCourseId)
          .map((m) => ({
            id: m.id,
            course_id: m.courseId,
            title: m.title,
            description: m.description,
            original_name: m.originalName,
            storage_path: m.storagePath,
            size_bytes: m.sizeBytes,
            is_published: m.isPublished,
            created_at: m.createdAt,
          }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const createCourseMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Authenticated session required.');
      const instId = newInstId || profile.institutions?.[0]?.institutionId || institutionsQuery.data?.[0]?.id;
      if (!instId) throw new Error('Select an institution first.');
      if (newCode.trim().length < 2 || newName.trim().length < 3) {
        throw new Error('Provide valid qualification code and course name.');
      }
      const hours = Number.parseInt(newHours, 10);
      const { error } = await client.from('courses').insert({
        institution_id: instId,
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        qualification_level: newLevel.trim() || 'NC II',
        training_hours: Number.isFinite(hours) && hours > 0 ? hours : null,
        is_active: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Course qualification added to institutional catalog.');
      setNewCode('');
      setNewName('');
      await queryClient.invalidateQueries({ queryKey: ['courses-catalog'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleArchiveCourseMutation = useMutation({
    mutationFn: async (course: CourseRow) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase client unavailable.');
      const archiving = !course.archived_at;
      const { error } = await client
        .from('courses')
        .update({
          archived_at: archiving ? new Date().toISOString() : null,
          is_active: !archiving,
        })
        .eq('id', course.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Updated course archive status.');
      await queryClient.invalidateQueries({ queryKey: ['courses-catalog'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Sign in is required.');
      const course = courses.find((c) => c.id === selectedCourseId) ?? courses[0];
      if (!course) throw new Error('Select a course first before uploading materials.');
      if (!selectedFile) throw new Error('Choose a PDF, DOCX, PPTX, or instructional file (<= 20 MB).');
      const file = selectedFile;
      // Local-first: saved on this device immediately (works offline), uploaded in the background.
      await saveStaffUpload({
        userId: profile.id,
        kind: 'course_material',
        label: materialTitle.trim() || file.name,
        bucket: 'course-materials',
        buildPath: (id, name) => `${course.institution_id}/${course.id}/${id}_${name}`,
        file,
        maxBytes: MAX_MATERIAL_BYTES,
        table: 'course_materials',
        buildRow: ({ storagePath, name, mime, size }) => ({
          course_id: course.id,
          uploaded_by_user_id: profile.id,
          title: materialTitle.trim() || name,
          original_name: name,
          storage_path: storagePath,
          mime_type: mime,
          size_bytes: size,
          is_published: true,
        }),
      });
      await refreshReactiveQueueCounts(profile.id);
      if (isOnline) {
        void processStaffUploadQueue(profile.id).then(async (sent) => {
          if (sent > 0) {
            toast.success('Course material uploaded.');
            await queryClient.invalidateQueries({ queryKey: ['course-materials'] });
          }
          await refreshReactiveQueueCounts(profile.id);
        });
      }
    },
    onSuccess: () => {
      toast.success(
        isOnline ? 'Saved. Uploading in the background…' : 'Saved on this device. It will be uploaded when you are back online.',
      );
      setMaterialTitle('');
      setSelectedFile(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleSaveOffline(material: MaterialRow) {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    try {
      const { data, error } = await client.storage.from('course-materials').download(material.storage_path);
      if (error || !data) throw new Error(error?.message ?? 'Unable to download the file.');
      await offlineDb.cachedMaterialFiles.put({
        id: material.id,
        userId,
        blob: data,
        mimeType: data.type || 'application/octet-stream',
        originalName: material.original_name,
        sizeBytes: data.size,
        savedAt: new Date().toISOString(),
      });
      toast.success('Saved for offline use.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save the file for offline use.');
    }
  }

  async function handleOpenOffline(material: MaterialRow) {
    const file = await offlineDb.cachedMaterialFiles.get(material.id);
    if (!file) {
      toast.error('This file is not saved on this device yet.');
      return;
    }
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = file.originalName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleRemoveOffline(material: MaterialRow) {
    await offlineDb.cachedMaterialFiles.delete(material.id);
    toast.success('Removed from this device.');
  }

  async function handleDownload(material: MaterialRow) {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error } = await client.storage.from('course-materials').createSignedUrl(material.storage_path, 120);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? 'Unable to generate short-lived download URL.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const normalizedFilter = courseFilter.trim().toLowerCase();
  const filteredCourses = courses.filter(
    (c) => !normalizedFilter || c.code.toLowerCase().includes(normalizedFilter) || c.name.toLowerCase().includes(normalizedFilter),
  );
  const coursesPagination = usePagination({
    totalRecords: filteredCourses.length,
    initialPageSize: 9,
  });
  const pagedCourses = filteredCourses.slice(coursesPagination.startIndex, coursesPagination.endIndex);

  const filteredMaterials = materials.filter(
    (m) =>
      !normalizedFilter ||
      m.title.toLowerCase().includes(normalizedFilter) ||
      m.original_name.toLowerCase().includes(normalizedFilter),
  );
  const materialsPagination = usePagination({
    totalRecords: filteredMaterials.length,
    initialPageSize: 10,
  });
  const pagedMaterials = filteredMaterials.slice(materialsPagination.startIndex, materialsPagination.endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BookOpen className="h-6 w-6 text-teal-700" />
            Courses &amp; Learning Materials
          </h1>
          <p className="text-sm text-slate-500">
            Qualification setup/archival and private Storage resources (&lt;= 20 MB) scoped to active institutions.
          </p>
        </div>
        <Badge variant={canManageCatalog ? 'secondary' : 'info'}>
          {canManageCatalog ? 'Course Setup Enabled' : canManageMaterials ? 'Material Upload Enabled' : 'Learner Course Access'}
        </Badge>
      </div>

      {canManageCatalog && isSupabaseConfigured && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-teal-700" /> Register Course Qualification
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="course_inst">Institution</Label>
              <select
                id="course_inst"
                value={newInstId || profile?.institutions?.[0]?.institutionId || institutionsQuery.data?.[0]?.id || ''}
                onChange={(e) => setNewInstId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
              >
                {(institutionsQuery.data ?? []).map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.code} — {inst.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="course_code">Code</Label>
              <Input id="course_code" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="EIM-NCII" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="course_name">Qualification Title</Label>
              <Input id="course_name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Electrical Installation & Maintenance NC II" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="course_level">Level</Label>
                <Input id="course_level" value={newLevel} onChange={(e) => setNewLevel(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="course_hours">Hours</Label>
                <Input id="course_hours" type="number" min={1} value={newHours} onChange={(e) => setNewHours(e.target.value)} />
              </div>
            </div>
            <div className="md:col-span-5">
              <Button type="button" size="sm" variant="secondary" disabled={createCourseMutation.isPending || !isOnline} onClick={() => createCourseMutation.mutate()}>
                Add Course Qualification
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileUp className="h-4 w-4 text-teal-700" /> Catalog &amp; Private Bucket <code className="rounded bg-slate-100 px-1">course-materials</code>
          </CardTitle>
          <CardDescription>Course files require verified institutional enrollment or authorized staff access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="search"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              placeholder="Filter programs or instructional modules..."
              className="max-w-md"
            />
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All Authorized Courses</option>
              {filteredCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            {canManageCatalog && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={showArchivedCourses} onChange={(e) => setShowArchivedCourses(e.target.checked)} />
                Show Archived Courses
              </label>
            )}
          </div>

          {canManageMaterials && isSupabaseConfigured && (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="material_title">Module Title</Label>
                <Input
                  id="material_title"
                  placeholder="e.g., CBLM Unit 1: Workplace Safety"
                  value={materialTitle}
                  onChange={(e) => setMaterialTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="material_file">Instructional File (&lt;= 20 MB)</Label>
                <Input
                  id="material_file"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate()}
                >
                  {uploadMutation.isPending ? 'Saving...' : isOnline ? 'Upload Material' : 'Save for upload'}
                </Button>
              </div>
            </div>
          )}

          {filteredCourses.length > 0 && (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                {pagedCourses.map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-teal-800">{c.code}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{c.qualification_level ?? 'TESDA'}</Badge>
                        {c.archived_at && <Badge variant="warning">Archived</Badge>}
                      </div>
                    </div>
                    <p className="mt-1 font-medium text-slate-900">{c.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.training_hours ? `${c.training_hours} training hours` : 'Hours defined per curriculum'}
                    </p>
                    {canManageCatalog && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-2 h-7 px-2 text-xs"
                        onClick={() => toggleArchiveCourseMutation.mutate(c)}
                      >
                        <Archive className="h-3 w-3" /> {c.archived_at ? 'Restore' : 'Archive'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <Pagination
                  currentPage={coursesPagination.currentPage}
                  totalPages={coursesPagination.totalPages}
                  totalRecords={filteredCourses.length}
                  pageSize={coursesPagination.pageSize}
                  onPageChange={coursesPagination.goToPage}
                  onPageSizeChange={coursesPagination.setPageSize}
                />
              </div>
            </div>
          )}

          {filteredMaterials.length === 0 ? (
            <p className="text-sm text-slate-500">
              {isSupabaseConfigured
                ? 'No published course materials match the active course filter.'
                : 'Connect Supabase PostgreSQL & Storage to list and download course materials.'}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {pagedMaterials.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500">
                        {m.original_name} • {(m.size_bytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {savedFileIds.has(m.id) ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Available offline
                          </span>
                          <Button type="button" size="sm" variant="outline" onClick={() => void handleOpenOffline(m)}>
                            <Download className="h-3.5 w-3.5" /> Open
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => void handleRemoveOffline(m)} aria-label="Remove from this device">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {isOnline && (
                            <Button type="button" size="sm" variant="outline" onClick={() => void handleDownload(m)}>
                              <Download className="h-3.5 w-3.5" /> Download
                            </Button>
                          )}
                          {isOnline && (
                            <Button type="button" size="sm" variant="secondary" onClick={() => void handleSaveOffline(m)}>
                              Save for offline use
                            </Button>
                          )}
                          {!isOnline && <span className="text-[11px] text-slate-500">Not saved offline</span>}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <Pagination
                  currentPage={materialsPagination.currentPage}
                  totalPages={materialsPagination.totalPages}
                  totalRecords={filteredMaterials.length}
                  pageSize={materialsPagination.pageSize}
                  onPageChange={materialsPagination.goToPage}
                  onPageSizeChange={materialsPagination.setPageSize}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
