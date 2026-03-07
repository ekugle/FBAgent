"use client";

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8">
      <div className="card p-6 border-red-200 bg-red-50">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Calendar failed to load</h2>
        <p className="text-sm text-red-700 mb-4 font-mono">{error.message}</p>
        <button onClick={reset} className="btn-primary bg-red-600 hover:bg-red-700 text-sm">
          Try again
        </button>
      </div>
    </div>
  );
}
