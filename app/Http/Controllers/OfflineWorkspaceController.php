<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use App\Models\AnnouncementView;
use App\Models\AttendanceRecord;
use App\Models\CompetencyProgress;
use App\Models\CompetencyTask;
use App\Models\CompetencyUnit;
use App\Models\Course;
use App\Models\CourseMaterial;
use App\Models\EnrollmentApplication;
use App\Models\Institution;
use App\Models\LearnerDocument;
use App\Models\TrainingBatch;
use App\Models\TrainingCertificate;
use App\Models\User;
use App\Support\InstitutionScope;
use App\Support\TrainingCompletionService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

class OfflineWorkspaceController extends Controller
{
    public function snapshot(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->account_status === 'active', 403);

        $isLearner = $user->hasRole('applicant', 'scholar');

        $payload = [
            'meta' => [
                'generated_at' => now()->toIso8601String(),
                'generated_at_label' => now()->format('M d, Y h:i A'),
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'role_label' => $user->roleLabel(),
                    'initials' => $user->initials(),
                    'is_learner' => $isLearner,
                    'institutions' => $this->userInstitutions($user),
                ],
            ],
            'announcements' => $this->buildAnnouncements($user),
            'schedules' => $this->buildSchedules($user),
            'dashboard' => $this->buildDashboard($user),
            'attendance' => $this->buildAttendance($user),
            'competency' => $this->buildCompetency($user),
            'certification' => $this->buildCertification($user),
            'materials' => $this->buildMaterials($user),
            'documents' => $this->buildDocuments($user),
            'records' => $this->buildStaffRecords($user),
        ];

        return response()->json($payload);
    }

    public function markAnnouncementsRead(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->account_status === 'active' && $user->hasRole('applicant', 'scholar'), 403);

        $validated = $request->validate([
            'announcement_ids' => ['required', 'array', 'min:1', 'max:50'],
            'announcement_ids.*' => ['required', 'integer', 'min:1'],
        ]);

        $application = $this->latestLearnerApplication($user);
        $visibleIds = $this->learnerVisibleAnnouncementsQuery($user, $application)
            ->whereIn('id', $validated['announcement_ids'])
            ->pluck('id');

        $syncedIds = [];
        foreach ($visibleIds as $announcementId) {
            $view = AnnouncementView::query()->firstOrCreate(
                ['announcement_id' => $announcementId, 'user_id' => $user->id],
                ['viewed_at' => now(), 'read_at' => null],
            );

            if ($view->getAttribute('read_at') === null) {
                $view->forceFill(['read_at' => now()])->save();
            }

            $syncedIds[] = (int) $announcementId;
        }

        return response()->json(['synced_ids' => $syncedIds]);
    }

    public function verifyPassword(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->account_status === 'active', 403);

        $validated = $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (! Hash::check($validated['password'], (string) $user->password)) {
            return response()->json([
                'verified' => false,
                'message' => 'The password you entered does not match your account.',
            ], 422);
        }

        return response()->json(['verified' => true]);
    }

    /** @return array<int, array{id: int, code: string, name: string}> */
    private function userInstitutions(User $user): array
    {
        if ($user->hasRole('administrator')) {
            return Institution::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'code', 'name'])
                ->map(fn (Institution $institution): array => [
                    'id' => (int) $institution->id,
                    'code' => (string) $institution->getAttribute('code'),
                    'name' => (string) $institution->getAttribute('name'),
                ])
                ->values()
                ->all();
        }

        return $user->institutions()
            ->where('institutions.is_active', true)
            ->orderBy('institutions.name')
            ->get(['institutions.id', 'institutions.code', 'institutions.name'])
            ->map(fn (Institution $institution): array => [
                'id' => (int) $institution->id,
                'code' => (string) $institution->getAttribute('code'),
                'name' => (string) $institution->getAttribute('name'),
            ])
            ->values()
            ->all();
    }

    private function latestLearnerApplication(User $user): ?EnrollmentApplication
    {
        if (! $user->hasRole('applicant', 'scholar')) {
            return null;
        }

        return EnrollmentApplication::query()
            ->with(['course', 'trainingBatch', 'institution'])
            ->where('learner_user_id', $user->id)
            ->latest()
            ->first();
    }

    /** @return Builder<Announcement> */
    private function learnerVisibleAnnouncementsQuery(User $user, ?EnrollmentApplication $application): Builder
    {
        return Announcement::query()
            ->with(['institution', 'author', 'views' => fn ($views) => $views->where('user_id', $user->id)])
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->whereNull('archived_at')
            ->where(fn (Builder $query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn (Builder $query) => $query->where('audience', 'all')->orWhere('audience', 'scholar'))
            ->where(function (Builder $query) use ($application): void {
                $query->whereNull('institution_id');

                $institutionId = $application?->getAttribute('institution_id');
                if ($institutionId) {
                    $query->orWhere('institution_id', $institutionId);
                }
            });
    }

    /** @return array<int, array<string, mixed>> */
    private function buildAnnouncements(User $user): array
    {
        if ($user->hasRole('applicant', 'scholar')) {
            $application = $this->latestLearnerApplication($user);
            $rows = $this->learnerVisibleAnnouncementsQuery($user, $application)
                ->latest('published_at')
                ->limit(100)
                ->get();

            return $rows->map(fn (Announcement $announcement): array => $this->formatAnnouncement($announcement, true))->values()->all();
        }

        $institutionIds = InstitutionScope::idsFor($user);
        $query = Announcement::query()
            ->with(['institution', 'author'])
            ->withCount('views')
            ->where(function (Builder $scope) use ($institutionIds): void {
                $scope->whereNull('institution_id');
                if ($institutionIds->isNotEmpty()) {
                    $scope->orWhereIn('institution_id', $institutionIds);
                }
            });

        if ($user->hasRole('focal_person')) {
            $query->whereNotNull('published_at')
                ->where('published_at', '<=', now())
                ->whereNull('archived_at')
                ->where(fn (Builder $q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->whereIn('audience', ['all', 'focal_person']);
        } else {
            $query->whereNull('archived_at');
        }

        return $query->latest('published_at')
            ->latest('created_at')
            ->limit(100)
            ->get()
            ->map(fn (Announcement $announcement): array => $this->formatAnnouncement($announcement, false))
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    private function formatAnnouncement(Announcement $announcement, bool $forLearner): array
    {
        $publishedAt = $this->asCarbon($announcement->getAttribute('published_at'));
        $expiresAt = $this->asCarbon($announcement->getAttribute('expires_at'));
        $deadlineAt = $this->asCarbon($announcement->getAttribute('deadline_at'));
        $archivedAt = $this->asCarbon($announcement->getAttribute('archived_at'));

        $status = $archivedAt
            ? 'Archived'
            : ($publishedAt === null
                ? 'Draft'
                : ($publishedAt->isFuture()
                    ? 'Scheduled'
                    : (($expiresAt !== null && $expiresAt->isPast()) ? 'Expired' : 'Published')));

        $isRead = $forLearner
            ? $announcement->views->contains(fn (Model $view): bool => $view->getAttribute('read_at') !== null)
            : true;

        $institution = $announcement->getRelationValue('institution');
        $author = $announcement->getRelationValue('author');
        $audience = (string) $announcement->getAttribute('audience');
        $attachmentPath = $announcement->getAttribute('attachment_path');

        return [
            'id' => (int) $announcement->id,
            'title' => (string) $announcement->getAttribute('title'),
            'body' => (string) $announcement->getAttribute('body'),
            'audience' => $audience,
            'audience_label' => match ($audience) {
                'scholar' => 'Scholars / Students',
                'focal_person' => 'UTPRAS / Focal Persons',
                default => 'All Users',
            },
            'status' => $status,
            'institution_name' => $institution instanceof Institution ? (string) $institution->getAttribute('name') : 'All Institutions',
            'author_name' => $author instanceof User ? $author->name : null,
            'published_at' => $publishedAt?->toIso8601String(),
            'published_at_label' => $publishedAt?->format('M d, Y h:i A') ?? 'Not published',
            'expires_at' => $expiresAt?->toIso8601String(),
            'expires_at_label' => $expiresAt?->format('M d, Y h:i A'),
            'deadline_at' => $deadlineAt?->toIso8601String(),
            'deadline_at_label' => $deadlineAt?->format('M d, Y h:i A'),
            'is_read' => $isRead,
            'views_count' => (int) ($announcement->getAttribute('views_count') ?? 0),
            'attachment_name' => $announcement->getAttribute('attachment_name'),
            'attachment_url' => $attachmentPath ? route('announcements.attachment', $announcement->id) : null,
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function buildSchedules(User $user): array
    {
        if ($user->hasRole('applicant', 'scholar')) {
            $application = $this->latestLearnerApplication($user);
            $batches = collect();

            $assignedBatch = $application?->getRelationValue('trainingBatch');
            if ($assignedBatch instanceof TrainingBatch) {
                $assignedBatch->loadMissing(['course', 'institution']);
                $batches->push($assignedBatch);
            }

            $institutionId = $application?->getAttribute('institution_id');
            if ($institutionId) {
                $institutional = TrainingBatch::query()
                    ->with(['course', 'institution'])
                    ->where('institution_id', $institutionId)
                    ->whereIn('status', ['upcoming', 'in_training'])
                    ->orderBy('starts_at')
                    ->limit(25)
                    ->get();

                $batches = $batches->merge($institutional)->unique('id')->values();
            }

            $assignedBatchId = $application?->getAttribute('training_batch_id');

            return $batches->map(fn (TrainingBatch $batch): array => $this->formatBatch($batch, (int) $assignedBatchId === (int) $batch->id))
                ->values()
                ->all();
        }

        $institutionIds = InstitutionScope::idsFor($user);

        return TrainingBatch::query()
            ->with(['course', 'institution'])
            ->whereIn('institution_id', $institutionIds)
            ->orderByDesc('starts_at')
            ->limit(100)
            ->get()
            ->map(fn (TrainingBatch $batch): array => $this->formatBatch($batch, false))
            ->values()
            ->all();
    }

    /** @return array<string, mixed> */
    private function formatBatch(TrainingBatch $batch, bool $isAssigned): array
    {
        $course = $batch->getRelationValue('course');
        $institution = $batch->getRelationValue('institution');
        $startsAt = $this->asCarbon($batch->getAttribute('starts_at'));
        $endsAt = $this->asCarbon($batch->getAttribute('ends_at'));
        $nextClassAt = $this->asCarbon($batch->getAttribute('next_class_at'));
        $status = (string) $batch->getAttribute('status');

        return [
            'id' => (int) $batch->id,
            'code' => (string) $batch->getAttribute('code'),
            'name' => (string) $batch->getAttribute('name'),
            'course_name' => $course instanceof Course ? (string) $course->getAttribute('name') : 'Unassigned Course',
            'institution_name' => $institution instanceof Institution ? (string) $institution->getAttribute('name') : 'Unassigned Institution',
            'institution_code' => $institution instanceof Institution ? (string) $institution->getAttribute('code') : null,
            'starts_at' => $startsAt?->toDateString(),
            'starts_at_label' => $startsAt?->format('M d, Y'),
            'ends_at' => $endsAt?->toDateString(),
            'ends_at_label' => $endsAt?->format('M d, Y'),
            'next_class_at' => $nextClassAt?->toIso8601String(),
            'next_class_at_label' => $nextClassAt?->format('M d, Y h:i A'),
            'venue' => $batch->getAttribute('venue'),
            'capacity' => (int) $batch->getAttribute('capacity'),
            'status' => $status,
            'status_label' => str($status)->replace('_', ' ')->title()->toString(),
            'is_assigned' => $isAssigned,
        ];
    }

    /** @return array<string, mixed> */
    private function buildDashboard(User $user): array
    {
        if ($user->hasRole('applicant', 'scholar')) {
            $application = $this->latestLearnerApplication($user);
            $certificate = $application
                ? TrainingCertificate::query()->where('enrollment_application_id', $application->id)->first()
                : null;

            $appStatus = (string) ($application?->getAttribute('application_status') ?? '');
            $batch = $application?->getRelationValue('trainingBatch');
            $batchStatus = $batch instanceof TrainingBatch ? (string) $batch->getAttribute('status') : null;
            $certStatus = $certificate?->getAttribute('status');

            $studentStatus = 'Not Started';
            if ($application && $appStatus === 'confirmed') {
                if ($certStatus === 'completed') {
                    $studentStatus = 'Completed';
                } elseif ($certStatus === 'not_completed' || $batchStatus === 'completed') {
                    $studentStatus = 'Not Completed';
                } elseif ($batchStatus === 'in_training') {
                    $studentStatus = 'In Training';
                }
            }

            $nextClassAt = $batch instanceof TrainingBatch ? $this->asCarbon($batch->getAttribute('next_class_at')) : null;
            $hasUpcomingClass = $batch instanceof TrainingBatch
                && $nextClassAt !== null
                && $nextClassAt->isFuture()
                && ! in_array($batchStatus, ['completed', 'cancelled'], true);

            $institution = $application?->getRelationValue('institution');
            $course = $application?->getRelationValue('course');

            return [
                'kind' => 'learner',
                'student_status' => $studentStatus,
                'enrollment' => $application ? [
                    'reference_no' => $application->getAttribute('reference_no'),
                    'scholar_id' => $application->getAttribute('scholar_id'),
                    'application_status' => $appStatus,
                    'status_label' => str($appStatus)->replace('_', ' ')->title()->toString(),
                    'record_completeness' => (int) $application->getAttribute('record_completeness'),
                    'institution_name' => $institution instanceof Institution ? $institution->getAttribute('name') : null,
                    'course_name' => $course instanceof Course ? $course->getAttribute('name') : null,
                    'batch_name' => $batch instanceof TrainingBatch ? $batch->getAttribute('name') : null,
                    'batch_code' => $batch instanceof TrainingBatch ? $batch->getAttribute('code') : null,
                    'next_class_at_label' => $hasUpcomingClass ? $nextClassAt->format('M d, Y h:i A') : null,
                    'venue' => $hasUpcomingClass ? $batch->getAttribute('venue') : null,
                    'remarks' => $application->getAttribute('remarks'),
                ] : null,
            ];
        }

        $institutionIds = InstitutionScope::idsFor($user);

        if ($user->hasRole('administrator')) {
            $monthStart = now()->startOfMonth();
            $monthEnd = now()->endOfMonth();
            $pendingStatuses = ['submitted', 'under_review', 'returned_for_revision'];

            $comparison = Institution::query()
                ->whereIn('code', ['BST', 'MIF'])
                ->get()
                ->map(function (Institution $institution) use ($monthStart, $monthEnd, $pendingStatuses): array {
                    $apps = EnrollmentApplication::query()->where('institution_id', $institution->id);
                    $confirmed = (clone $apps)->where('application_status', 'confirmed')->count();
                    $completed = TrainingCertificate::query()
                        ->where('status', 'completed')
                        ->whereHas('enrollmentApplication', fn (Builder $q) => $q->where('institution_id', $institution->id))
                        ->count();

                    return [
                        'code' => (string) $institution->getAttribute('code'),
                        'name' => (string) $institution->getAttribute('name'),
                        'enrollment_records' => (clone $apps)->count(),
                        'monthly_intake' => (clone $apps)->whereBetween('submitted_at', [$monthStart, $monthEnd])->count(),
                        'pending' => (clone $apps)->whereIn('application_status', $pendingStatuses)->count(),
                        'confirmed' => $confirmed,
                        'completion_rate' => $confirmed === 0 ? 0 : (int) round(min(100, ($completed / $confirmed) * 100)),
                    ];
                })
                ->values()
                ->all();

            return [
                'kind' => 'administrator',
                'metrics' => [
                    ['label' => 'Active Users', 'value' => User::query()->where('account_status', 'active')->count()],
                    ['label' => 'Confirmed Enrollees', 'value' => EnrollmentApplication::query()->where('application_status', 'confirmed')->count()],
                    ['label' => 'Pending Verifications', 'value' => EnrollmentApplication::query()->whereIn('application_status', ['submitted', 'under_review'])->count()],
                    ['label' => 'Upcoming Deadlines (30d)', 'value' => TrainingBatch::query()->whereNotIn('status', ['completed', 'cancelled'])->whereBetween('ends_at', [today()->toDateString(), today()->addDays(30)->toDateString()])->count()],
                ],
                'comparison' => $comparison,
            ];
        }

        $scopedApps = EnrollmentApplication::query()
            ->whereIn('institution_id', $institutionIds)
            ->whereNull('archived_at');

        if ($user->hasRole('focal_person')) {
            $confirmed = (clone $scopedApps)->where('application_status', 'confirmed');

            return [
                'kind' => 'focal_person',
                'metrics' => [
                    ['label' => 'Confirmed Trainees', 'value' => (clone $confirmed)->count()],
                    ['label' => 'Pending Competency Encodings', 'value' => (clone $confirmed)->whereDoesntHave('competencyProgress')->count()],
                    ['label' => 'Pending TESDA Reports', 'value' => (clone $confirmed)->whereDoesntHave('competencyReportSubmission', fn (Builder $q) => $q->where('status', 'submitted'))->count()],
                    ['label' => 'Active / Upcoming Batches', 'value' => TrainingBatch::query()->whereIn('institution_id', $institutionIds)->whereIn('status', ['upcoming', 'in_training'])->count()],
                ],
            ];
        }

        return [
            'kind' => 'registrar',
            'metrics' => [
                ['label' => 'Total Applications', 'value' => (clone $scopedApps)->count()],
                ['label' => 'Pending Review / Verification', 'value' => (clone $scopedApps)->whereIn('application_status', ['submitted', 'under_review'])->count()],
                ['label' => 'Verified (Awaiting Confirm)', 'value' => (clone $scopedApps)->where('application_status', 'verified')->count()],
                ['label' => 'Confirmed Scholars', 'value' => (clone $scopedApps)->where('application_status', 'confirmed')->count()],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function buildAttendance(User $user): array
    {
        if ($user->hasRole('applicant', 'scholar')) {
            $application = $this->latestLearnerApplication($user);
            if (! $application || $application->getAttribute('application_status') !== 'confirmed') {
                return ['available' => false, 'summary' => ['present' => 0, 'absent' => 0, 'late' => 0, 'total' => 0], 'records' => []];
            }

            $counts = AttendanceRecord::query()
                ->where('enrollment_application_id', $application->id)
                ->selectRaw('status, COUNT(*) as aggregate')
                ->groupBy('status')
                ->pluck('aggregate', 'status');

            $records = AttendanceRecord::query()
                ->where('enrollment_application_id', $application->id)
                ->orderByDesc('attendance_date')
                ->limit(30)
                ->get()
                ->map(function (AttendanceRecord $record): array {
                    $date = $this->asCarbon($record->getAttribute('attendance_date'));
                    $status = (string) $record->getAttribute('status');

                    return [
                        'date_label' => $date?->format('M d, Y') ?? '—',
                        'status' => $status,
                        'status_label' => str($status)->headline()->toString(),
                        'remarks' => $record->getAttribute('remarks'),
                    ];
                })
                ->values()
                ->all();

            return [
                'available' => true,
                'summary' => [
                    'present' => (int) ($counts['present'] ?? 0),
                    'absent' => (int) ($counts['absent'] ?? 0),
                    'late' => (int) ($counts['late'] ?? 0),
                    'total' => (int) $counts->sum(),
                ],
                'records' => $records,
            ];
        }

        if (! $user->hasRole('administrator', 'focal_person')) {
            return ['available' => false, 'records' => []];
        }

        $institutionIds = InstitutionScope::idsFor($user);
        $records = AttendanceRecord::query()
            ->with(['enrollmentApplication.trainingBatch'])
            ->whereHas('enrollmentApplication', fn (Builder $q) => $q->whereIn('institution_id', $institutionIds))
            ->orderByDesc('attendance_date')
            ->orderByDesc('id')
            ->limit(60)
            ->get()
            ->map(function (AttendanceRecord $record): array {
                $app = $record->getRelationValue('enrollmentApplication');
                $batch = $app instanceof EnrollmentApplication ? $app->getRelationValue('trainingBatch') : null;
                $date = $this->asCarbon($record->getAttribute('attendance_date'));
                $status = (string) $record->getAttribute('status');

                return [
                    'learner_name' => $app instanceof EnrollmentApplication ? (string) $app->getAttribute('learner_name') : 'Trainee',
                    'batch_name' => $batch instanceof TrainingBatch ? (string) $batch->getAttribute('name') : 'Unassigned',
                    'date_label' => $date?->format('M d, Y') ?? '—',
                    'status' => $status,
                    'status_label' => str($status)->headline()->toString(),
                    'remarks' => $record->getAttribute('remarks'),
                ];
            })
            ->values()
            ->all();

        return ['available' => true, 'records' => $records];
    }

    /** @return array<string, mixed> */
    private function buildCompetency(User $user): array
    {
        if (! $user->hasRole('applicant', 'scholar')) {
            return ['available' => false, 'summary' => null, 'units' => []];
        }

        $application = $this->latestLearnerApplication($user);
        $courseId = $application?->getAttribute('course_id');
        if (! $application || $application->getAttribute('application_status') !== 'confirmed' || ! $courseId) {
            return ['available' => false, 'summary' => null, 'units' => []];
        }

        $units = CompetencyUnit::query()
            ->where('course_id', $courseId)
            ->with(['tasks' => fn ($query) => $query->where('chart_type', 'progress')->with(['progressRecords' => fn ($progress) => $progress->where('enrollment_application_id', $application->id)])])
            ->orderBy('sort_order')
            ->get();

        $allTasks = $units->flatMap(fn (CompetencyUnit $unit) => $unit->tasks);
        $total = $allTasks->count();
        $competent = $allTasks->filter(function (Model $task): bool {
            $firstProgress = $task instanceof CompetencyTask ? $task->progressRecords->first() : null;
            $status = $firstProgress instanceof CompetencyProgress ? $firstProgress->getAttribute('status') : null;

            return in_array($status, ['competent', 'submitted_output_correct'], true);
        })->count();
        $assessed = $allTasks->filter(function (Model $task): bool {
            $firstProgress = $task instanceof CompetencyTask ? $task->progressRecords->first() : null;
            $status = $firstProgress instanceof CompetencyProgress ? ($firstProgress->getAttribute('status') ?? 'not_assessed') : 'not_assessed';

            return $status !== 'not_assessed';
        })->count();

        $course = $application->getRelationValue('course');

        return [
            'available' => true,
            'course_name' => $course instanceof Course ? $course->getAttribute('name') : null,
            'summary' => [
                'total' => $total,
                'competent' => $competent,
                'assessed' => $assessed,
                'remaining' => max(0, $total - $competent),
                'percent' => $total > 0 ? (int) round(($competent / $total) * 100) : 0,
            ],
            'units' => $units->map(fn (CompetencyUnit $unit): array => [
                'unit_number' => (int) $unit->getAttribute('unit_number'),
                'name' => (string) $unit->getAttribute('name'),
                'tasks' => $unit->tasks->map(function (Model $task): array {
                    $firstProgress = $task instanceof CompetencyTask ? $task->progressRecords->first() : null;
                    $status = $firstProgress instanceof CompetencyProgress
                        ? (string) ($firstProgress->getAttribute('status') ?? 'not_assessed')
                        : 'not_assessed';
                    $label = in_array($status, ['competent', 'submitted_output_correct'], true)
                        ? 'Competent'
                        : ($status === 'not_yet_competent' ? 'Not Yet Competent' : 'Not Assessed');

                    return [
                        'name' => (string) $task->getAttribute('name'),
                        'status' => $status,
                        'label' => $label,
                    ];
                })->values()->all(),
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function buildCertification(User $user): array
    {
        if (! $user->hasRole('applicant', 'scholar')) {
            return ['available' => false];
        }

        $application = $this->latestLearnerApplication($user);
        if (! $application || $application->getAttribute('application_status') !== 'confirmed') {
            return ['available' => false];
        }

        $certificate = TrainingCertificate::query()
            ->where('enrollment_application_id', $application->id)
            ->first();
        $eligibility = app(TrainingCompletionService::class)->assess($application);
        $issuedAt = $this->asCarbon($certificate?->getAttribute('issued_at'));
        $pendingUnits = $certificate?->getAttribute('pending_units');

        return [
            'available' => true,
            'status' => $certificate?->getAttribute('status') ?? ($eligibility['eligible'] ? 'eligible' : 'pending'),
            'certificate_number' => $certificate?->getAttribute('certificate_number'),
            'issued_at_label' => $issuedAt?->format('M d, Y'),
            'eligible' => (bool) $eligibility['eligible'],
            'pending_units' => is_array($pendingUnits) && count($pendingUnits)
                ? $pendingUnits
                : $eligibility['pending_units'],
            'reason' => $certificate?->getAttribute('reason'),
        ];
    }

    /** @return array<int, array<string, mixed>> */
    private function buildMaterials(User $user): array
    {
        if (! $user->hasRole('applicant', 'scholar')) {
            return [];
        }

        $application = EnrollmentApplication::query()
            ->where('learner_user_id', $user->id)
            ->where('application_status', 'confirmed')
            ->latest('confirmed_at')
            ->latest('id')
            ->first();

        $courseId = $application?->getAttribute('course_id');
        if (! $application || ! $courseId) {
            return [];
        }

        return CourseMaterial::query()
            ->where('course_id', $courseId)
            ->where('is_published', true)
            ->latest()
            ->limit(50)
            ->get()
            ->map(function (CourseMaterial $material): array {
                $createdAt = $this->asCarbon($material->getAttribute('created_at'));

                return [
                    'id' => (int) $material->id,
                    'title' => (string) $material->getAttribute('title'),
                    'description' => $material->getAttribute('description'),
                    'original_name' => (string) $material->getAttribute('original_name'),
                    'size_kb' => (int) round(((int) $material->getAttribute('size_bytes')) / 1024),
                    'created_at_label' => $createdAt?->format('M d, Y'),
                    'download_url' => route('course-materials.download', $material),
                ];
            })
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function buildDocuments(User $user): array
    {
        if (! $user->hasRole('applicant', 'scholar')) {
            return [];
        }

        return LearnerDocument::query()
            ->where('user_id', $user->id)
            ->latest()
            ->limit(30)
            ->get()
            ->map(function (LearnerDocument $document): array {
                $reviewedAt = $this->asCarbon($document->getAttribute('reviewed_at'));
                $status = (string) $document->getAttribute('status');

                return [
                    'id' => (int) $document->id,
                    'document_type' => str((string) $document->getAttribute('document_type'))->replace('_', ' ')->title()->toString(),
                    'original_name' => (string) $document->getAttribute('original_name'),
                    'status' => $status,
                    'status_label' => str($status)->headline()->toString(),
                    'remarks' => $document->getAttribute('remarks'),
                    'reviewed_at_label' => $reviewedAt?->format('M d, Y h:i A'),
                ];
            })
            ->values()
            ->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function buildStaffRecords(User $user): array
    {
        if (! $user->hasRole('administrator', 'registrar', 'focal_person')) {
            return [];
        }

        $institutionIds = InstitutionScope::idsFor($user);
        $query = EnrollmentApplication::query()
            ->with(['institution', 'course', 'trainingBatch'])
            ->whereIn('institution_id', $institutionIds)
            ->whereNull('archived_at');

        if ($user->hasRole('focal_person')) {
            $query->where('application_status', 'confirmed');
        }

        return $query->latest('updated_at')
            ->limit(100)
            ->get()
            ->map(function (EnrollmentApplication $application): array {
                $institution = $application->getRelationValue('institution');
                $course = $application->getRelationValue('course');
                $batch = $application->getRelationValue('trainingBatch');
                $status = (string) $application->getAttribute('application_status');

                return [
                    'id' => (int) $application->id,
                    'reference_no' => (string) $application->getAttribute('reference_no'),
                    'scholar_id' => $application->getAttribute('scholar_id'),
                    'learner_name' => (string) $application->getAttribute('learner_name'),
                    'email' => $application->getAttribute('email'),
                    'contact_number' => $application->getAttribute('contact_number'),
                    'institution_name' => $institution instanceof Institution ? $institution->getAttribute('name') : null,
                    'course_name' => $course instanceof Course ? $course->getAttribute('name') : null,
                    'batch_name' => $batch instanceof TrainingBatch ? $batch->getAttribute('name') : null,
                    'application_status' => $status,
                    'status_label' => str($status)->replace('_', ' ')->title()->toString(),
                    'record_completeness' => (int) $application->getAttribute('record_completeness'),
                ];
            })
            ->values()
            ->all();
    }

    private function asCarbon(mixed $value): ?Carbon
    {
        if ($value instanceof Carbon) {
            return $value;
        }
        if ($value instanceof \DateTimeInterface) {
            return Carbon::instance($value);
        }
        if (is_string($value) && $value !== '') {
            return Carbon::parse($value);
        }

        return null;
    }
}
