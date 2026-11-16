<x-layouts::app.sidebar :title="$title ?? null">
    <flux:main class="tesda-main-workspace">
        <div class="tesda-content-container">
            {{ $slot }}
        </div>
    </flux:main>
</x-layouts::app.sidebar>
