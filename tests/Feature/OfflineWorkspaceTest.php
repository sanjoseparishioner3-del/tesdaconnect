<?php

use App\Models\Announcement;
use App\Models\AnnouncementView;
use App\Models\AttendanceRecord;
use App\Models\Course;
use App\Models\EnrollmentApplication;
use App\Models\Institution;
use App\Models\TrainingBatch;
use App\Models\User;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

function createOfflineWorkspaceFixture(): array
{
    $suffix = strtoupper(Str::random(6));
    $institution = Institution::create([
        'code' => 'OFF-'.$suffix,
        'name' => 'Offline Institution '.$suffix,
        'is_active' => true,
    ]);
    $otherInstitution = Institution::create([
        'code' => 'OTH-'.$suffix,
        'name' => 'Other Institution '.$suffix,
        'is_active' => true,
    ]);
    $course = Course::create([
        'institution_id' => $institution->id,
        'code' => 'OFF-CRS-'.$suffix,
        'name' => 'Agricultural Crops Production NC II',
        'qualification_level' => 'NC II',
        'training_hours' => 336,
        'is_active' => true,
    ]);
    $batch = TrainingBatch::create([
        'institution_id' => $institution->id,
        'course_id' => $course->id,
        'code' => 'OFF-BAT-'.$suffix,
        'name' => 'Batch '.$suffix,
        'capacity' => 25,
        'starts_at' => now()->subDays(3)->toDateString(),
        'ends_at' => now()->addMonths(2)->toDateString(),
        'next_class_at' => now()->addDays(2),
        'venue' => 'Room 101',
        'status' => 'in_training',
    ]);

    $learner = User::factory()->create(['role' => 'scholar', 'account_status' => 'active']);
    $application = EnrollmentApplication::create([
        'reference_no' => 'OFF-REF-'.$suffix,
        'learner_user_id' => $learner->id,
        'institution_id' => $institution->id,
        'course_id' => $course->id,
        'training_batch_id' => $batch->id,
        'learner_name' => $learner->name,
        'email' => $learner->email,
        'application_status' => 'confirmed',
        'record_completeness' => 100,
        'confirmed_at' => now(),
        'scholar_id' => 'SCH-'.$suffix,
    ]);

    $focal = User::factory()->create(['role' => 'focal_person', 'account_status' => 'active']);
    $focal->institutions()->attach($institution->id, ['is_primary' => true]);

    $visibleAnnouncement = Announcement::create([
        'institution_id' => $institution->id,
        'author_user_id' => $focal->id,
        'title' => 'Orientation Notice '.$suffix,
        'body' => 'Please bring your ID tomorrow.',
        'audience' => 'scholar',
        'published_at' => now()->subHour(),
        'deadline_at' => now()->addDays(3),
    ]);

    $otherAnnouncement = Announcement::create([
        'institution_id' => $otherInstitution->id,
        'author_user_id' => $focal->id,
        'title' => 'Other Campus Notice '.$suffix,
        'body' => 'Not for this scholar.',
        'audience' => 'scholar',
        'published_at' => now()->subHour(),
    ]);

    $staffOnlyAnnouncement = Announcement::create([
        'institution_id' => $institution->id,
        'author_user_id' => $focal->id,
        'title' => 'Focal Briefing '.$suffix,
        'body' => 'Staff only meeting.',
        'audience' => 'focal_person',
        'published_at' => now()->subHour(),
    ]);

    AttendanceRecord::create([
        'enrollment_application_id' => $application->id,
        'attendance_date' => now()->toDateString(),
        'status' => 'present',
        'remarks' => 'On time',
        'recorded_by_user_id' => $focal->id,
    ]);

    return compact(
        'institution',
        'otherInstitution',
        'course',
        'batch',
        'learner',
        'application',
        'focal',
        'visibleAnnouncement',
        'otherAnnouncement',
        'staffOnlyAnnouncement'
    );
}

test('guests cannot access offline workspace sync endpoints', function () {
    $this->getJson(route('offline-sync.snapshot'))->assertUnauthorized();
    $this->postJson(route('offline-sync.announcements.mark-read'), ['announcement_ids' => [1]])->assertUnauthorized();
    $this->postJson(route('offline-sync.verify-password'), ['password' => 'password'])->assertUnauthorized();
});

test('learner receives scoped announcements, schedules, and attendance in offline snapshot', function () {
    $fixture = createOfflineWorkspaceFixture();

    $response = $this->actingAs($fixture['learner'])
        ->getJson(route('offline-sync.snapshot'))
        ->assertOk()
        ->assertJsonPath('meta.user.id', $fixture['learner']->id)
        ->assertJsonPath('meta.user.is_learner', true)
        ->assertJsonPath('dashboard.enrollment.scholar_id', $fixture['application']->scholar_id)
        ->assertJsonPath('attendance.summary.present', 1);

    $titles = collect($response->json('announcements'))->pluck('title');
    expect($titles)->toContain($fixture['visibleAnnouncement']->title)
        ->not->toContain($fixture['otherAnnouncement']->title)
        ->not->toContain($fixture['staffOnlyAnnouncement']->title);

    $batchCodes = collect($response->json('schedules'))->pluck('code');
    expect($batchCodes)->toContain($fixture['batch']->code);
});

test('learner can queue and sync announcement read receipts when back online', function () {
    $fixture = createOfflineWorkspaceFixture();

    $this->actingAs($fixture['learner'])
        ->postJson(route('offline-sync.announcements.mark-read'), [
            'announcement_ids' => [
                $fixture['visibleAnnouncement']->id,
                $fixture['otherAnnouncement']->id,
            ],
        ])
        ->assertOk()
        ->assertJsonPath('synced_ids', [$fixture['visibleAnnouncement']->id]);

    $view = AnnouncementView::query()
        ->where('announcement_id', $fixture['visibleAnnouncement']->id)
        ->where('user_id', $fixture['learner']->id)
        ->first();

    expect($view)->not->toBeNull()
        ->and($view->read_at)->not->toBeNull();

    expect(AnnouncementView::query()
        ->where('announcement_id', $fixture['otherAnnouncement']->id)
        ->where('user_id', $fixture['learner']->id)
        ->exists())->toBeFalse();
});

test('staff receives institution-scoped records in offline snapshot and cannot call learner mark-read', function () {
    $fixture = createOfflineWorkspaceFixture();

    $response = $this->actingAs($fixture['focal'])
        ->getJson(route('offline-sync.snapshot'))
        ->assertOk()
        ->assertJsonPath('meta.user.is_learner', false)
        ->assertJsonPath('dashboard.kind', 'focal_person');

    $titles = collect($response->json('announcements'))->pluck('title');
    expect($titles)->toContain($fixture['staffOnlyAnnouncement']->title)
        ->not->toContain($fixture['otherAnnouncement']->title);

    $learnerNames = collect($response->json('records'))->pluck('learner_name');
    expect($learnerNames)->toContain($fixture['learner']->name);

    $this->actingAs($fixture['focal'])
        ->postJson(route('offline-sync.announcements.mark-read'), [
            'announcement_ids' => [$fixture['visibleAnnouncement']->id],
        ])
        ->assertForbidden();
});

test('signed in users can verify their current password to enable offline sign-in', function () {
    $user = User::factory()->create(['account_status' => 'active']);

    $this->actingAs($user)
        ->postJson(route('offline-sync.verify-password'), ['password' => 'password'])
        ->assertOk()
        ->assertJsonPath('verified', true);

    $this->actingAs($user)
        ->postJson(route('offline-sync.verify-password'), ['password' => 'wrong-password'])
        ->assertStatus(422)
        ->assertJsonPath('verified', false);
});

test('offline login and mobile workspace assets are linked and present', function () {
    expect(File::exists(public_path('offline-app.js')))->toBeTrue()
        ->and(File::exists(public_path('offline.html')))->toBeTrue()
        ->and(File::get(resource_path('views/partials/head.blade.php')))->toContain('offline-app.js')
        ->and(File::get(resource_path('views/pages/auth/login.blade.php')))->toContain('data-tesda-login-form')
        ->and(File::get(public_path('offline.html')))->toContain('offline-login-form')
        ->and(File::get(public_path('service-worker.js')))->toContain('offline-app.js');
});
