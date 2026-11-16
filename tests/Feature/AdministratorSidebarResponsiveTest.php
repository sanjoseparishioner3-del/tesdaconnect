<?php

use App\Models\User;

test('administrator sidebar is wider on desktop and constrained on narrow screens', function () {
    $administrator = User::factory()->create([
        'role' => 'administrator',
        'account_status' => 'active',
    ]);

    $response = $this->actingAs($administrator)->get(route('dashboard'))->assertOk();

    $response
        ->assertSee('--sidebar-width: 19rem', false)
        ->assertSee('width: min(19rem, calc(100vw - 1rem))', false)
        ->assertSee('width: min(18rem, calc(100vw - 0.75rem))', false)
        ->assertSee('overflow-x: hidden', false)
        ->assertSee('overflow-x-hidden', false)
        ->assertSee('overflow-wrap: anywhere', false);
});

test('sidebar groups render always expanded without dropdown toggles or nested scrollbars', function () {
    $sidebar = file_get_contents(resource_path('views/layouts/app/sidebar.blade.php'));

    expect($sidebar)->toBeString()
        ->and($sidebar)->not->toContain('expandable')
        ->and($sidebar)->not->toContain(':expanded="false"')
        ->and($sidebar)->toContain('overflow: visible !important;')
        ->and($sidebar)->toContain('tesda-brand-mark')
        ->and($sidebar)->toContain('color: #102f68 !important;');

    foreach ([
        'heading="DASHBOARD" data-tesda-sidebar-group="dashboard"',
        'heading="ENROLLMENT MONITORING" data-tesda-sidebar-group="enrollment"',
        'heading="SCHEDULING MANAGEMENT" data-tesda-sidebar-group="scheduling"',
        'heading="SYSTEM MONITORING" data-tesda-sidebar-group="system-monitoring"',
        'heading="REPORTS & OVERSIGHT" data-tesda-sidebar-group="reports"',
    ] as $configuration) {
        expect($sidebar)->toContain($configuration);
    }
});

test('administrator sidebar renders all groups directly without localStorage accordion script', function () {
    $administrator = User::factory()->create([
        'role' => 'administrator',
        'account_status' => 'active',
    ]);

    $response = $this->actingAs($administrator)->get(route('dashboard'))->assertOk();

    $response
        ->assertSee('data-tesda-sidebar-group="dashboard"', false)
        ->assertSee('data-tesda-sidebar-group="enrollment"', false)
        ->assertSee('data-tesda-sidebar-group="scheduling"', false)
        ->assertSee('data-tesda-sidebar-group="system-monitoring"', false)
        ->assertSee('data-tesda-sidebar-group="reports"', false)
        ->assertSee('background-color: #ffffff !important', false)
        ->assertSee('color: #102f68 !important', false)
        ->assertDontSee('__tesdaConnectSidebarGroupPersistenceV2', false);
});

test('sidebar typography is normalized across administrator and learner accounts', function () {
    $administrator = User::factory()->create([
        'role' => 'administrator',
        'account_status' => 'active',
    ]);

    $learner = User::factory()->create([
        'role' => 'applicant',
        'account_status' => 'active',
    ]);

    $this->actingAs($administrator)->get(route('dashboard'))->assertOk()
        ->assertSee('font-size: 0.875rem !important', false)
        ->assertSee('font-size: 0.72rem !important', false)
        ->assertSee('Use the same typography for every role', false);

    auth()->logout();

    $this->actingAs($learner)->get(route('dashboard'))->assertOk()
        ->assertSee('font-size: 0.875rem !important', false)
        ->assertSee('font-size: 0.72rem !important', false)
        ->assertSee('Use the same typography for every role', false);
});
