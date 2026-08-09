import * as React from "react";
import { AlertTriangle } from "lucide-react";

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("App 2 Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl p-10 shadow-2xl border border-slate-100 text-center">
            <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-3">App 2 encountered an error while opening this section.</h2>
            <p className="text-slate-500 font-medium mb-8">This may be due to a temporary module loading issue. Please try refreshing or returning to the dashboard.</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/20"
              >
                Retry
              </button>
              <button 
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = "/";
                }}
                className="w-full py-4 bg-slate-100 text-slate-900 rounded-xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Return to Dashboard
              </button>
            </div>

            <details className="mt-8 text-left">
              <summary className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:text-slate-600">View Technical Details</summary>
              <div className="mt-4 p-4 bg-slate-50 rounded-xl text-[10px] font-mono text-slate-600 break-all overflow-auto max-h-40">
                <p className="font-bold mb-1">Message: {this.state.error?.message}</p>
                <p className="font-bold mb-1">Stack: {this.state.error?.stack}</p>
                <p>Timestamp: {new Date().toISOString()}</p>
              </div>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
