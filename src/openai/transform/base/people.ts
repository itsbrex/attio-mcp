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
    // Legacy shape: expose arrays where available
    const emailRaw = attributes.email_addresses;
    const emailList = Array.isArray(emailRaw)
      ? emailRaw.map((e: any) => e?.email_address || e?.value).filter(Boolean)
      : [];
    if (emailList.length) {
      data.email_addresses = emailList as string[];
      // Legacy single field for compatibility
      data.email = emailList[0];
    }
    const phoneRaw = attributes.phone_numbers;
    const phoneList = Array.isArray(phoneRaw)
      ? phoneRaw.map((p: any) => p?.phone_number || p?.value).filter(Boolean)
      : [];
    if (phoneList.length) {
      data.phone_numbers = phoneList as string[];
      // Legacy single field for compatibility
      data.phone = phoneList[0];
    }
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

    const searchResult = this.toSearchResult(person);
    return {
      ...searchResult,
      data: Object.keys(data).length > 0 ? data : undefined,
    } as unknown as OpenAIFetchResult;
  },
};
