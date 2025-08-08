/**
 * Transformer for person records (moved to transform/base)
 */

import {
  buildTextDescription,
  extractAttributeValue,
  generateRecordUrl,
} from '../../transformers/index.js';
import type { OpenAIFetchResult, OpenAISearchResult } from '../../types.js';

export const transformPerson = {
  toSearchResult(person: any): OpenAISearchResult {
    const id = person.id?.record_id || person.id?.person_id || person.id;

    const attrs = person.attributes || person.values || {};

    const name = extractAttributeValue(attrs.name || person.name);
    const email = extractAttributeValue(
      attrs.email_addresses || person.email_addresses
    );
    const title = extractAttributeValue(attrs.job_title || person.job_title);
    const company = extractAttributeValue(attrs.company || person.company);

    const textParts: string[] = [];
    if (title) textParts.push(title);
    if (company) textParts.push(`at ${company}`);
    if (email) textParts.push(`Email: ${email}`);

    const phone = extractAttributeValue(person.attributes?.phone_numbers);
    if (phone) textParts.push(`Phone: ${phone}`);

    const location = extractAttributeValue(person.attributes?.location);
    if (location) textParts.push(`Location: ${location}`);

    return {
      id: `people:${id}`,
      title: name || email || 'Unknown Person',
      text: textParts.join(' • ') || 'No details available',
      url: generateRecordUrl(id, 'people'),
    };
  },

  toFetchResult(person: any): OpenAIFetchResult {
    const searchResult = this.toSearchResult(person);

    const metadata: Record<string, any> = {};
    const attributes = person.attributes || person.values || {};

    const professionalFields = [
      'job_title',
      'department',
      'seniority_level',
      'years_in_role',
      'previous_companies',
    ];
    for (const field of professionalFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        metadata[field] = value;
      }
    }

    if (attributes.phone_numbers) {
      const phones = Array.isArray(attributes.phone_numbers)
        ? attributes.phone_numbers.map(
            (p: any) => p.phone_number || p.value || p
          )
        : [extractAttributeValue(attributes.phone_numbers)];
      metadata.phone_numbers = phones.filter(Boolean);
    }
    if (attributes.email_addresses) {
      const emails = Array.isArray(attributes.email_addresses)
        ? attributes.email_addresses.map(
            (e: any) => e.email_address || e.value || e
          )
        : [extractAttributeValue(attributes.email_addresses)];
      metadata.email_addresses = emails.filter(Boolean);
    }

    const socialFields = [
      'linkedin_url',
      'twitter_url',
      'github_url',
      'personal_website',
    ];
    for (const field of socialFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        metadata[field] = value;
      }
    }

    const personalFields = [
      'location',
      'timezone',
      'languages',
      'interests',
      'skills',
    ];
    for (const field of personalFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        metadata[field] = value;
      }
    }

    if (attributes.company) {
      const companyInfo: any = {
        name: extractAttributeValue(attributes.company),
      };
      if (person.relationships?.company) {
        companyInfo.record_id = person.relationships.company.record_id;
        companyInfo.url = generateRecordUrl(
          person.relationships.company.record_id,
          'companies'
        );
      }
      metadata.company = companyInfo;
    }

    if (attributes.tags) {
      metadata.tags = extractAttributeValue(attributes.tags);
    }
    if (attributes.notes) {
      metadata.notes = extractAttributeValue(attributes.notes);
    }

    const statusFields = [
      'lead_status',
      'contact_owner',
      'last_contacted',
      'next_follow_up',
    ];
    for (const field of statusFields) {
      const value = extractAttributeValue(attributes[field]);
      if (value) {
        metadata[field] = value;
      }
    }

    if (person.created_at) {
      metadata.created_at = person.created_at;
    }
    if (person.updated_at) {
      metadata.updated_at = person.updated_at;
    }

    return {
      ...searchResult,
      data: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  },
};
