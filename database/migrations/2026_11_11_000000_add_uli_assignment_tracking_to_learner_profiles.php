<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('learner_profiles', function (Blueprint $table) {
            $table->timestamp('uli_assigned_at')->nullable()->after('uli_number');
            $table->foreignId('uli_assigned_by_user_id')->nullable()->after('uli_assigned_at')
                ->constrained('users')->nullOnDelete();
            $table->unique('uli_number', 'learner_profiles_uli_number_unique');
        });
    }

    public function down(): void
    {
        Schema::table('learner_profiles', function (Blueprint $table) {
            $table->dropUnique('learner_profiles_uli_number_unique');
            $table->dropConstrainedForeignId('uli_assigned_by_user_id');
            $table->dropColumn('uli_assigned_at');
        });
    }
};
