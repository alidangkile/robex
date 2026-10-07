import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error in UI boundary:', error, errorInfo);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', maxWidth: '600px', margin: '48px auto' }}>
          <div className="card" style={{ borderColor: 'var(--color-error)' }}>
            <div className="card-header">
              <h2 className="card-title" style={{ color: 'var(--color-error)' }}>
                Application Encountered an Issue
              </h2>
              <p className="card-subtitle">
                Funds and wallet assets remain completely safe. The user interface caught an unexpected state.
              </p>
            </div>
            <div className="callout callout-error" style={{ marginBottom: '24px' }}>
              <strong>Error Details:</strong> {this.state.error?.message || 'Unknown render error'}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload Robex
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
