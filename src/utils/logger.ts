import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "token",
      "authorization",
      "cookie",
      "*.password",
      "*.token",
      "*.authorization",
      "*.cookie",
    ],
    censor: "[REDACTED]",
  },
  base: {
    service: "country-intel",
    env: process.env.NODE_ENV ?? "development",
  },
});
