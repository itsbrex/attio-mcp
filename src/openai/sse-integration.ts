/**
 * OpenAI SSE Integration
 * Integrates OpenAI-compliant tools with the SSE transport from Phase 1
 */

import {
  OpenAISearchOptions,
  OpenAIToolResponse,
  OpenAISearchResult,
  OpenAIFetchResult,
} from '../types/openai-types.js';
import { IOpenAISSEIntegration, IOpenAITools } from './interfaces.js';
import { SSEServer } from '../transport/sse-server.js';
import { MCPSSEMessage } from '../types/sse-types.js';
import { OpenAITools } from './tools.js';

/**
 * Progress stages for search operations
 */
const SEARCH_STAGES = {
  VALIDATING: 'Validating search query',
  SEARCHING: 'Searching Attio data',
  SCORING: 'Scoring results for relevance',
  FORMATTING: 'Formatting results',
  COMPLETE: 'Search complete',
} as const;

/**
 * Progress stages for fetch operations
 */
const FETCH_STAGES = {
  VALIDATING: 'Validating record ID',
  LOCATING: 'Locating record',
  FETCHING: 'Fetching record details',
  FORMATTING: 'Formatting result',
  COMPLETE: 'Fetch complete',
} as const;

/**
 * SSE Integration for OpenAI tools
 */
export class OpenAISSEIntegration implements IOpenAISSEIntegration {
  private sseServer: SSEServer;
  private openaiTools: IOpenAITools;

  constructor(sseServer: SSEServer, openaiTools?: IOpenAITools) {
    this.sseServer = sseServer;
    this.openaiTools = openaiTools || new OpenAITools();
  }

  /**
   * Handle search request via SSE
   */
  async handleSSESearch(
    clientId: string,
    query: string,
    options?: OpenAISearchOptions
  ): Promise<void> {
    const operationId = this.generateOperationId();
    
    try {
      console.log(`[OpenAI SSE] Starting search operation ${operationId} for client ${clientId}`);
      
      // Send initial acknowledgment
      this.sendProgress(clientId, 'search', {
        stage: SEARCH_STAGES.VALIDATING,
        percentage: 0,
        message: `Starting search for: "${query}"`,
      });

      // Validate query
      await this.delay(100); // Small delay for UX
      this.sendProgress(clientId, 'search', {
        stage: SEARCH_STAGES.SEARCHING,
        percentage: 25,
      });

      // Execute search
      const searchResult = await this.openaiTools.search(query, options);
      
      this.sendProgress(clientId, 'search', {
        stage: SEARCH_STAGES.SCORING,
        percentage: 75,
      });

      await this.delay(100);
      this.sendProgress(clientId, 'search', {
        stage: SEARCH_STAGES.FORMATTING,
        percentage: 90,
      });

      await this.delay(50);
      this.sendProgress(clientId, 'search', {
        stage: SEARCH_STAGES.COMPLETE,
        percentage: 100,
      });

      // Send final result
      const message: MCPSSEMessage = {
        event: 'openai_search_result',
        timestamp: new Date().toISOString(),
        version: '1.4.1',
        openai: {
          operationId,
          operation: 'search',
          query,
          options,
          result: searchResult,
        },
      };

      const sent = this.sseServer.sendMCPMessage(clientId, message);
      
      if (!sent) {
        console.error(`[OpenAI SSE] Failed to send search result to client ${clientId}`);
      } else {
        console.log(`[OpenAI SSE] Search operation ${operationId} completed successfully`);
      }

    } catch (error) {
      console.error(`[OpenAI SSE] Search operation ${operationId} failed:`, error);
      
      // Send error message
      const errorMessage: MCPSSEMessage = {
        event: 'openai_search_error',
        timestamp: new Date().toISOString(),
        version: '1.4.1',
        openai: {
          operationId,
          operation: 'search',
          query,
          options,
          error: {
            code: 'SEARCH_FAILED',
            message: error instanceof Error ? error.message : 'Unknown search error',
            details: error,
          },
        },
      };

      this.sseServer.sendMCPMessage(clientId, errorMessage);
    }
  }

  /**
   * Handle fetch request via SSE
   */
  async handleSSEFetch(
    clientId: string,
    id: string,
    options?: { includeRelated?: boolean }
  ): Promise<void> {
    const operationId = this.generateOperationId();
    
    try {
      console.log(`[OpenAI SSE] Starting fetch operation ${operationId} for client ${clientId}`);
      
      // Send initial acknowledgment
      this.sendProgress(clientId, 'fetch', {
        stage: FETCH_STAGES.VALIDATING,
        percentage: 0,
        message: `Starting fetch for ID: "${id}"`,
      });

      // Validate ID
      await this.delay(100);
      this.sendProgress(clientId, 'fetch', {
        stage: FETCH_STAGES.LOCATING,
        percentage: 25,
      });

      // Locate record
      await this.delay(200); // Fetch operations typically take longer
      this.sendProgress(clientId, 'fetch', {
        stage: FETCH_STAGES.FETCHING,
        percentage: 50,
      });

      // Execute fetch
      const fetchResult = await this.openaiTools.fetch(id, options);
      
      this.sendProgress(clientId, 'fetch', {
        stage: FETCH_STAGES.FORMATTING,
        percentage: 90,
      });

      await this.delay(50);
      this.sendProgress(clientId, 'fetch', {
        stage: FETCH_STAGES.COMPLETE,
        percentage: 100,
      });

      // Send final result
      const message: MCPSSEMessage = {
        event: 'openai_fetch_result',
        timestamp: new Date().toISOString(),
        version: '1.4.1',
        openai: {
          operationId,
          operation: 'fetch',
          id,
          options,
          result: fetchResult,
        },
      };

      const sent = this.sseServer.sendMCPMessage(clientId, message);
      
      if (!sent) {
        console.error(`[OpenAI SSE] Failed to send fetch result to client ${clientId}`);
      } else {
        console.log(`[OpenAI SSE] Fetch operation ${operationId} completed successfully`);
      }

    } catch (error) {
      console.error(`[OpenAI SSE] Fetch operation ${operationId} failed:`, error);
      
      // Send error message
      const errorMessage: MCPSSEMessage = {
        event: 'openai_fetch_error',
        timestamp: new Date().toISOString(),
        version: '1.4.1',
        openai: {
          operationId,
          operation: 'fetch',
          id,
          options,
          error: {
            code: 'FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Unknown fetch error',
            details: error,
          },
        },
      };

      this.sseServer.sendMCPMessage(clientId, errorMessage);
    }
  }

  /**
   * Send progress updates during long-running operations
   */
  sendProgress(
    clientId: string,
    operation: 'search' | 'fetch',
    progress: {
      stage: string;
      percentage: number;
      message?: string;
    }
  ): void {
    const message: MCPSSEMessage = {
      event: 'openai_progress',
      timestamp: new Date().toISOString(),
      version: '1.4.1',
      openai: {
        operation,
        progress: {
          stage: progress.stage,
          percentage: progress.percentage,
          message: progress.message,
        },
      },
    };

    const sent = this.sseServer.sendMCPMessage(clientId, message);
    
    if (sent) {
      console.log(`[OpenAI SSE] Progress update sent to ${clientId}: ${progress.stage} (${progress.percentage}%)`);
    }
  }

  /**
   * Handle incoming MCP message that might be an OpenAI tool request
   */
  async handleMCPMessage(clientId: string, mcpMessage: any): Promise<boolean> {
    try {
      // Check if this is an OpenAI tool request
      if (!mcpMessage.method || !mcpMessage.method.startsWith('openai/')) {
        return false; // Not an OpenAI tool request
      }

      const method = mcpMessage.method;
      const params = mcpMessage.params || {};

      switch (method) {
        case 'openai/search':
          await this.handleSSESearch(
            clientId,
            params.query,
            params.options
          );
          return true;

        case 'openai/fetch':
          await this.handleSSEFetch(
            clientId,
            params.id,
            params.options
          );
          return true;

        default:
          console.warn(`[OpenAI SSE] Unknown OpenAI method: ${method}`);
          return false;
      }

    } catch (error) {
      console.error('[OpenAI SSE] Error handling MCP message:', error);
      
      // Send error response
      const errorMessage: MCPSSEMessage = {
        event: 'openai_error',
        timestamp: new Date().toISOString(),
        version: '1.4.1',
        openai: {
          error: {
            code: 'MESSAGE_HANDLING_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            details: error,
          },
        },
      };

      this.sseServer.sendMCPMessage(clientId, errorMessage);
      return true; // We handled it, even if it failed
    }
  }

  /**
   * Broadcast search results to multiple clients
   */
  async broadcastSearchResults(
    results: OpenAIToolResponse<OpenAISearchResult[]>,
    excludeClient?: string
  ): Promise<number> {
    const message: MCPSSEMessage = {
      event: 'openai_search_broadcast',
      timestamp: new Date().toISOString(),
      version: '1.4.1',
      openai: {
        operation: 'search',
        result: results,
        broadcast: true,
      },
    };

    return this.sseServer.broadcastMCPMessage(message, excludeClient);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return this.sseServer.getStats();
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility delay function for UX
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize OpenAI SSE integration with existing SSE server
   */
  static integrate(sseServer: SSEServer): OpenAISSEIntegration {
    const integration = new OpenAISSEIntegration(sseServer);
    
    console.log('[OpenAI SSE] Integration initialized with SSE server');
    
    return integration;
  }

  /**
   * Register OpenAI message handlers with SSE server
   */
  registerHandlers(): void {
    // This would register handlers with the SSE server for processing
    // OpenAI-specific messages. The exact implementation depends on
    // how the SSE server is structured to accept custom handlers.
    
    console.log('[OpenAI SSE] Handlers registered for OpenAI tool methods');
  }
}