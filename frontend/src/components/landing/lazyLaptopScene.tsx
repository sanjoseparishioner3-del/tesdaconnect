import React from 'react';
import type LaptopCanvasSceneComponent from '@/components/landing/LaptopCanvasScene';

type SceneProps = React.ComponentProps<typeof LaptopCanvasSceneComponent>;

/** Rendered when the 3D chunk cannot be downloaded (offline): asks the parent to show the lightweight mockup. */
function SceneUnavailable({ onWebglError }: SceneProps) {
  React.useEffect(() => {
    onWebglError?.();
  }, [onWebglError]);
  return null;
}

/**
 * The three.js laptop scene (~1 MB) is not part of the offline precache. Opening the
 * landing or login page offline must not crash the whole app when that chunk cannot be
 * fetched, so a failed import resolves to a fallback that switches to the lightweight
 * mockup instead of throwing.
 */
export const LazyLaptopCanvasScene = React.lazy<React.ComponentType<SceneProps>>(() =>
  import('@/components/landing/LaptopCanvasScene').catch(() => ({ default: SceneUnavailable })),
);
