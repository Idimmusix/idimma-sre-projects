export default function SloDashboard() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; All demos
      </a>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">
        SLO/Error-Budget Dashboard
      </h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        Planned. A burn-rate visualization with alert rules provisioned via
        API, demonstrating SLO design rather than just dashboard setup. The
        time-series backend will live in a separate FastAPI repository; this
        page will host the frontend once that's ready.
      </p>
    </main>
  );
}
