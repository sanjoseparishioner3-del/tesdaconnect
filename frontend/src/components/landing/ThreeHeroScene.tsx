import React from 'react';
import * as THREE from 'three';

export type HeroPresetKey = 'core' | 'mif' | 'bst' | 'sync';

interface HeroPreset {
  cameraDesktop: [number, number, number];
  cameraMobile: [number, number, number];
  targetRot: [number, number];
  speed: number;
}

const PRESETS: Record<HeroPresetKey, HeroPreset> = {
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

export function ThreeHeroScene({ activePreset = 'core' }: { activePreset?: HeroPresetKey }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const presetRef = React.useRef<HeroPresetKey>(activePreset);
  const [webglFailed, setWebglFailed] = React.useState(false);

  React.useEffect(() => {
    presetRef.current = activePreset;
  }, [activePreset]);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    if (!renderer.getContext()) {
      setWebglFailed(true);
      renderer.dispose();
      return;
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      window.cancelAnimationFrame(animId);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x031826, 0.042);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.1, 1.35, 10.6);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const ambient = new THREE.AmbientLight(0x88d8d0, 0.95);
    const hemi = new THREE.HemisphereLight(0x5eead4, 0x091d42, 1.15);
    const keyLight = new THREE.DirectionalLight(0x99f6e4, 2.2);
    keyLight.position.set(6, 9, 8);
    const amberLight = new THREE.PointLight(0xf59e0b, 3.2, 22);
    amberLight.position.set(-4.5, 2.5, 4);
    const cyanLight = new THREE.PointLight(0x22d3ee, 2.8, 22);
    cyanLight.position.set(4.5, -1.5, 5);
    scene.add(ambient, hemi, keyLight, amberLight, cyanLight);

    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

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

    const ringGeo = new THREE.TorusGeometry(2.25, 0.035, 16, 100);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.55,
      metalness: 0.7,
      roughness: 0.2,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2.6;
    coreGroup.add(ringMesh);

    const outerRingGeo = new THREE.TorusGeometry(2.85, 0.025, 16, 120);
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRing.rotation.y = Math.PI / 3;
    coreGroup.add(outerRing);

    const resize = () => {
      if (!renderer) return;
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 420;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener('resize', resize);

    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const preset = PRESETS[presetRef.current];
      const isMobile = window.innerWidth < 768;
      const targetPos = isMobile ? preset.cameraMobile : preset.cameraDesktop;

      camera.position.x += (targetPos[0] - camera.position.x) * 0.05;
      camera.position.y += (targetPos[1] - camera.position.y) * 0.05;
      camera.position.z += (targetPos[2] - camera.position.z) * 0.05;
      camera.lookAt(0, 0, 0);

      if (!reducedMotion) {
        innerMesh.rotation.y = elapsed * 0.35 * preset.speed;
        cageMesh.rotation.y = -elapsed * 0.22 * preset.speed;
        cageMesh.rotation.x = Math.sin(elapsed * 0.4) * 0.25;
        ringMesh.rotation.z = elapsed * 0.28 * preset.speed;
        outerRing.rotation.x = elapsed * 0.2 * preset.speed;
        coreGroup.rotation.x += (preset.targetRot[0] - coreGroup.rotation.x) * 0.04;
        coreGroup.rotation.y += (preset.targetRot[1] - coreGroup.rotation.y) * 0.04;
      }

      renderer?.render(scene, camera);
      animId = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      innerGeo.dispose();
      innerMat.dispose();
      cageGeo.dispose();
      cageMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      outerRingGeo.dispose();
      outerRingMat.dispose();
      renderer?.dispose();
    };
  }, []);

  if (webglFailed) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-teal-400/20 bg-slate-900/60 p-6 text-center text-sm text-teal-100">
        Interactive 3D Core ready on WebGL-enabled browsers (BST · MIF Sync Visualization).
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-[300px] w-full overflow-hidden rounded-2xl">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="Interactive TESDA Connect 3D visualization" />
    </div>
  );
}
