# idimma-sre-projects

Live, runnable demos for [idimma.tech](https://idimma.tech), deployed to `sre-projects.idimma.tech` via GCP Cloud Run. Each demo proves a specific platform-engineering or SRE skill with real, inspectable code rather than a written description alone.

Case studies (the narrative side of this work) live in the [idimma-tech](https://github.com/Idimmusix/idimma-tech) repo, not here.

## Demos

| Demo | Status | Backend |
|---|---|---|
| [Agent Cost/Context Inspector](#agent-costcontext-inspector) | Live | None (self-contained) |
| [Multi-Backend Observability CLI](#multi-backend-observability-cli) | Planned | N/A (standalone CLI, own repo) |
| [Incident Correlation Sandbox](#incident-correlation-sandbox) | Planned | Separate FastAPI repo |
| [SLO/Error-Budget Dashboard](#sloerror-budget-dashboard) | Planned | Separate FastAPI repo |

### Agent Cost/Context Inspector

Agentic and LLM-assisted workflows need the same operational discipline as any other production dependency: cost attribution, not just a total bill. This tool takes a trace of an agent session and runs it against three detection rules (cache-boundary violations, tool-output bloat, redundant context reloads), each specified like a production alerting rule: a trigger condition, the underlying defect, and the cost impact. Self-contained in this Next.js app, no backend service required, since analysis is a pure function over the trace. The operational counterpart to the "Designing for the Cache Window, Not the Clock" case study on the main site.

### Multi-Backend Observability CLI

A single CLI that unifies queries across multiple observability backends (logs, metrics, SQL) behind one interface, with self-renewing auth so you stop hand-rolling `curl` calls for every backend separately. This is a real installable tool, not a browser demo, so it lives in its own repo rather than as a page in this app. This page will link out to that repo once it exists.

### Incident Correlation Sandbox

A small multi-service demo with injectable failures: trigger a "shared dependency degrades" scenario and watch the correlated latency spike across services in a live dashboard, turning the "shared dependency" case study into something you can click and watch happen. Needs real simulated service state, so its logic lives in a separate FastAPI backend repo; this app only hosts the frontend.

### SLO/Error-Budget Dashboard

A Prometheus/Grafana-style burn-rate visualization with alert rules provisioned via API, demonstrating SLO *design* rather than just dashboard setup. Needs a time-series data source, so its logic lives in a separate FastAPI backend repo; this app only hosts the frontend.

## Stack

- Next.js (App Router, TypeScript, Tailwind)
- Deployed to GCP Cloud Run under `sre-projects.idimma.tech`
- Backends that need real compute/state live in their own separate repos (FastAPI), never folded into this repo

## Development

```bash
npm install
npm run dev
```
