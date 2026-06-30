import { registerOTel } from '@vercel/otel';

// OpenTelemetry registration. SvelteKit has no Next.js-style auto-loaded
// `instrumentation.ts`, so we register the OTel provider here in module scope —
// hooks.server.ts is evaluated once at server start, before any request is
// handled. This sets the global @opentelemetry/api tracer that the AI SDK's
// `experimental_telemetry` writes spans to (token usage, latency, model,
// finish reason). On Vercel the spans are collected by the platform's OTel
// collector; off-platform (local/dev) there's no exporter, so it's a no-op.
registerOTel({ serviceName: 'nexus-recall' });
