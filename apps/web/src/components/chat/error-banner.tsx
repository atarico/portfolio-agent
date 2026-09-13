interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start justify-between gap-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
    >
      <p className="break-words">{message}</p>
      <button type="button" className="shrink-0 font-medium underline-offset-2 hover:underline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
