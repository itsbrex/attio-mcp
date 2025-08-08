/**
 * OpenAI-compliant fetch tool implementation
 * Retrieves detailed information for a specific record
 */

import crypto from 'crypto';
import { getAttioClient } from '../api/attio-client.js';
import { executeToolRequest } from '../handlers/tools/dispatcher.js';
import { debug, warn } from '../utils/logger.js';
import { withErrorHandling } from './advanced/error-recovery.js';
import { features, recordCache } from './advanced/index.js';
import { transformToFetchResult } from './transformers/index.js';
import type { OpenAIFetchResult, SupportedAttioType } from './types.js';

/**
 * Fetch detailed information for a specific record
 * @param id - Record identifier (can be in format "type:id" or just "id")
 * @returns Detailed record information in OpenAI format
 */
export async function fetch(id: string): Promise<OpenAIFetchResult> {
  if (!id || typeof id !== 'string') {
    throw new Error('ID parameter is required and must be a string');
  }

  debug('OpenAI', 'Fetching record with ID', { id }, 'fetch');

  // Generate cache key for this fetch
  const cacheKey = `fetch:${crypto.createHash('md5').update(id).digest('hex')}`;

  // Check cache if enabled
  if (features.isEnabled('enableCache')) {
    const cachedResult = recordCache.get(cacheKey);
    if (cachedResult) {
      debug('OpenAI', 'Cache hit for fetch', { id, cacheKey }, 'fetch');
      return cachedResult as OpenAIFetchResult;
    }
    debug('OpenAI', 'Cache miss for fetch', { id, cacheKey }, 'fetch');
  }

  // Parse the ID to determine resource type
  const { resourceType, recordId } = parseRecordId(id);

  try {
    // Use the universal get-record-details tool with error handling
    const result = await withErrorHandling(
      async () => {
        const request = {
          method: 'tools/call' as const,
          params: {
            name: 'get-record-details',
            arguments: {
              resource_type: resourceType,
              record_id: recordId,
            },
          },
        };
        return executeToolRequest(request);
      },
      {
        operationName: `fetch-${resourceType}`,
        cacheKey,
        cache: 'record',
        context: { resourceType, recordId },
      }
    );

    // Legacy return: { data: {...} } vs toolResult
    if ((result as any).data) {
      const record = (result as any).data;
      const transformed = transformToFetchResult(record, resourceType);
      if (transformed) {
        if (features.isEnabled('enableCache')) {
          recordCache.set(cacheKey, transformed);
          debug('OpenAI', 'Cached fetch result', { id, cacheKey }, 'fetch');
        }
        return transformed;
      }
    } else if (result.toolResult?.type === 'text') {
      // Parse the detailed response
      const record = parseDetailResponse(
        result.toolResult.content,
        resourceType,
        recordId
      );

      // Get additional details using get-detailed-info tool
      const detailsRequest = {
        method: 'tools/call' as const,
        params: {
          name: 'get-detailed-info',
          arguments: {
            resource_type: resourceType,
            record_id: recordId,
            info_type: 'full',
            format: 'object',
          },
        },
      };

      const detailsResult = await withErrorHandling(
        async () => executeToolRequest(detailsRequest),
        {
          operationName: `fetch-details-${resourceType}`,
          cacheKey: `${cacheKey}:details`,
          cache: 'record',
          context: { resourceType, recordId, infoType: 'full' },
        }
      );

      if ((detailsResult as any).data) {
        Object.assign(record, (detailsResult as any).data);
      } else if (detailsResult.toolResult?.type === 'text') {
        const additionalDetails = parseDetailResponse(
          detailsResult.toolResult.content,
          resourceType,
          recordId
        );
        // Merge additional details
        Object.assign(record, additionalDetails);
      }

      // Transform to OpenAI format
      const transformed = transformToFetchResult(record, resourceType);
      if (transformed) {
        // Cache result if enabled
        if (features.isEnabled('enableCache')) {
          recordCache.set(cacheKey, transformed);
          debug('OpenAI', 'Cached fetch result', { id, cacheKey }, 'fetch');
        }

        debug('OpenAI', 'Successfully fetched record', { id }, 'fetch');
        return transformed;
      }
    }

    throw new Error(`Record not found: ${id}`);
  } catch (error: any) {
    // Fallback to direct API call
    debug(
      'OpenAI',
      'Falling back to direct API call',
      { resourceType, recordId },
      'fetch'
    );
    const result = await fetchDirect(resourceType, recordId);

    // Cache fallback result if enabled
    if (features.isEnabled('enableCache')) {
      recordCache.set(cacheKey, result);
      debug(
        'OpenAI',
        'Cached fallback fetch result',
        { id, cacheKey },
        'fetch'
      );
    }

    return result;
  }
}

/**
 * Parse record ID to extract resource type and actual ID
 * @param id - ID string (format: "companies:abc123" or just "abc123")
 * @returns Parsed resource type and record ID
 */
function parseRecordId(id: string): {
  resourceType: SupportedAttioType;
  recordId: string;
} {
  // Check if ID includes resource type prefix
  const parts = id.split(':');

  if (parts.length === 2) {
    const [type, recordId] = parts;
    if (isValidResourceType(type)) {
      return { resourceType: type as SupportedAttioType, recordId };
    }
  }

  // Try to determine type by ID format or default to companies
  // In a real implementation, we might want to search across types
  return { resourceType: 'companies', recordId: id };
}

/**
 * Check if a string is a valid resource type
 */
function isValidResourceType(type: string): boolean {
  return ['companies', 'people', 'lists', 'tasks', 'deals', 'records'].includes(
    type
  );
}

/**
 * Parse the text response from universal detail tools
 * @param content - Text content from tool response
 * @param resourceType - Type of resource
 * @param recordId - Record ID
 * @returns Parsed record object
 */
function parseDetailResponse(
  content: string,
  resourceType: string,
  recordId: string
): any {
  const record: any = {
    id: { record_id: recordId, object: resourceType },
  };

  try {
    // Parse the formatted text response
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();

        if (key && value && !key.includes('ID')) {
          const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');

          // Handle nested attributes
          if (cleanKey === 'attributes' || line.startsWith('  ')) {
            if (!record.attributes) record.attributes = {};
            const attrKey = key.trim().replace(/^-\s*/, '');
            record.attributes[attrKey] = { value };
          } else {
            record[cleanKey] = value;
          }
        }
      }
    }

    return record;
  } catch (error: any) {
    warn('[OpenAI Fetch] Failed to parse detail response:', error);
    return record;
  }
}

/**
 * Direct API implementation for fetching records
 * @param resourceType - Type of resource
 * @param recordId - Record ID
 * @returns Fetch result in OpenAI format
 */
async function fetchDirect(
  resourceType: SupportedAttioType,
  recordId: string
): Promise<OpenAIFetchResult> {
  const client = getAttioClient();

  try {
    let endpoint: string;

    switch (resourceType) {
      case 'companies':
        endpoint = `/objects/companies/records/${recordId}`;
        break;
      case 'people':
        endpoint = `/objects/people/records/${recordId}`;
        break;
      case 'lists':
        endpoint = `/lists/${recordId}`;
        break;
      case 'tasks':
        endpoint = `/tasks/${recordId}`;
        break;
      default:
        endpoint = `/objects/${resourceType}/records/${recordId}`;
    }

    // Handle both real axios client and mocked client
    const response =
      typeof client.get === 'function'
        ? await client.get(endpoint)
        : await (client as any).request({ method: 'GET', url: endpoint });
    const record = response.data.data || response.data;

    // Legacy-aligned direct mappings per type
    if (resourceType === 'people') {
      const id = record.id?.person_id || record.id?.record_id || recordId;
      const vals = record.values || {};
      const name = vals.name?.[0]?.value || vals.name || '';
      const emails = Array.isArray(vals.email_addresses)
        ? vals.email_addresses
            .map((e: any) => e.email_address || e.value)
            .filter(Boolean)
        : [];
      const phones = Array.isArray(vals.phone_numbers)
        ? vals.phone_numbers
            .map((p: any) => p.phone_number || p.value)
            .filter(Boolean)
        : [];
      const jobTitle =
        vals.job_title?.[0]?.value || vals.job_title || undefined;
      const data: Record<string, any> = { name };
      if (emails.length) data.email_addresses = emails;
      if (phones.length) data.phone_numbers = phones;
      if (jobTitle) data.job_title = jobTitle;
      return {
        id: `people:${id}`,
        title: name,
        text: name,
        url: buildUrl('people', id),
        data,
      } as OpenAIFetchResult;
    }

    if (resourceType === 'companies') {
      const id = record.id?.company_id || record.id?.record_id || recordId;
      const vals = record.values || {};
      const name = vals.name?.[0]?.value || vals.name || '';
      const domain =
        vals.domain?.[0]?.value || vals.domains?.[0]?.value || undefined;
      const employeeCount = vals.employee_count?.[0]?.value;
      const industry = vals.industry?.[0]?.value || undefined;
      const data: Record<string, any> = {};
      if (domain) data.domain = domain;
      if (typeof employeeCount === 'number')
        data.employee_count = employeeCount;
      if (industry) data.industry = industry;
      if (name) data.name = name;
      return {
        id: `companies:${id}`,
        title: name,
        text: name,
        url: buildUrl('companies', id),
        data,
      } as OpenAIFetchResult;
    }

    // Default to generic transformation
    const transformed = transformToFetchResult(record, resourceType);
    if (transformed) return transformed;

    throw new Error(`Failed to transform record: ${recordId}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Record not found: ${recordId}`);
    }
    throw error;
  }
}

function buildUrl(type: string, id: string): string {
  return `https://app.attio.com/${type}/${id}`;
}
