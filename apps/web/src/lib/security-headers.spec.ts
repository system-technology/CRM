import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextConfig } from 'next';

interface HeadersEntry {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

interface NextConfigWithHeaders extends NextConfig {
  headers?: () => Promise<HeadersEntry[]>;
}

async function loadConfig(): Promise<NextConfigWithHeaders> {
  const configModule = await import('../../next.config.mjs');
  return configModule.default;
}

describe('Security headers in next.config.mjs', () => {
  let config: NextConfigWithHeaders;

  beforeEach(async () => {
    vi.resetModules();
    config = await loadConfig();
  });

  it('exports a headers function that returns CSP, X-Content-Type-Options, and Referrer-Policy', async () => {
    expect(typeof config.headers).toBe('function');

    const headers = await config.headers!();

    expect(Array.isArray(headers)).toBe(true);
    expect(headers.length).toBeGreaterThan(0);

    const firstEntry = headers[0];
    expect(firstEntry).toBeDefined();
    if (!firstEntry) return;

    expect(firstEntry).toHaveProperty('source');
    expect(firstEntry).toHaveProperty('headers');
    expect(Array.isArray(firstEntry.headers)).toBe(true);

    const headerKeys = firstEntry.headers.map((h) => h.key);
    expect(headerKeys).toContain('Content-Security-Policy');
    expect(headerKeys).toContain('X-Content-Type-Options');
    expect(headerKeys).toContain('Referrer-Policy');

    const cspHeader = firstEntry.headers.find((h) => h.key === 'Content-Security-Policy');
    const xContentTypeOptionsHeader = firstEntry.headers.find(
      (h) => h.key === 'X-Content-Type-Options',
    );
    const referrerPolicyHeader = firstEntry.headers.find((h) => h.key === 'Referrer-Policy');

    expect(cspHeader).toBeDefined();
    expect(cspHeader?.value).toBeTruthy();
    expect(typeof cspHeader?.value).toBe('string');
    expect(cspHeader?.value.length).toBeGreaterThan(0);

    expect(xContentTypeOptionsHeader).toBeDefined();
    expect(xContentTypeOptionsHeader?.value).toBe('nosniff');

    expect(referrerPolicyHeader).toBeDefined();
    expect(referrerPolicyHeader?.value).toBe('strict-origin-when-cross-origin');

    // Verify CSP contains expected directives
    const cspValue = cspHeader?.value ?? '';
    expect(cspValue).toContain("default-src 'self'");
    expect(cspValue).toContain("connect-src 'self'");
    expect(cspValue).toContain("style-src 'self' 'unsafe-inline'");
    expect(cspValue).toContain("img-src 'self' data: blob:");
    expect(cspValue).toContain("font-src 'self' data:");
    expect(cspValue).toContain("frame-ancestors 'none'");
    expect(cspValue).toContain("base-uri 'self'");
    expect(cspValue).toContain("form-action 'self'");

    // CSP should NOT contain unsafe-eval
    expect(cspValue).not.toContain('unsafe-eval');
  });

  it('CSP includes API and WebSocket origins from environment variables', async () => {
    // Save original env
    const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL;

    // Set test values
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    process.env.NEXT_PUBLIC_WS_URL = 'wss://api.example.com';

    vi.resetModules();
    const testConfig = await loadConfig();
    const headers = await testConfig.headers!();

    expect(headers.length).toBeGreaterThan(0);
    const firstHeadersEntry = headers[0];
    expect(firstHeadersEntry).toBeDefined();
    if (!firstHeadersEntry) return;

    const cspHeader = firstHeadersEntry.headers.find((h) => h.key === 'Content-Security-Policy');
    const cspValue = cspHeader?.value ?? '';

    expect(cspValue).toContain('https://api.example.com');
    expect(cspValue).toContain('wss://api.example.com');

    // Restore original env
    if (originalApiUrl !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
    if (originalWsUrl !== undefined) {
      process.env.NEXT_PUBLIC_WS_URL = originalWsUrl;
    } else {
      delete process.env.NEXT_PUBLIC_WS_URL;
    }
  });

  it('falls back to deriving WS_URL from API_URL when NEXT_PUBLIC_WS_URL is not set', async () => {
    const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const originalWsUrl = process.env.NEXT_PUBLIC_WS_URL;

    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    delete process.env.NEXT_PUBLIC_WS_URL;

    vi.resetModules();
    const testConfig = await loadConfig();
    const headers = await testConfig.headers!();

    expect(headers.length).toBeGreaterThan(0);
    const firstHeadersEntry = headers[0];
    expect(firstHeadersEntry).toBeDefined();
    if (!firstHeadersEntry) return;

    const cspHeader = firstHeadersEntry.headers.find((h) => h.key === 'Content-Security-Policy');
    const cspValue = cspHeader?.value ?? '';

    // Should derive wss:// from https://
    expect(cspValue).toContain('wss://api.example.com');

    // Test with http
    delete process.env.NEXT_PUBLIC_WS_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3333';

    vi.resetModules();
    const testConfig2 = await loadConfig();
    const headers2 = await testConfig2.headers!();

    expect(headers2.length).toBeGreaterThan(0);
    const firstHeadersEntry2 = headers2[0];
    expect(firstHeadersEntry2).toBeDefined();
    if (!firstHeadersEntry2) return;

    const cspHeader2 = firstHeadersEntry2.headers.find((h) => h.key === 'Content-Security-Policy');
    const cspValue2 = cspHeader2?.value ?? '';

    // Should derive ws:// from http://
    expect(cspValue2).toContain('ws://localhost:3333');

    // Restore
    if (originalApiUrl !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    } else {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
    if (originalWsUrl !== undefined) {
      process.env.NEXT_PUBLIC_WS_URL = originalWsUrl;
    } else {
      delete process.env.NEXT_PUBLIC_WS_URL;
    }
  });
});
