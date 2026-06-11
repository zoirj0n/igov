import { readFileSync } from "node:fs";
import path from "node:path";

const ID_RE: Record<string, RegExp> = {
  ERR: /\bERR-(\d+)\b/g,
  FIX: /\bFIX-(\d+)\b/g,
  TODO: /\bTODO-(\d+)\b/g,
  MS: /\bMS-(\d+)\b/g,
};

const FILE_FOR_PREFIX: Record<string, string> = {
  ERR: "logs/errors.md",
  FIX: "logs/fixes.md",
  TODO: "logs/todos.md",
  MS: "logs/milestones.md",
};

function readSafe(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export type LogPrefix = "ERR" | "FIX" | "TODO" | "MS";

/**
 * Allocate the next zero-padded N for a given prefix by scanning the log file.
 * Synchronous + cheap. Caller is responsible for writing the new entry.
 */
export function nextId(prefix: LogPrefix): string {
  const re = ID_RE[prefix]!;
  const file = path.join(process.cwd(), FILE_FOR_PREFIX[prefix]!);
  const raw = readSafe(file);
  let max = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null = re.exec(raw);
  while (m !== null) {
    const n = Number.parseInt(m[1] ?? "0", 10);
    if (Number.isFinite(n) && n > max) max = n;
    m = re.exec(raw);
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function logPathFor(prefix: LogPrefix): string {
  return path.join(process.cwd(), FILE_FOR_PREFIX[prefix]!);
}
