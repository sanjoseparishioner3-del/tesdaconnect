import React from 'react';
import { ContactShadows, Environment, Lightformer, useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HERO_PRESETS, type HeroPresetKey } from '@/lib/landing/laptopMetrics';

export interface LaptopScrollState {
  progress: number;
  isPinnedDesktop: boolean;
}

export type LoginScreenVariant = 'staff' | 'scholar';

interface LaptopCanvasSceneProps {
  activePreset: HeroPresetKey;
  scrollStateRef: React.MutableRefObject<LaptopScrollState>;
  portalView?: LoginScreenVariant;
  onWebglError?: () => void;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Draws a sharp high-DPI CanvasTexture replicating the real TCTESDAConnect white + emerald dashboard
 * onto the 3D laptop's ScreenDisplay surface without remote CDN fonts or iframe artifacts.
 */
function paintDashboardCanvas(
  canvas: HTMLCanvasElement,
  presetKey: HeroPresetKey,
  portalView: LoginScreenVariant = 'staff',
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const baseSpec = HERO_PRESETS[presetKey];
  const spec =
    portalView === 'scholar'
      ? {
        ...baseSpec,
        headline: 'Scholar & Applicant Self-Service Portal',
        institutionTag: 'MIS 03-01 & Digital System ID',
        subline: 'Track Digital System Account ID, 8 Documentary Requirements & Offline Schedules.',
        kpis: [
          { label: 'Digital System ID', value: 'Active', delta: 'Portal access card' },
          { label: 'MIS 03-01 Inputs', value: '100%', delta: 'Filled/Blank PDF ready' },
          { label: '8 Required Docs', value: 'Verified', delta: 'Cached offline' },
          { label: 'Next Schedule', value: 'Synced', delta: 'Calendar ready' },
        ],
        workflows: [
          { title: 'Registration Inputs · MIS 03-01 (ver. 2021)', meta: 'Synced offline & PDF downloadable', status: 'Confirmed' },
          { title: '8 Important TESDA Requirements', meta: 'PSA, Edu Records, ID Photos & Medical', status: 'Cached' },
          { title: 'Focal Progress & Achievement Charts', meta: 'Task competency milestones', status: 'Tracked' },
        ],
      }
      : baseSpec;
  const w = canvas.width;
  const h = canvas.height;

  // White workspace backdrop
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Top browser chrome
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, 58);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 57, w, 2);

  // Window dots
  const dotColors = ['#cbd5e1', '#cbd5e1', '#059669'];
  dotColors.forEach((color, idx) => {
    ctx.beginPath();
    ctx.arc(32 + idx * 20, 29, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(`TCTESDAConnect · ${spec.headline}`, 108, 36);

  // Emerald status pill
  ctx.fillStyle = '#ecfdf5';
  ctx.beginPath();
  ctx.roundRect(w - 290, 13, 260, 32, 16);
  ctx.fill();
  ctx.strokeStyle = '#a7f3d0';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(spec.institutionTag, w - 270, 34);

  // Institutional Navy Sidebar (#0f295c)
  const sidebarW = 240;
  ctx.fillStyle = '#0f295c';
  ctx.fillRect(0, 58, sidebarW, h - 58);

  // Logo lockup inside sidebar
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(22, 82, 42, 42, 10);
  ctx.fill();
  ctx.fillStyle = '#0f295c';
  ctx.font = '900 18px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('TC', 30, 110);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('TESDAConnect', 76, 102);
  ctx.fillStyle = '#6ee7b7';
  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Operations Portal', 76, 120);

  const navLabels = [
    'Dashboard',
    'Registration Intake',
    'Schedules & Calendar',
    'Trainee Records',
    'Announcements',
    'Reports & Exports',
  ];
  navLabels.forEach((label, i) => {
    const y = 160 + i * 52;
    if (i === 0) {
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.roundRect(16, y - 26, sidebarW - 32, 38, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = '#cbd5e1';
    }
    ctx.font = '600 15px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(label, 30, y - 2);
  });

  // Main Area Header
  const mainX = sidebarW + 36;
  const mainW = w - mainX - 36;
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('LIVE WORKSPACE ARCHITECTURE', mainX, 105);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 30px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(spec.headline, mainX, 142);

  ctx.fillStyle = '#475569';
  ctx.font = '500 16px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText(spec.subline.slice(0, 74), mainX, 170);

  // KPI Grid (4 cards)
  const cardGap = 16;
  const cardW = (mainW - cardGap * 3) / 4;
  spec.kpis.forEach((kpi, idx) => {
    const x = mainX + idx * (cardW + cardGap);
    const y = 198;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, 118, 14);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(kpi.label.toUpperCase(), x + 16, y + 30);

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 34px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(kpi.value, x + 16, y + 74);

    ctx.fillStyle = '#059669';
    ctx.font = '600 13px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(kpi.delta, x + 16, y + 100);
  });

  // Pipeline Panel Left + Governance Card Right
  const pipeY = 342;
  const leftW = Math.floor(mainW * 0.64);
  const rightX = mainX + leftW + 18;
  const rightW = mainW - leftW - 18;
  const panelH = h - pipeY - 36;

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.roundRect(mainX, pipeY, leftW, panelH, 16);
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 17px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Active TESDA Operational Pipeline', mainX + 20, pipeY + 34);

  spec.workflows.forEach((wf, idx) => {
    const rowY = pipeY + 56 + idx * 96;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(mainX + 18, rowY, leftW - 36, 78, 12);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(wf.title, mainX + 34, rowY + 32);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 13px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(wf.meta, mainX + 34, rowY + 58);

    ctx.fillStyle = '#ecfdf5';
    ctx.beginPath();
    ctx.roundRect(mainX + leftW - 128, rowY + 22, 92, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(wf.status, mainX + leftW - 114, rowY + 42);
  });

  // Right Emerald Summary Box
  ctx.fillStyle = '#ecfdf5';
  ctx.beginPath();
  ctx.roundRect(rightX, pipeY, rightW, panelH, 16);
  ctx.fill();
  ctx.strokeStyle = '#a7f3d0';
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 17px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Governance & ULI', rightX + 20, pipeY + 36);

  ctx.fillStyle = '#334155';
  ctx.font = '500 14px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Post-confirmation TESDA', rightX + 20, pipeY + 72);
  ctx.fillText('Main ULI assignment &', rightX + 20, pipeY + 94);
  ctx.fillText('8-document verification.', rightX + 20, pipeY + 116);

  const checks = [
    'MIS 03-01 Filled / Blank PDF',
    'Admin Batch Scheduling',
    'Focal Progress Charts',
    'Offline IndexedDB Ready',
  ];
  checks.forEach((chk, i) => {
    ctx.fillStyle = '#047857';
    ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.fillText(`✓  ${chk}`, rightX + 20, pipeY + 178 + i * 36);
  });
}

interface LaptopModelProps {
  activePreset: HeroPresetKey;
  scrollStateRef: React.MutableRefObject<LaptopScrollState>;
  portalView?: LoginScreenVariant;
}

function ProceduralGlbLaptop({ activePreset, scrollStateRef, portalView = 'staff' }: LaptopModelProps) {
  const gltf = useGLTF('/models/tesda-laptop.glb');
  const rootRef = React.useRef<THREE.Group | null>(null);
  const lidPivotRef = React.useRef<THREE.Object3D | null>(null);
  const glowRef = React.useRef<THREE.Mesh | null>(null);
  const shadowGroupRef = React.useRef<THREE.Group | null>(null);

  const chassisMaterialsRef = React.useRef<THREE.MeshStandardMaterial[]>([]);
  const screenMaterialRef = React.useRef<THREE.MeshStandardMaterial | null>(null);

  // Build synchronized high-DPI CanvasTexture for ScreenDisplay
  const screenCanvas = React.useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1280;
    c.height = 800;
    paintDashboardCanvas(c, 'core', 'staff');
    return c;
  }, []);

  const screenTexture = React.useMemo(() => {
    const tex = new THREE.CanvasTexture(screenCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }, [screenCanvas]);

  React.useEffect(() => {
    paintDashboardCanvas(screenCanvas, activePreset, portalView);
    screenTexture.needsUpdate = true;
  }, [activePreset, portalView, screenCanvas, screenTexture]);

  const glowTexture = React.useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const gctx = c.getContext('2d');
    if (gctx) {
      const grad = gctx.createRadialGradient(128, 128, 8, 128, 128, 124);
      grad.addColorStop(0, 'rgba(5, 150, 105, 0.34)');
      grad.addColorStop(0.45, 'rgba(5, 150, 105, 0.14)');
      grad.addColorStop(1, 'rgba(5, 150, 105, 0)');
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Clone loaded GLB scene cleanly so material opacity & disposal stay scoped to this instance
  const clonedScene = React.useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const clonedChassisMats: THREE.MeshStandardMaterial[] = [];

    cloned.traverse((obj) => {
      if (obj.name === 'LidPivot') {
        lidPivotRef.current = obj;
      }
      if (obj instanceof THREE.Mesh) {
        const origMat = obj.material as THREE.MeshStandardMaterial;
        const clonedMat = origMat.clone();
        clonedMat.transparent = true;
        clonedMat.opacity = 1;

        if (obj.name === 'ScreenDisplay') {
          clonedMat.map = screenTexture;
          clonedMat.emissiveMap = screenTexture;
          clonedMat.emissive = new THREE.Color('#ffffff');
          clonedMat.emissiveIntensity = 0.72;
          clonedMat.roughness = 0.2;
          clonedMat.metalness = 0.04;
          clonedMat.color = new THREE.Color('#ffffff');
          screenMaterialRef.current = clonedMat;
        } else {
          clonedChassisMats.push(clonedMat);
        }

        obj.material = clonedMat;
        obj.castShadow = obj.name !== 'ScreenDisplay';
        obj.receiveShadow = true;
      }
    });

    chassisMaterialsRef.current = clonedChassisMats;
    return cloned;
  }, [gltf.scene, screenTexture]);

  // Dispose only on real long-lived teardown; keep cached GLTF intact for StrictMode / instant back-nav
  React.useEffect(() => {
    screenTexture.needsUpdate = true;
    glowTexture.needsUpdate = true;
    return () => {
      for (const mat of chassisMaterialsRef.current) {
        mat.dispose();
      }
      screenMaterialRef.current?.dispose();
    };
  }, [screenTexture, glowTexture]);

  useFrame((state) => {
    const group = rootRef.current;
    if (!group) return;

    const { progress, isPinnedDesktop } = scrollStateRef.current;
    const t = state.clock.getElapsedTime();

    if (!isPinnedDesktop) {
      // Gentle responsive idle hover when rendered without desktop pin
      group.visible = true;
      group.position.set(0, Math.sin(t * 1.4) * 0.035, 0);
      group.rotation.set(0.12 + state.pointer.y * 0.04, -0.25 + state.pointer.x * 0.08, 0);
      group.scale.setScalar(0.95);
      for (const mat of chassisMaterialsRef.current) {
        mat.opacity = 1;
        mat.depthWrite = true;
      }
      if (screenMaterialRef.current) {
        screenMaterialRef.current.opacity = 1;
      }
      return;
    }

    // Stage 3+ hides 3D mesh, glow, and contact shadow cleanly once handoff to React Dashboard is complete
    if (progress > 0.51) {
      group.visible = false;
      if (glowRef.current) glowRef.current.visible = false;
      if (shadowGroupRef.current) shadowGroupRef.current.visible = false;
      return;
    }
    group.visible = true;

    // Proportional desktop hero placement in the right 50% column with crisp margin
    const heroOffsetX = Math.min(state.viewport.width * 0.185, 1.38);
    const t2 = smoothstep(0.06, 0.4, progress); // Stage 2: center & face forward
    const t3 = smoothstep(0.4, 0.51, progress); // Stage 3: expand screen & fade chassis cleanly

    const floatAmp = (1 - t2) * 0.04;
    const floatY = Math.sin(t * 1.35) * floatAmp;
    const pointerInfluence = 1 - t2;

    const targetX = lerp(heroOffsetX, 0, t2);
    const targetY = lerp(-0.1, -0.14, t2) + floatY - t3 * 0.04;
    const targetZ = lerp(0, 0.25, t2) + t3 * 0.95;

    group.position.set(targetX, targetY, targetZ);

    const rotY = lerp(-0.42 + state.pointer.x * 0.08 * pointerInfluence, 0, t2);
    const rotX = lerp(0.14 - state.pointer.y * 0.04 * pointerInfluence, 0.015, t2) * (1 - t3);
    group.rotation.set(rotX, rotY, 0);

    // Responsive scale fitting 16:10 laptop cleanly below sticky navbar
    const baseHeroScale = Math.min(state.viewport.width / 6.3, 0.94);
    const centerScale = baseHeroScale * 1.15;
    const morphScale = lerp(baseHeroScale, centerScale, t2) + t3 * 0.34;
    group.scale.setScalar(morphScale);

    // Straighten LidPivot during Stage 2 so ScreenDisplay aligns parallel to HTML dashboard
    if (lidPivotRef.current) {
      lidPivotRef.current.rotation.x = lerp(-0.14, 0, t2);
    }

    // Smooth opacity crossfade of chassis and 3D ScreenDisplay cleanly ahead of DOM handoff
    const chassisOpacity = Math.max(0, 1 - smoothstep(0.4, 0.48, progress));
    for (const mat of chassisMaterialsRef.current) {
      mat.opacity = chassisOpacity;
      mat.depthWrite = chassisOpacity > 0.85;
    }

    const screenOpacity = Math.max(0, 1 - smoothstep(0.42, 0.5, progress));
    if (screenMaterialRef.current) {
      screenMaterialRef.current.opacity = screenOpacity;
    }

    // Soft radial emerald glow beneath laptop in Stage 1 & 2, fading out smoothly in Stage 3
    if (glowRef.current) {
      glowRef.current.visible = chassisOpacity > 0.02;
      glowRef.current.position.set(targetX, -0.82, -0.15);
      glowRef.current.scale.setScalar(lerp(1, 1.25, t2));
      const glowMat = glowRef.current.material as THREE.MeshBasicMaterial;
      glowMat.opacity = chassisOpacity * 0.85;
    }

    if (shadowGroupRef.current) {
      shadowGroupRef.current.visible = chassisOpacity > 0.12;
    }
  });

  return (
    <>
      <group ref={rootRef}>
        <primitive object={clonedScene} />
      </group>

      {/* Soft Radial Emerald Accent Halo Beneath Laptop */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[1.2, -0.82, -0.15]}>
        <planeGeometry args={[4.2, 4.2]} />
        <meshBasicMaterial map={glowTexture} transparent opacity={0.85} depthWrite={false} />
      </mesh>

      <group ref={shadowGroupRef}>
        <ContactShadows
          position={[0, -0.82, 0]}
          opacity={0.28}
          scale={9}
          blur={2.4}
          far={2.6}
          color="#0f172a"
          frames={1}
        />
      </group>
    </>
  );
}

interface WebglErrorBoundaryState {
  hasError: boolean;
}

class WebglCanvasErrorBoundary extends React.Component<
  { onErrorFallback?: () => void; children: React.ReactNode },
  WebglErrorBoundaryState
> {
  state: WebglErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WebglErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onErrorFallback?.();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export default function LaptopCanvasScene({
  activePreset,
  scrollStateRef,
  portalView = 'staff',
  onWebglError,
}: LaptopCanvasSceneProps) {
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return (
    <WebglCanvasErrorBoundary onErrorFallback={onWebglError}>
      <Canvas
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [0, 0.32, 5.2], fov: 36, near: 0.1, far: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener(
            'webglcontextlost',
            (evt) => {
              evt.preventDefault();
              if (isMountedRef.current) {
                setTimeout(() => {
                  if (isMountedRef.current && gl.getContext().isContextLost()) {
                    onWebglError?.();
                  }
                }, 400);
              }
            },
            { once: true },
          );
        }}
        className="h-full w-full"
      >
        {/* Clean institutional bright studio lighting on transparent/white stage */}
        <ambientLight intensity={0.85} color="#ffffff" />
        <hemisphereLight intensity={0.75} color="#ffffff" groundColor="#e2e8f0" />
        <directionalLight position={[4.5, 6.5, 5.5]} intensity={1.75} color="#ffffff" castShadow />
        <directionalLight position={[-4.5, 2.5, 3.5]} intensity={0.7} color="#ecfdf5" />

        {/* Offline declarative HDR-free studio lightformers */}
        <Environment resolution={128}>
          <Lightformer form="rect" intensity={2.2} position={[0, 5, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 4, 1]} color="#ffffff" />
          <Lightformer form="rect" intensity={1.4} position={[-5, 2, 2]} rotation={[0, Math.PI / 2, 0]} scale={[6, 3, 1]} color="#ecfdf5" />
          <Lightformer form="rect" intensity={1.5} position={[5, 2, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[6, 3, 1]} color="#f8fafc" />
        </Environment>

        <React.Suspense fallback={null}>
          <ProceduralGlbLaptop
            activePreset={activePreset}
            scrollStateRef={scrollStateRef}
            portalView={portalView}
          />
        </React.Suspense>
      </Canvas>
    </WebglCanvasErrorBoundary>
  );
}
