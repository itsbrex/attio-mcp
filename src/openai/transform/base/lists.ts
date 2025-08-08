/**
 * Transformer for list records (moved to transform/base)
 */

import {
  extractAttributeValue,
  generateRecordUrl,
} from '../../transformers/index.js';
import type { OpenAIFetchResult, OpenAISearchResult } from '../../types.js';

export const transformList = {
  toSearchResult(list: any): OpenAISearchResult {
    const id = list.id?.list_id || list.id?.record_id || list.id;
    const attrs = list.values || list.attributes || {};
    const name = list.name || extractAttributeValue(attrs.name);
    const description =
      list.description || extractAttributeValue(attrs.description);

    const textParts: string[] = [];
    if (name) textParts.push(name);
    if (attrs.entries?.[0]?.value !== undefined)
      textParts.push(`Entries: ${extractAttributeValue(attrs.entries)}`);
    if (attrs.created_at)
      textParts.push(`Created: ${extractAttributeValue(attrs.created_at)}`);

    return {
      id: `lists:${id}`,
      title: name || 'Unnamed List',
      text:
        textParts.join('\n') ||
        description ||
        name ||
        'No description available',
      url: generateRecordUrl(id, 'lists'),
    };
  },

  toFetchResult(list: any): OpenAIFetchResult {
    const searchResult = this.toSearchResult(list);
    const metadata: Record<string, any> = {};
    const attrs = list.values || list.attributes || {};

    if (attrs) {
      const valueFields = [
        'name',
        'entries',
        'created_at',
        'description',
        'type',
        'status',
      ];
      for (const field of valueFields) {
        if (attrs[field] !== undefined) {
          const value = extractAttributeValue(attrs[field]);
          if (value) metadata[field] = value;
        }
      }
    }

    if (list.parent_object) metadata.parent_object = list.parent_object;
    if (attrs.entries?.[0]?.value !== undefined)
      metadata.entries = Number(extractAttributeValue(attrs.entries));
    if (list.api_slug) metadata.api_slug = list.api_slug;
    if (list.workspace_id) metadata.workspace_id = list.workspace_id;
    if (list.access_level) metadata.access_level = list.access_level;
    if (list.is_private !== undefined) metadata.is_private = list.is_private;
    if (list.default_sort) metadata.default_sort = list.default_sort;
    if (list.default_filter) metadata.default_filter = list.default_filter;

    if (list.attributes && Array.isArray(list.attributes)) {
      metadata.attributes = list.attributes.map((attr: any) => ({
        id: attr.id,
        name: attr.name,
        type: attr.type,
        is_required: attr.is_required,
        is_unique: attr.is_unique,
      }));
    }

    if (list.created_by) {
      metadata.created_by = {
        id: list.created_by.id,
        name: list.created_by.name,
        email: list.created_by.email,
      };
    }
    if (list.updated_by) {
      metadata.updated_by = {
        id: list.updated_by.id,
        name: list.updated_by.name,
        email: list.updated_by.email,
      };
    }
    if (list.permissions) metadata.permissions = list.permissions;
    if (list.webhooks && Array.isArray(list.webhooks))
      metadata.webhook_count = list.webhooks.length;
    if (list.created_at) metadata.created_at = list.created_at;
    if (list.updated_at) metadata.updated_at = list.updated_at;

    return {
      ...searchResult,
      data: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  },
};
