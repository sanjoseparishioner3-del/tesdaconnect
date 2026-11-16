import * as THREE from './vendor/three.module.min.js';

const PRESETS = {
    core: {
        cameraDesktop: [2.1, 1.35, 10.6],
        cameraMobile: [0, 1.7, 12.0],
        targetRot: [0.18, 0.35],
        speed: 1.0,
    },
    mif: {
        cameraDesktop: [3.2, 2.2, 8.8],
        cameraMobile: [0.4, 2.1, 10.4],
        targetRot: [0.35, -0.75],
        speed: 0.85,
    },
    bst: {
        cameraDesktop: [1.0, 0.9, 8.6],
        cameraMobile: [-0.3, 1.3, 10.2],
        targetRot: [-0.18, 1.15],
        speed: 1.15,
    },
    sync: {
        cameraDesktop: [2.0, 2.8, 9.6],
        cameraMobile: [0, 2.7, 11.2],
        targetRot: [0.55, 0.0],
        speed: 1.45,
    },
};

let cleanupFn = null;

function createHeroScene(canvas, root) {
    const fallbackEl = root.querySelector('[data-3d-fallback]');
    let renderer;

    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
        });
    } catch {
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return () => {};
    }

    if (!renderer || !renderer.getContext()) {
        if (fallbackEl) fallbackEl.classList.remove('hidden');
        return () => {};
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x031826, 0.042);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.1, 1.35, 10.6);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Lighting setup
    const ambient = new THREE.AmbientLight(0x88d8d0, 0.95);
    const hemi = new THREE.HemisphereLight(0x5eead4, 0x091d42, 1.15);
    const keyLight = new THREE.DirectionalLight(0x99f6e4, 2.2);
    keyLight.position.set(6, 9, 8);
    const amberLight = new THREE.PointLight(0xf59e0b, 3.2, 22);
    amberLight.position.set(-4.5, 2.5, 4);
    const cyanLight = new THREE.PointLight(0x22d3ee, 2.8, 22);
    cyanLight.position.set(4.5, -1.5, 5);
    scene.add(ambient, hemi, keyLight, amberLight, cyanLight);

    // Operations Core Group
    const coreGroup = new THREE.Group();
    coreGroup.position.set(2.35, 0.35, 0);
    scene.add(coreGroup);

    // Central crystalline TESDA Core + wireframe shell
    const innerGeo = new THREE.IcosahedronGeometry(1.18, 1);
    const innerMat = new THREE.MeshStandardMaterial({
        color: 0x0f766e,
        emissive: 0x115e59,
        emissiveIntensity: 0.7,
        metalness: 0.45,
        roughness: 0.22,
        flatShading: true,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(innerMesh);

    const cageGeo = new THREE.IcosahedronGeometry(1.52, 1);
    const cageMat = new THREE.MeshBasicMaterial({
        color: 0x5eead4,
        wireframe: true,
        transparent: true,
        opacity: 0.38,
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    coreGroup.add(cageMesh);

    // Three orbital gyroscopic rings (Intake, Competency, Offline Sync)
    const ringSpecs = [
        { radius: 2.35, tube: 0.032, color: 0x2dd4bf, tilt: [0.95, 0.35, 0.2], speed: [0.32, 0.18, 0] },
        { radius: 2.85, tube: 0.026, color: 0xfbbf24, tilt: [-0.65, 0.85, 0.45], speed: [-0.22, 0.28, 0.12] },
        { radius: 3.35, tube: 0.022, color: 0x38bdf8, tilt: [0.35, -0.75, 1.1], speed: [0.18, -0.25, 0.2] },
    ];
    const rings = ringSpecs.map((spec) => {
        const mesh = new THREE.Mesh(
            new THREE.TorusGeometry(spec.radius, spec.tube, 18, 96),
            new THREE.MeshStandardMaterial({
                color: spec.color,
                emissive: spec.color,
                emissiveIntensity: 0.55,
                metalness: 0.7,
                roughness: 0.2,
            })
        );
        mesh.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]);
        coreGroup.add(mesh);
        return { mesh, spec };
    });

    // Holographic base plinth rings
    const hexBase = new THREE.Mesh(
        new THREE.CylinderGeometry(2.15, 2.45, 0.14, 6),
        new THREE.MeshStandardMaterial({
            color: 0x0c4a6e,
            emissive: 0x0e7490,
            emissiveIntensity: 0.35,
            metalness: 0.6,
            roughness: 0.3,
            transparent: true,
            opacity: 0.72,
        })
    );
    hexBase.position.y = -2.45;
    coreGroup.add(hexBase);

    const hexWire = new THREE.Mesh(
        new THREE.CylinderGeometry(2.55, 2.55, 0.05, 6),
        new THREE.MeshBasicMaterial({ color: 0x5eead4, wireframe: true, transparent: true, opacity: 0.3 })
    );
    hexWire.position.y = -2.45;
    coreGroup.add(hexWire);

    // Institution satellites: MIF (Teal Organic Farm) & BST (Amber Tech)
    function createSatellite(color, pos) {
        const satGroup = new THREE.Group();
        satGroup.position.copy(pos);
        const body = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.42, 0),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.6,
                metalness: 0.5,
                roughness: 0.2,
            })
        );
        const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.68, 0.022, 12, 48),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
        );
        halo.rotation.x = Math.PI / 2.4;
        satGroup.add(body, halo);
        coreGroup.add(satGroup);
        return { satGroup, body, halo };
    }

    const mifPos = new THREE.Vector3(-2.65, 1.35, 1.05);
    const bstPos = new THREE.Vector3(2.7, -0.95, 1.25);
    const syncPos = new THREE.Vector3(-0.35, 2.55, -1.35);

    const mifSat = createSatellite(0x14b8a6, mifPos);
    const bstSat = createSatellite(0xf59e0b, bstPos);
    const syncSat = createSatellite(0x38bdf8, syncPos);

    // Data conduit curves + traveling packets between Core and Nodes
    const packets = [];
    function createConduit(targetPos, color, offset = 0) {
        const mid = targetPos.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.85, 0.6));
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), mid, targetPos);
        const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 32, 0.018, 8, false),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 })
        );
        coreGroup.add(tube);

        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.085, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        coreGroup.add(dot);
        packets.push({ curve, dot, offset });
    }

    createConduit(mifPos, 0x2dd4bf, 0.0);
    createConduit(bstPos, 0xfbbf24, 0.35);
    createConduit(syncPos, 0x38bdf8, 0.7);

    // Undulating 3D topography wireframe floor
    const terrainGeo = new THREE.PlaneGeometry(36, 24, 48, 32);
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainPos = terrainGeo.attributes.position;
    const baseTerrainY = new Float32Array(terrainPos.count);
    for (let i = 0; i < terrainPos.count; i++) {
        baseTerrainY[i] = terrainPos.getY(i);
    }
    const terrainMat = new THREE.MeshBasicMaterial({
        color: 0x0f766e,
        wireframe: true,
        transparent: true,
        opacity: 0.24,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.set(0, -3.55, -2.5);
    scene.add(terrainMesh);

    // Floating particle cosmos
    const particleCount = 620;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const palette = [
        new THREE.Color(0x5eead4),
        new THREE.Color(0x38bdf8),
        new THREE.Color(0xfbbf24),
        new THREE.Color(0xe2e8f0),
    ];

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 26;
        positions[i * 3 + 1] = (Math.random() - 0.4) * 14;
        positions[i * 3 + 2] = (Math.random() - 0.6) * 18;
        const c = palette[i % palette.length];
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(
        particleGeo,
        new THREE.PointsMaterial({
            size: 0.075,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
        })
    );
    scene.add(particles);

    // Interactive state (drag + pointer parallax + presets)
    let activePreset = 'core';
    let speedMultiplier = 1.0;
    let pointerX = 0;
    let pointerY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let userRotX = 0.18;
    let userRotY = 0.35;
    let targetRotX = 0.18;
    let targetRotY = 0.35;

    const onPointerMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
        const ny = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1;
        pointerX = Math.max(-1, Math.min(1, nx));
        pointerY = Math.max(-1, Math.min(1, ny));

        if (dragging) {
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            targetRotY += dx * 0.008;
            targetRotX = Math.max(-0.9, Math.min(0.9, targetRotX + dy * 0.006));
            lastX = e.clientX;
            lastY = e.clientY;
        }
    };

    const onPointerDown = (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.classList.add('cursor-grabbing');
    };

    const onPointerUp = () => {
        dragging = false;
        canvas.classList.remove('cursor-grabbing');
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    const presetButtons = Array.from(root.querySelectorAll('[data-scene-preset]'));
    const presetStatusEl = root.querySelector('[data-scene-preset-status]');
    const presetLabels = {
        core: 'TESDAConnect Unified Core · BST & MIF Live Sync',
        mif: 'Mamburao Integrated Farm (MIF) · Organic Agriculture Node',
        bst: 'Balli School of Technology (BST) · Technical Vocational Node',
        sync: 'Offline-First PWA & IndexedDB Sync Constellation',
    };

    const onPresetClick = (btn) => {
        const key = btn.dataset.scenePreset;
        if (!PRESETS[key]) return;
        activePreset = key;
        const p = PRESETS[key];
        targetRotX = p.targetRot[0];
        targetRotY = p.targetRot[1];
        speedMultiplier = p.speed;

        presetButtons.forEach((b) => {
            const isActive = b === btn;
            b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            b.classList.toggle('bg-teal-400', isActive);
            b.classList.toggle('text-slate-950', isActive);
            b.classList.toggle('border-teal-300', isActive);
            b.classList.toggle('bg-white/10', !isActive);
            b.classList.toggle('text-teal-100', !isActive);
            b.classList.toggle('border-white/15', !isActive);
        });

        if (presetStatusEl && presetLabels[key]) {
            presetStatusEl.textContent = presetLabels[key];
        }
    };

    presetButtons.forEach((btn) => {
        btn.addEventListener('click', () => onPresetClick(btn));
    });

    // Responsive sizing
    let width = 0;
    let height = 0;
    const syncSize = () => {
        const rect = canvas.parentElement?.getBoundingClientRect() || canvas.getBoundingClientRect();
        width = Math.max(320, Math.floor(rect.width));
        height = Math.max(420, Math.floor(rect.height));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Keep 3D model centered on mobile, right-offset on wide hero screens
        if (width < 1024) {
            coreGroup.position.set(0, -0.35, -0.6);
            coreGroup.scale.setScalar(0.76);
        } else {
            coreGroup.position.set(2.45, 0.25, 0);
            coreGroup.scale.setScalar(1.0);
        }
    };

    syncSize();
    const resizeObserver = new ResizeObserver(syncSize);
    if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    const clock = new THREE.Clock();
    let rafId = 0;
    let disposed = false;

    const renderFrame = () => {
        if (disposed) return;
        const elapsed = clock.getElapsedTime();
        const t = reducedMotion ? 0 : elapsed * speedMultiplier;

        // Smooth camera target lerp
        const preset = PRESETS[activePreset] || PRESETS.core;
        const camArr = width < 1024 ? preset.cameraMobile : preset.cameraDesktop;
        const goalX = camArr[0] + pointerX * 0.45;
        const goalY = camArr[1] - pointerY * 0.35;
        const goalZ = camArr[2];
        camera.position.x += (goalX - camera.position.x) * 0.05;
        camera.position.y += (goalY - camera.position.y) * 0.05;
        camera.position.z += (goalZ - camera.position.z) * 0.05;
        camera.lookAt(width < 1024 ? 0 : 0.9, 0.1, 0);

        // Smooth core rotation + gentle idle spin
        if (!dragging && !reducedMotion) {
            targetRotY += 0.0028 * speedMultiplier;
        }
        userRotX += (targetRotX - userRotX) * 0.07;
        userRotY += (targetRotY - userRotY) * 0.07;
        coreGroup.rotation.x = userRotX + pointerY * 0.08;
        coreGroup.rotation.y = userRotY + pointerX * 0.12;

        innerMesh.rotation.y = t * 0.45;
        innerMesh.rotation.x = Math.sin(t * 0.3) * 0.25;
        cageMesh.rotation.y = -t * 0.25;

        rings.forEach(({ mesh, spec }) => {
            mesh.rotation.x += (spec.speed[0] * 0.008) * (reducedMotion ? 0 : speedMultiplier);
            mesh.rotation.y += (spec.speed[1] * 0.008) * (reducedMotion ? 0 : speedMultiplier);
        });

        hexBase.rotation.y = t * 0.15;
        hexWire.rotation.y = -t * 0.2;

        [mifSat, bstSat, syncSat].forEach((sat, idx) => {
            sat.body.rotation.y = t * (0.7 + idx * 0.15);
            sat.halo.rotation.z = t * (0.9 - idx * 0.1);
            sat.satGroup.position.y += Math.sin(t * 1.4 + idx * 2) * 0.0018;
        });

        // Animate traveling packets on Bezier curves
        packets.forEach((p) => {
            const u = ((t * 0.32 + p.offset) % 1 + 1) % 1;
            const pt = p.curve.getPointAt(u);
            p.dot.position.copy(pt);
        });

        // Animate 3D landscape topography wave
        if (!reducedMotion) {
            for (let i = 0; i < terrainPos.count; i++) {
                const vx = terrainPos.getX(i);
                const vz = terrainPos.getZ(i);
                const wave = Math.sin(vx * 0.38 + t * 1.1) * 0.34 + Math.cos(vz * 0.42 + t * 0.9) * 0.28;
                terrainPos.setY(i, baseTerrainY[i] + wave);
            }
            terrainPos.needsUpdate = true;
            particles.rotation.y = t * 0.03;
        }

        renderer.render(scene, camera);
        if (!reducedMotion) {
            rafId = window.requestAnimationFrame(renderFrame);
        }
    };

    renderFrame();

    return () => {
        disposed = true;
        if (rafId) window.cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        canvas.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        renderer.dispose();
    };
}

function setupTiltCards(root) {
    const cards = Array.from(root.querySelectorAll('[data-3d-tilt]'));
    const cleanups = [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return () => {};

    cards.forEach((card) => {
        const onMove = (e) => {
            const rect = card.getBoundingClientRect();
            const px = (e.clientX - rect.left) / Math.max(rect.width, 1);
            const py = (e.clientY - rect.top) / Math.max(rect.height, 1);
            const rx = (0.5 - py) * 11;
            const ry = (px - 0.5) * 12;
            card.style.transform = `perspective(1000px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(6px)`;
            card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
            card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        };
        const onLeave = () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
        };
        card.addEventListener('pointermove', onMove);
        card.addEventListener('pointerleave', onLeave);
        cleanups.push(() => {
            card.removeEventListener('pointermove', onMove);
            card.removeEventListener('pointerleave', onLeave);
        });
    });

    return () => cleanups.forEach((fn) => fn());
}

function setupDocumentationGallery(root) {
    const filterButtons = Array.from(root.querySelectorAll('[data-doc-filter]'));
    const cards = Array.from(root.querySelectorAll('[data-doc-card]'));
    const lightbox = root.querySelector('#tesda-doc-lightbox');
    if (!cards.length) return () => {};

    let activeFilter = 'all';
    let currentIdx = 0;

    const getVisibleCards = () => cards.filter((c) => !c.classList.contains('hidden'));

    filterButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            activeFilter = btn.dataset.docFilter || 'all';
            filterButtons.forEach((b) => {
                const active = b === btn;
                b.setAttribute('aria-pressed', active ? 'true' : 'false');
                b.classList.toggle('bg-teal-400', active);
                b.classList.toggle('text-slate-950', active);
                b.classList.toggle('border-teal-300', active);
                b.classList.toggle('bg-white/5', !active);
                b.classList.toggle('text-blue-100', !active);
                b.classList.toggle('border-white/15', !active);
            });
            cards.forEach((card) => {
                const match = activeFilter === 'all' || card.dataset.docCategory === activeFilter;
                card.classList.toggle('hidden', !match);
            });
        });
    });

    if (!lightbox) return () => {};

    const imgEl = lightbox.querySelector('[data-lb-img]');
    const titleEl = lightbox.querySelector('[data-lb-title]');
    const tagEl = lightbox.querySelector('[data-lb-tag]');
    const descEl = lightbox.querySelector('[data-lb-desc]');
    const creditEl = lightbox.querySelector('[data-lb-credit]');
    const countEl = lightbox.querySelector('[data-lb-count]');

    const renderLightbox = () => {
        const list = getVisibleCards();
        if (!list.length) return;
        currentIdx = ((currentIdx % list.length) + list.length) % list.length;
        const card = list[currentIdx];
        imgEl.src = card.dataset.docSrc || '';
        imgEl.alt = card.dataset.docTitle || 'TESDA training documentation';
        titleEl.textContent = card.dataset.docTitle || '';
        tagEl.textContent = card.dataset.docTag || '';
        descEl.textContent = card.dataset.docDesc || '';
        creditEl.textContent = card.dataset.docCredit || '';
        countEl.textContent = `${currentIdx + 1} / ${list.length}`;
    };

    const openAtCard = (card) => {
        const list = getVisibleCards();
        currentIdx = Math.max(0, list.indexOf(card));
        renderLightbox();
        lightbox.classList.remove('hidden');
        lightbox.classList.add('flex');
        document.body.style.overflow = 'hidden';
    };

    const closeBox = () => {
        lightbox.classList.add('hidden');
        lightbox.classList.remove('flex');
        document.body.style.overflow = '';
    };

    cards.forEach((card) => {
        card.addEventListener('click', () => openAtCard(card));
    });

    lightbox.querySelector('[data-lb-close]')?.addEventListener('click', closeBox);
    lightbox.querySelector('[data-lb-prev]')?.addEventListener('click', () => {
        currentIdx -= 1;
        renderLightbox();
    });
    lightbox.querySelector('[data-lb-next]')?.addEventListener('click', () => {
        currentIdx += 1;
        renderLightbox();
    });
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeBox();
    });

    const onKeyDown = (e) => {
        if (lightbox.classList.contains('hidden')) return;
        if (e.key === 'Escape') closeBox();
        if (e.key === 'ArrowLeft') {
            currentIdx -= 1;
            renderLightbox();
        }
        if (e.key === 'ArrowRight') {
            currentIdx += 1;
            renderLightbox();
        }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
        window.removeEventListener('keydown', onKeyDown);
        document.body.style.overflow = '';
    };
}

function initLanding3D() {
    if (cleanupFn) {
        cleanupFn();
        cleanupFn = null;
    }

    const root = document.querySelector('[data-tesda-landing]');
    if (!root) return;

    const canvas = root.querySelector('[data-tesda-3d-canvas]');
    const cleanHero = canvas ? createHeroScene(canvas, root) : () => {};
    const cleanTilt = setupTiltCards(root);
    const cleanGallery = setupDocumentationGallery(root);

    cleanupFn = () => {
        cleanHero();
        cleanTilt();
        cleanGallery();
    };
}

document.addEventListener('DOMContentLoaded', initLanding3D);
document.addEventListener('livewire:navigated', initLanding3D);
document.addEventListener('livewire:navigating', () => {
    if (cleanupFn) {
        cleanupFn();
        cleanupFn = null;
    }
});

if (document.readyState !== 'loading') {
    initLanding3D();
}
