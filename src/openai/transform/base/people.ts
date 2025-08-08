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

    const attrs = person.values || person.attributes || {};

    const name = extractAttributeValue(attrs.name || person.name);
    const email = extractAttributeValue(
      attrs.email_addresses || person.email_addresses
    );
    const title = extractAttributeValue(attrs.job_title || person.job_title);
    const _company = extractAttributeValue(attrs.company || person.company);

    const textParts: string[] = [];
    if (name) textParts.push(name);
    if (email) textParts.push(`Email: ${email}`);
    if (title) textParts.push(`Title: ${title}`);
    const phone = extractAttributeValue(attrs.phone_numbers);
    if (phone) textParts.push(`Phone: ${phone}`);
    const location = extractAttributeValue(attrs.location);
    if (location) textParts.push(`Location: ${location}`);
    const notes = extractAttributeValue(attrs.notes || person.notes);
    if (notes) textParts.push(`Notes: ${notes}`);

    return {
      id: `people:${id}`,
      title: name || email || 'Unknown Person',
      text: textParts.join('\n') || name || 'No details available',
      url: generateRecordUrl(id, 'people'),
    };
  },

  toFetchResult(person: any): OpenAIFetchResult {
    const id = person.id?.record_id || person.id?.person_id || person.id;
    const attributes = person.values || person.attributes || {};
    const data: Record<string, any> = {};

    const name = extractAttributeValue(attributes.name || person.name);
    if (name) data.name = name;
    const emailRaw = attributes.email_addresses;
    const email = Array.isArray(emailRaw)
      ? emailRaw[0]?.email_address ||
        emailRaw[0]?.value ||
        extractAttributeValue(emailRaw)
      : extractAttributeValue(emailRaw);
    if (email) data.email = email;
    const phoneRaw = attributes.phone_numbers;
    const phone = Array.isArray(phoneRaw)
      ? phoneRaw[0]?.phone_number ||
        phoneRaw[0]?.value ||
        extractAttributeValue(phoneRaw)
      : extractAttributeValue(phoneRaw);
    if (phone) data.phone = phone;
    const title = extractAttributeValue(
      attributes.job_title || person.job_title
    );
    if (title) data.title = title;
    const company = extractAttributeValue(attributes.company || person.company);
    if (company) data.company = company;
    const location = extractAttributeValue(
      attributes.location || person.location
    );
    if (location) data.location = location;

    return {
      id: `people:${id}`,
      url: generateRecordUrl(id, 'people'),
      data: Object.keys(data).length > 0 ? data : undefined,
    } as unknown as OpenAIFetchResult;
  },
};
