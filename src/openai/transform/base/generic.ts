/**
 * Generic transformer (moved to transform/base)
 */

import {
  extractAttributeValue,
  generateRecordUrl,
} from '../../transformers/index.js';
import type { OpenAIFetchResult, OpenAISearchResult } from '../../types.js';

export const transformGenericRecord = {
  toSearchResult(record: any, resourceType: string): OpenAISearchResult {
    const id = record.id?.record_id || record.id?.deal_id || record.id;

    const titleCandidates = [
      'name',
      'title',
      'subject',
      'headline',
      'label',
      'display_name',
      'full_name',
      'company_name',
    ];
    let title = '';
    for (const candidate of titleCandidates) {
      const value = extractAttributeValue(
        record.attributes?.[candidate] || record[candidate]
      );
      if (value) {
        title = value;
        break;
      }
    }

    const descriptionCandidates = [
      'description',
      'summary',
      'about',
      'bio',
      'content',
      'details',
      'notes',
      'overview',
    ];
    const textParts: string[] = [];
    for (const candidate of descriptionCandidates) {
      const value = extractAttributeValue(
        record.attributes?.[candidate] || record[candidate]
      );
      if (value) {
        textParts.push(value);
        break;
      }
    }
    // Legacy outputs avoid adding synthetic 'Type:' line

    const email = extractAttributeValue(record.attributes?.email_addresses);
    if (email) textParts.push(`Email: ${email}`);
    const domain = extractAttributeValue(record.attributes?.domains);
    if (domain) textParts.push(`Domain: ${domain}`);

    return {
      id: `${resourceType}:${id}`,
      title:
        title ||
        (resourceType === 'deals'
          ? extractAttributeValue(record.attributes?.name) || 'Deal'
          : `${resourceType} Record`),
      text:
        textParts.join('\n') ||
        (resourceType === 'deals' ? '' : 'No details available'),
      url: generateRecordUrl(id, resourceType),
    };
  },

  toFetchResult(record: any, resourceType: string): OpenAIFetchResult {
    const searchResult = this.toSearchResult(record, resourceType);
    const metadata: Record<string, any> = {};

    if (record.attributes && typeof record.attributes === 'object') {
      const attributes: Record<string, any> = {};
      for (const [key, value] of Object.entries(record.attributes)) {
        const extractedValue = extractAttributeValue(value);
        if (extractedValue) attributes[key] = extractedValue;
      }
      if (Object.keys(attributes).length > 0) metadata.attributes = attributes;
    }

    const excludeKeys = [
      'id',
      'attributes',
      'created_at',
      'updated_at',
      'relationships',
      'name',
      'title',
      'description',
    ];
    for (const [key, value] of Object.entries(record)) {
      if (!excludeKeys.includes(key) && value !== null && value !== undefined) {
        metadata[key] = value;
      }
    }

    if (record.relationships && Object.keys(record.relationships).length > 0) {
      metadata.relationships = record.relationships;
    }
    if (record.created_at) metadata.created_at = record.created_at;
    if (record.updated_at) metadata.updated_at = record.updated_at;

    return {
      ...searchResult,
      data: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  },
};
