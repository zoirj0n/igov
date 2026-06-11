/**
 * Trace-id helper.
 *
 * Middleware (src/middleware.ts) sets x-request-id on every incoming request
 * + matching response header. Route handlers should read it via getReqId(req)
 * and pass it into log calls so the same request joins across:
 *   - logs/access.jsonl
 *   - logs/audit.jsonl
 *   - logs/llm-calls.jsonl
 *   - logs/retrieval.jsonl
 *   - logs/chat/<sessionId>.jsonl
 */

export function getReqId(req: Request): string {
  return req.headers.get("x-request-id") ?? "—";
}
