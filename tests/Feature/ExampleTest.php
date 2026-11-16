<?php

test('returns a successful response', function () {
    $response = $this->get(route('home'));

    $response->assertOk()
        ->assertSee('data-tesda-3d-canvas', false)
        ->assertSee('tesda-welding-workshop.jpg', false)
        ->assertSee('tesda-organic-farm.jpg', false);

    foreach ([
        'images/landing/tesda-main-plaza.jpg',
        'images/landing/tesda-welding-workshop.jpg',
        'images/landing/tesda-vr-welding-lab.jpg',
        'images/landing/tesda-plumbing-assessment.jpg',
        'images/landing/tesda-automotive-shop.jpg',
        'images/landing/tesda-digital-lab.jpg',
        'images/landing/tesda-organic-farm.jpg',
        'images/landing/tesda-organic-crops.jpg',
    ] as $asset) {
        expect(file_exists(public_path($asset)))->toBeTrue();
    }
});
