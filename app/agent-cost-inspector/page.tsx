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
        In progress. A total token bill tells you a system is expensive,
        never why. This tool runs a session trace against three detection
        rules, cache-boundary violations, tool-output bloat, and redundant
        context reloads, each specified like a production alerting rule: a
        trigger condition, the underlying defect, and the cost impact.
      </p>
    </main>
  );
}
