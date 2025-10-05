/**
 * Factory function to create and configure an MCP server instance
 * This centralizes all server setup logic to be reused by different transports
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createScopedLogger } from '../utils/logger.js';
import { z } from 'zod';
import { registerResourceHandlers } from '../handlers/resources.js';
import { registerToolHandlers } from '../handlers/tools/index.js';
import { registerPromptHandlers } from '../prompts/handlers.js';
import { setGlobalContext } from '../api/lazy-client.js';

/**
 * Context interface for passing configuration to the server
 */
export interface ServerContext {
  getApiKey?: () => string | undefined;
  getWorkspaceId?: () => string | undefined;
  [key: string]: unknown;
}

/**
 * Configuration schema for Smithery/Playground auto-discovery
 * This allows scanners to build a test configuration without guessing.
 */
export const configSchema = z.object({
  ATTIO_API_KEY: z.string().min(1).optional().describe('Attio API key'),
  ATTIO_TEST_API_KEY: z
    .string()
    .min(1)
    .optional()
    .describe('Attio test API key (used when ATTIO_USE_TEST_WORKSPACE=true)'),
  ATTIO_WORKSPACE_ID: z
    .string()
    .min(1)
    .optional()
    .describe('Attio workspace ID'),
  ATTIO_TEST_WORKSPACE_ID: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Attio test workspace ID (used when ATTIO_USE_TEST_WORKSPACE=true)'
    ),
  ATTIO_USE_TEST_WORKSPACE: z
    .string()
    .optional()
    .describe('Set to "true" to use test workspace instead of production'),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .describe('Comma-separated CORS origins'),
  debug: z.boolean().default(false).describe('Enable verbose logging'),
});

/**
 * Creates an MCP server instance
 *
 * @param context - Optional context for configuration (used by Smithery)
 * @returns Configured MCP server instance
 */
export async function createServer(context?: ServerContext) {
  const startTime = Date.now();
  createScopedLogger('mcp.init', 'createServer').info(
    'Server creation started'
  );

  // For backward compatibility: if no context provided (STDIO mode),
  // create one that reads from environment variables
  // If ATTIO_USE_TEST_WORKSPACE=true, use test credentials to prevent production changes
  const useTestWorkspace =
    process.env.ATTIO_USE_TEST_WORKSPACE?.toLowerCase() === 'true';
  const ctx: ServerContext = context || {
    getApiKey: () =>
      useTestWorkspace
        ? process.env.ATTIO_TEST_API_KEY
        : process.env.ATTIO_API_KEY,
    getWorkspaceId: () =>
      useTestWorkspace
        ? process.env.ATTIO_TEST_WORKSPACE_ID
        : process.env.ATTIO_WORKSPACE_ID,
  };

  // Set the global context so lazy client can access it
  setGlobalContext(ctx);
  createScopedLogger('mcp.init', 'createServer').info('Global context set');

  // Create MCP server with proper capabilities declaration
  // Note: No API key validation here - it's checked when tools are invoked
  const mcpServer = new Server(
    {
      name: 'attio-mcp-server',
      version: '0.2.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {
          list: {},
          get: {},
        },
      },
    }
  );

  // Register all handlers with the context
  // The handlers will use the context to get API key when needed
  createScopedLogger('mcp.init', 'createServer').info('Registering handlers');
  registerResourceHandlers(mcpServer, ctx);
  registerToolHandlers(mcpServer, ctx);
  await registerPromptHandlers(mcpServer, ctx);

  const duration = Date.now() - startTime;
  createScopedLogger('mcp.init', 'createServer').info('Server created', {
    durationMs: duration,
  });
  return mcpServer;
}
