<?php

use App\Models\Course;
use App\Models\EnrollmentApplication;
use App\Models\Institution;
use App\Models\TrainingBatch;
use App\Models\TrainingCertificate;
use App\Models\User;

function createAdminDashboardInstitution(string $code): Institution
{
    return Institution::create([
        'code' => $code,
        'name' => $code === 'BST' ? 'Balli School of Technology' : 'Mamburao Integrated Farm',
        'is_active' => true,
    ]);
}

function createAdminDashboardApplication(Institution $institution, string $ref, string $status, ?string $submittedAt = null): EnrollmentApplication
{
    return EnrollmentApplication::create([
        'reference_no' => $ref,
        'institution_id' => $institution->id,
        'learner_name' => 'Test Learner '.$ref,
        'application_status' => $status,
        'record_completeness' => 100,
        'submitted_at' => $submittedAt ?? now(),
    ]);
}

test('administrator dashboard shows global quick stats and BST versus MIF comparison', function () {
    $administrator = User::factory()->create(['role' => 'administrator']);
    $bst = createAdminDashboardInstitution('BST');
    $mif = createAdminDashboardInstitution('MIF');

    $confirmedBst = createAdminDashboardApplication($bst, 'DASH-BST-001', 'confirmed');
    createAdminDashboardApplication($bst, 'DASH-BST-002', 'submitted');
    createAdminDashboardApplication($mif, 'DASH-MIF-001', 'under_review');
    TrainingCertificate::create([
        'enrollment_application_id' => $confirmedBst->id,
        'status' => 'completed',
    ]);

    $this->actingAs($administrator)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertSee('System overview')
        ->assertSee('Active users')
        ->assertSee('Confirmed enrollees')
        ->assertSee('Pending tasks')
        ->assertSee('Pending verifications')
        ->assertSee('Schedule deadlines')
        ->assertSee('BST vs MIF comparison')
        ->assertSee('Balli School of Technology')
        ->assertSee('Mamburao Integrated Farm')
        ->assertSee('Completion rate = completed certificates ÷ confirmed enrollees.');
});

test('administrator dashboard counts monthly intake and upcoming batch deadlines', function () {
    $administrator = User::factory()->create(['role' => 'administrator']);
    $bst = createAdminDashboardInstitution('BST');
    $course = Course::create([
        'institution_id' => $bst->id,
        'code' => 'DASH-COURSE',
        'name' => 'Dashboard Test Course',
        'training_hours' => 100,
        'is_active' => true,
    ]);

    createAdminDashboardApplication($bst, 'DASH-CURRENT-001', 'submitted', now()->toDateTimeString());
    createAdminDashboardApplication($bst, 'DASH-OLD-001', 'confirmed', now()->subMonths(2)->toDateTimeString());
    TrainingBatch::create([
        'institution_id' => $bst->id,
        'course_id' => $course->id,
        'code' => 'DASH-DEADLINE-001',
        'name' => 'Ending Soon',
        'capacity' => 20,
        'starts_at' => today()->subDays(5)->toDateString(),
        'ends_at' => today()->addDays(10)->toDateString(),
        'status' => 'in_training',
    ]);

    $this->actingAs($administrator)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertSee('This month’s intake')
        ->assertSee('Applications submitted this month')
        ->assertSee('Batch end dates within the next 30 days');
});

test('non-administrator dashboard does not show global BST and MIF oversight', function () {
    $registrar = User::factory()->create(['role' => 'registrar']);

    $this->actingAs($registrar)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertDontSee('System overview')
        ->assertDontSee('BST vs MIF comparison');
});

test('dashboard batch status overview computes fill percentage from actual enrolled records', function () {
    $administrator = User::factory()->create(['role' => 'administrator']);
    $bst = createAdminDashboardInstitution('BST');
    $course = Course::create([
        'institution_id' => $bst->id,
        'code' => 'BATCH-FILL-COURSE',
        'name' => 'Batch Fill Test Course',
        'training_hours' => 120,
        'is_active' => true,
    ]);

    $batch = TrainingBatch::create([
        'institution_id' => $bst->id,
        'course_id' => $course->id,
        'code' => 'BATCH-FILL-01',
        'name' => 'Batch Real Fill Check',
        'capacity' => 10,
        'starts_at' => today()->subDays(2)->toDateString(),
        'ends_at' => today()->addDays(20)->toDateString(),
        'status' => 'in_training',
    ]);

    foreach (range(1, 3) as $index) {
        EnrollmentApplication::create([
            'reference_no' => 'FILL-00'.$index,
            'institution_id' => $bst->id,
            'course_id' => $course->id,
            'training_batch_id' => $batch->id,
            'learner_name' => 'Learner '.$index,
            'application_status' => 'confirmed',
            'record_completeness' => 100,
            'submitted_at' => now(),
        ]);
    }

    $this->actingAs($administrator)
        ->get(route('dashboard'))
        ->assertOk()
        ->assertSee('Batch Real Fill Check')
        ->assertSee('3/10 (30%)')
        ->assertSee('width: 30%', false)
        ->assertDontSee('width: 72%', false);
});
