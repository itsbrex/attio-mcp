/**
 * Transformer for company records (moved to transform/base)
 */

import {
  buildTextDescription,
  extractAttributeValue,
  generateRecordUrl,
} from '../../transformers/index.js';
import type { OpenAIFetchResult, OpenAISearchResult } from '../../types.js';

export const transformCompany = {
  toSearchResult(company: any): OpenAISearchResult {
    const id = company.id?.record_id || company.id?.company_id || company.id;

    const attrs = company.attributes || company.values || {};

    const name = extractAttributeValue(attrs.name || company.name);
    const domain = extractAttributeValue(
      attrs.domains || attrs.domain || company.domains || company.domain
    );
    const description = extractAttributeValue(
      attrs.description || company.description
    );

    const textParts: string[] = [];
    if (domain) textParts.push(`Domain: ${domain}`);
    if (description) textParts.push(description);

    const city = extractAttributeValue(company.attributes?.city);
    const state = extractAttributeValue(company.attributes?.state);
    const country = extractAttributeValue(company.attributes?.country);
    const location = [city, state, country].filter(Boolean).join(', ');
    if (location) textParts.push(`Location: ${location}`);

    const industry = extractAttributeValue(company.attributes?.industry);
    if (industry) textParts.push(`Industry: ${industry}`);

    return {
      id: `companies:${id}`,
      title: name || 'Unnamed Company',
      text: textParts.join(' • ') || 'No description available',
      url: generateRecordUrl(id, 'companies'),
    };
  },

  toFetchResult(company: any): OpenAIFetchResult {
    const searchResult = this.toSearchResult(company);

    const metadata: Record<string, any> = {};
    const attributes = company.attributes || company.values || {};

    if (attributes.phone_numbers) {
      metadata.phone_numbers = extractAttributeValue(attributes.phone_numbers);
    }
    if (attributes.email_addresses) {
      metadata.email_addresses = extractAttributeValue(
        attributes.email_addresses
      );
    }

    const domain = extractAttributeValue(
      attributes.domain || attributes.domains
    );
    if (domain) {
      metadata.domain = domain;
    }

    const businessFields = [
      'industry',
      'company_size',
      'founded_date',
      'revenue',
      'employee_count',
      'funding_stage',
      'total_funding',
    ];
    for (const field of businessFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        metadata[field] = value;
      }
    }

    const socialFields = [
      'linkedin_url',
      'twitter_url',
      'facebook_url',
      'instagram_url',
      'youtube_url',
      'github_url',
    ];
    for (const field of socialFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        metadata[field] = value;
      }
    }

    const addressFields = [
      'street_address',
      'city',
      'state',
      'postal_code',
      'country',
    ];
    const address: Record<string, string> = {};
    for (const field of addressFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        address[field] = value;
      }
    }
    if (Object.keys(address).length > 0) {
      metadata.address = address;
    }

    if (attributes.tags) {
      metadata.tags = extractAttributeValue(attributes.tags);
    }
    if (attributes.categories) {
      metadata.categories = extractAttributeValue(attributes.categories);
    }

    if (company.relationships) {
      metadata.relationships = company.relationships;
    }

    if (company.created_at) {
      metadata.created_at = company.created_at;
    }
    if (company.updated_at) {
      metadata.updated_at = company.updated_at;
    }

    return {
      ...searchResult,
      data: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  },
};
