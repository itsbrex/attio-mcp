/**
 * Main transformer module that delegates to specific transformers
 * based on resource type
 */

import { debug } from '../../utils/logger.js';
import type {
  OpenAIFetchResult,
  OpenAISearchResult,
  SupportedAttioType,
} from '../types.js';
import { transformCompany } from './companies.js';
import { transformGenericRecord } from './generic.js';
import { transformList } from './lists.js';
import { transformPerson } from './people.js';
import { transformTask } from './tasks.js';

/**
 * Transform an Attio record to OpenAI search result format
 * @param record - Attio record
 * @param resourceType - Type of the record
 * @returns OpenAI search result or null if transformation fails
 */
export function transformToSearchResult(
  record: any,
  resourceTypeOrPipeline: any,
  maybeResourceType?: any
): OpenAISearchResult | null {
  // Legacy signature support: (record, pipelineName, resourceType)
  const resourceType: SupportedAttioType = (
    typeof maybeResourceType === 'string'
      ? maybeResourceType
      : resourceTypeOrPipeline
  ) as SupportedAttioType;
  if (!(record && record.id)) {
    return null;
  }

  debug(
    'Transform',
    `Converting ${resourceType} to search result`,
    { resourceType },
    'transformToSearchResult'
  );

  try {
    switch (resourceType) {
      case 'companies':
        return transformCompany.toSearchResult(record);

      case 'people':
        return transformPerson.toSearchResult(record);

      case 'lists':
        return transformList.toSearchResult(record);

      case 'tasks':
        return transformTask.toSearchResult(record);

      default:
        return transformGenericRecord.toSearchResult(record, resourceType);
    }
  } catch (error: any) {
    debug(
      'Transform',
      `Failed to transform ${resourceType} record`,
      { resourceType, error: error.message },
      'transformToSearchResult'
    );
    return null;
  }
}

/**
 * Transform an Attio record to OpenAI fetch result format
 * @param record - Attio record
 * @param resourceType - Type of the record
 * @returns OpenAI fetch result or null if transformation fails
 */
export function transformToFetchResult(
  record: any,
  resourceTypeOrPipeline: any,
  maybeResourceType?: any
): OpenAIFetchResult | null {
  // Legacy signature support: (record, pipelineName, resourceType)
  const resourceType: SupportedAttioType = (
    typeof maybeResourceType === 'string'
      ? maybeResourceType
      : resourceTypeOrPipeline
  ) as SupportedAttioType;
  if (!(record && record.id)) {
    return null;
  }

  debug(
    'Transform',
    `Converting ${resourceType} to fetch result`,
    { resourceType },
    'transformToFetchResult'
  );

  try {
    switch (resourceType) {
      case 'companies':
        return transformCompany.toFetchResult(record);

      case 'people':
        return transformPerson.toFetchResult(record);

      case 'lists':
        return transformList.toFetchResult(record);

      case 'tasks':
        return transformTask.toFetchResult(record);

      case 'deals':
        // Map deal values to legacy flat structure
        if (record?.values) {
          const flat: any = {};
          const vals = record.values as Record<string, any>;
          if (vals.name) flat.name = extractAttributeValue(vals.name);
          if (vals.value)
            flat.value = Number(extractAttributeValue(vals.value));
          if (vals.currency)
            flat.currency = extractAttributeValue(vals.currency);
          if (vals.stage) flat.stage = extractAttributeValue(vals.stage);
          if (vals.close_date)
            flat.close_date = extractAttributeValue(vals.close_date);
          if (Array.isArray(vals.owner) && vals.owner[0]?.target_record_id) {
            flat.owner = vals.owner[0].target_record_id;
          }
          if (
            Array.isArray(vals.company) &&
            vals.company[0]?.target_record_id
          ) {
            flat.company = vals.company[0].target_record_id;
          }
          // Reconstruct a record compatible with generic transformer
          const rec = {
            id: {
              deal_id: record.id?.deal_id || record.id?.record_id || record.id,
            },
            attributes: flat,
          };
          const base = transformGenericRecord.toFetchResult(rec, 'deals');
          if (base) {
            return {
              id: `deals:${rec.id.deal_id}`,
              url: generateRecordUrl(rec.id.deal_id, 'deals'),
              data: flat,
            } as OpenAIFetchResult;
          }
        }
        return transformGenericRecord.toFetchResult(record, 'deals');

      default:
        return transformGenericRecord.toFetchResult(record, resourceType);
    }
  } catch (error: any) {
    debug(
      'Transform',
      `Failed to transform ${resourceType} record`,
      { resourceType, error: error.message },
      'transformToFetchResult'
    );
    return null;
  }
}

/**
 * Extract text value from an Attio attribute
 * @param attribute - Attio attribute object
 * @returns String value or empty string
 */
export function extractAttributeValue(attribute: any): string {
  if (!attribute) return '';

  // Handle different attribute structures
  if (typeof attribute === 'string') return attribute;
  if (typeof attribute === 'number') return String(attribute);
  if (attribute.value !== undefined) {
    // Preserve numeric values for downstream typed consumption when needed
    const v = attribute.value;
    if (typeof v === 'number') return String(v);
    return String(v);
  }
  if (attribute.text) return attribute.text;
  if (attribute.name) return attribute.name;

  // Handle email_address, phone_number fields
  if (attribute.email_address) return attribute.email_address;
  if (attribute.phone_number) return attribute.phone_number;

  // For arrays, join values
  if (Array.isArray(attribute)) {
    // Legacy format expects first value for single-valued fields
    if (attribute.length === 0) return '';
    return extractAttributeValue(attribute[0]);
  }

  // For objects with nested values
  if (attribute.values && Array.isArray(attribute.values)) {
    return attribute.values
      .map((v: any) => extractAttributeValue(v))
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

/**
 * Build a text description from multiple attributes
 * @param attributes - Object containing attributes
 * @param fields - List of field names to include
 * @returns Combined text description
 */
export function buildTextDescription(
  attributes: any,
  fields: string[]
): string {
  const parts: string[] = [];

  for (const field of fields) {
    const value = extractAttributeValue(attributes[field]);
    if (value) {
      parts.push(value);
    }
  }

  return parts.join(' • ');
}

/**
 * Generate a URL for an Attio record
 * @param recordId - Record ID
 * @param resourceType - Type of resource
 * @returns URL string
 */
export function generateRecordUrl(
  recordId: string,
  resourceType: string
): string {
  // You can customize this based on your Attio workspace URL
  const baseUrl = process.env.ATTIO_BASE_URL || 'https://app.attio.com';

  switch (resourceType) {
    case 'companies':
      return `${baseUrl}/companies/${recordId}`;
    case 'people':
      return `${baseUrl}/people/${recordId}`;
    case 'lists':
      return `${baseUrl}/lists/${recordId}`;
    case 'tasks':
      return `${baseUrl}/tasks/${recordId}`;
    default:
      return `${baseUrl}/${resourceType}/${recordId}`;
  }
}
