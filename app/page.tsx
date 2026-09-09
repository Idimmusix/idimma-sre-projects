type Demo = {
  title: string;
  description: string;
  status: "In progress" | "Planned";
  href: string;
  external?: boolean;
};

const demos: Demo[] = [
  {
    title: "Agent Cost/Context Inspector",
    description:
      "Paste or upload a trace of an agentic session and see where its tokens actually went: redundant context reloads, cache misses, oversized tool outputs.",
    status: "In progress",
    href: "/agent-cost-inspector",
  },
  {
    title: "Multi-Backend Observability CLI",
    description:
      "One CLI that unifies queries across logs, metrics, and SQL backends, with self-renewing auth. A real installable tool, so it lives in its own repository.",
    status: "Planned",
    href: "#",
  },
  {
    title: "Incident Correlation Sandbox",
    description:
      "Trigger a shared-dependency failure across a small multi-service demo and watch the correlated latency spike live.",
    status: "Planned",
    href: "/incident-correlation-sandbox",
  },
  {
    title: "SLO/Error-Budget Dashboard",
    description:
      "A burn-rate visualization with alert rules provisioned via API, demonstrating SLO design, not just dashboard setup.",
    status: "Planned",
    href: "/slo-dashboard",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">SRE Projects</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        Live, runnable demos. Real code, not just descriptions.
      </p>

      <ul className="mt-10 flex flex-col gap-4">
        {demos.map((demo) => (
          <li key={demo.title}>
            <a
              href={demo.href}
              className="block rounded-xl border border-neutral-200 p-5 transition hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">{demo.title}</h2>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    demo.status === "In progress"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {demo.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {demo.description}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
