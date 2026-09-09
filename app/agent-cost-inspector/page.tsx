export default function AgentCostInspector() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; All demos
      </a>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">
        Agent Cost/Context Inspector
      </h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        In progress. Paste or upload a trace of an agentic session and see
        where its tokens actually went: redundant context reloads, cache
        misses caused by poor scheduling, and oversized tool outputs, then
        get concrete suggestions to fix them.
      </p>
    </main>
  );
}
