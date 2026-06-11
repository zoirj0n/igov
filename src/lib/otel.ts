import { type Attributes, type Span, SpanStatusCode, context, trace } from "@opentelemetry/api";

const TRACER_NAME = "country-intel";

export function tracer() {
  return trace.getTracer(TRACER_NAME);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes: Attributes = {},
): Promise<T> {
  const span = tracer().startSpan(name, { attributes });
  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    span.end();
  }
}

export function addEvent(name: string, attributes: Attributes = {}): void {
  trace.getActiveSpan()?.addEvent(name, attributes);
}

export function setAttributes(attributes: Attributes): void {
  trace.getActiveSpan()?.setAttributes(attributes);
}
