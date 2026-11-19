import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Unhandled render error caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            padding: '32px 24px',
            textAlign: 'center',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            margin: '24px auto',
            maxWidth: '680px',
            color: '#f8fafc',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={24} color="#f87171" />
          </div>

          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 750, color: '#f87171' }}>
            {this.props.fallbackTitle || 'View Rendering Paused'}
          </h3>

          <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#94a3b8', maxWidth: '440px', lineHeight: '1.5' }}>
            A temporary component error was intercepted. The window integrity has been protected and your data is safe.
          </p>

          {this.state.error && (
            <div
              style={{
                width: '100%',
                maxHeight: '120px',
                overflow: 'auto',
                padding: '10px 12px',
                background: 'rgba(2, 6, 23, 0.7)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '20px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#fca5a5',
                textAlign: 'left',
              }}
            >
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: '#6366f1',
              color: '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RotateCcw size={14} />
            <span>Reload View</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

