import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  i18n: undefined,
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "mammoth",
    "xlsx",
    "@resvg/resvg-js",
    "pptxgenjs",
    "@langchain/langgraph",
    "@langchain/core",
    "@langchain/ollama",
  ],
};

export default config;
