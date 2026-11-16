<?php

use App\Http\Controllers\OfflineCompetencyProgressSyncController;
use App\Http\Controllers\OfflineWorkspaceController;
use Illuminate\Support\Facades\Route;

Route::post('/offline-sync/competency-progress', [OfflineCompetencyProgressSyncController::class, 'store'])
    ->middleware(['auth', 'active', 'role:administrator,focal_person'])
    ->name('offline-sync.competency-progress');

Route::middleware(['auth', 'active'])->group(function (): void {
    Route::get('/offline-sync/snapshot', [OfflineWorkspaceController::class, 'snapshot'])
        ->name('offline-sync.snapshot');

    Route::post('/offline-sync/announcements/mark-read', [OfflineWorkspaceController::class, 'markAnnouncementsRead'])
        ->middleware('role:applicant,scholar')
        ->name('offline-sync.announcements.mark-read');

    Route::post('/offline-sync/verify-password', [OfflineWorkspaceController::class, 'verifyPassword'])
        ->name('offline-sync.verify-password');
});
