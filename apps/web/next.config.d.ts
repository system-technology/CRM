import type { NextConfig } from 'next';

interface HeadersEntry {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

interface NextConfigWithHeaders extends NextConfig {
  headers?: () => Promise<HeadersEntry[]>;
}

declare module '*.mjs' {
  const config: NextConfigWithHeaders;
  export default config;
}
