export default function IncidentCorrelationSandbox() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; All demos
      </a>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">
        Incident Correlation Sandbox
      </h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        Planned. A small multi-service demo with injectable failures: trigger
        a shared-dependency degradation and watch the correlated latency
        spike across services in a live dashboard. The backend simulation
        logic will live in a separate FastAPI repository; this page will host
        the frontend once that's ready.
      </p>
    </main>
  );
}
