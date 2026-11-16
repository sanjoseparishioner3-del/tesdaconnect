import * as Sentry from '@sentry/react';
import { env } from './env';

let initialized = false;

export function initOptionalSentry(): void {
  if (initialized || !env.VITE_SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.VITE_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });

  initialized = true;
}
