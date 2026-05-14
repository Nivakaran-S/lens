'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  /** Auto-dismiss after N ms. 0 disables. Default 5000. */
  durationMs?: number;
};

type ToastInput = Omit<Toast, 'id'>;

type ToastContextValue = {
  push: (t: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Provider that holds the toast queue and exposes push/dismiss.
 * Mount once near the root of the app. Renders the <Toaster /> overlay.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: ToastInput): string => {
      const id = Math.random().toString(36).slice(2);
      const next: Toast = {
        id,
        kind: t.kind,
        title: t.title,
        message: t.message,
        durationMs: t.durationMs ?? 5000,
      };
      setToasts((prev) => {
        // Keep at most 3 visible — drop the oldest if over.
        const trimmed = prev.length >= 3 ? prev.slice(prev.length - 2) : prev;
        return [...trimmed, next];
      });
      return id;
    },
    [],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail-soft: if a component pushes a toast outside the provider (e.g. on
    // an auth page that hasn't been wrapped), log a warning instead of
    // crashing. Returning no-ops keeps the page functional.
    if (typeof window !== 'undefined') {
      console.warn('useToast called outside <ToastProvider>; toasts will be ignored');
    }
    return { push: () => '', dismiss: () => {} };
  }
  return ctx;
}

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:items-end sm:left-auto"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast.durationMs || toast.durationMs <= 0) return;
    const t = setTimeout(onDismiss, toast.durationMs);
    return () => clearTimeout(t);
  }, [toast.durationMs, onDismiss]);

  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? XCircle : Info;
  const tint =
    toast.kind === 'success'
      ? 'border-emerald-200 bg-white text-emerald-900 dark:border-emerald-900 dark:bg-zinc-950 dark:text-emerald-200'
      : toast.kind === 'error'
        ? 'border-red-200 bg-white text-red-900 dark:border-red-900 dark:bg-zinc-950 dark:text-red-200'
        : 'border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100';
  const iconTint =
    toast.kind === 'success'
      ? 'text-emerald-600'
      : toast.kind === 'error'
        ? 'text-red-600'
        : 'text-zinc-500';

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${tint}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTint}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{toast.message}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
