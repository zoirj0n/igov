import { registerOTel } from "@vercel/otel";

export function register(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  registerOTel({
    serviceName: "country-intel-web",
    attributes: {
      "service.version": process.env.npm_package_version ?? "0.1.0",
      "deployment.environment": process.env.NODE_ENV ?? "development",
      "service.namespace": "country-intel",
    },
  });
}
