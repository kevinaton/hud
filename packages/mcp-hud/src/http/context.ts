/**
 * Request-scoped context for HTTP transport.
 *
 * Uses AsyncLocalStorage to make the authenticated identity and request metadata
 * available to tool handlers without threading it through every function call.
 *
 * In stdio mode this store is never populated — tools fall back to process.env.
 * In HTTP mode this is populated by the auth middleware before the MCP transport
 * processes the request.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface HttpRequestContext {
  /** Resolved identity from the bearer token, e.g. 'platform:hermes-gateway' */
  identity: string;
  /** Remote IP address from the HTTP request */
  ipAddress: string;
  /** mcp_request_id — uuidv7 generated per MCP call */
  mcpRequestId: string;
  /** Raw user agent from request headers (or constructed default) */
  userAgent: string;
}

export const httpRequestStorage = new AsyncLocalStorage<HttpRequestContext>();

/**
 * Returns the current HTTP request context if running inside an HTTP-mode request.
 * Returns undefined in stdio mode.
 */
export function getHttpRequestContext(): HttpRequestContext | undefined {
  return httpRequestStorage.getStore();
}
