import React from 'react';

interface State {
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(
    error.message,
  );
}

/**
 * Last line of defence against a blank white screen. Most often hit when a page chunk
 * is not available offline (e.g. never opened online after an app update); shows a
 * readable message with a retry instead of an empty page.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[AppErrorBoundary]', error);
  }

  private handleRetry = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ error: null });
    window.location.assign('/app');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const offlineChunk = isChunkLoadError(error);
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4" role="alert">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-bold text-slate-900">
            {offlineChunk ? 'This page is not saved for offline use yet' : 'Something went wrong'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {offlineChunk
              ? 'Open TESDA Connect once while connected to the internet so this part of the app can be saved on your device. Your saved records and pending uploads are safe.'
              : 'Your saved records and pending uploads are safe. Try again, or go back to your home screen.'}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg bg-[#047857] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#065f46]"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go to my home screen
            </button>
          </div>
        </div>
      </div>
    );
  }
}
