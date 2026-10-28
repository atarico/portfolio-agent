interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start justify-between gap-4 rounded-lg border border-l-[3px] border-rule border-l-bad bg-paper-raised px-4 py-3 text-sm"
    >
      <div className="min-w-0">
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.16em] text-bad">Request failed</span>
        <p className="mt-1 break-words text-ink">{message}</p>
      </div>
      <button
        type="button"
        className="shrink-0 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
