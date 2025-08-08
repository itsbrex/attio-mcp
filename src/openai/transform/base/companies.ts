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

    const attrs = company.values || company.attributes || {};

    const name = extractAttributeValue(attrs.name || company.name);
    const domain = extractAttributeValue(
      attrs.domain || attrs.domains || company.domain || company.domains
    );
    const description = extractAttributeValue(
      attrs.description || company.description
    );

    const textParts: string[] = [];
    if (name) textParts.push(name);
    if (domain) textParts.push(`Domain: ${domain}`);
    if (extractAttributeValue(attrs.industry))
      textParts.push(`Industry: ${extractAttributeValue(attrs.industry)}`);
    if (extractAttributeValue(attrs.employee_count))
      textParts.push(
        `Employees: ${extractAttributeValue(attrs.employee_count)}`
      );
    if (description) textParts.push(`Description: ${description}`);

    return {
      id: `companies:${id}`,
      title: name || 'Unnamed Company',
      text:
        textParts.join('\n') ||
        description ||
        name ||
        'No description available',
      url: generateRecordUrl(id, 'companies'),
    };
  },

  toFetchResult(company: any): OpenAIFetchResult {
    const id = company.id?.record_id || company.id?.company_id || company.id;
    const attributes = company.values || company.attributes || {};
    const data: Record<string, any> = {};

    const name = extractAttributeValue(attributes.name || company.name);
    if (name) data.name = name;
    const domain = extractAttributeValue(
      attributes.domain || attributes.domains
    );
    if (domain) data.domain = domain;
    const industry = extractAttributeValue(
      attributes.industry || company.industry
    );
    if (industry) data.industry = industry;
    const employeeCountRaw = attributes.employee_count;
    const employeeCount = employeeCountRaw?.[0]?.value ?? undefined;
    if (employeeCount !== undefined)
      data.employee_count = Number(employeeCount);
    const description = extractAttributeValue(
      attributes.description || company.description
    );
    if (description) data.description = description;
    const founded = extractAttributeValue(
      attributes.founded_date || company.founded_date
    );
    if (founded) data.founded_date = founded;

    return {
      id: `companies:${id}`,
      url: generateRecordUrl(id, 'companies'),
      data: Object.keys(data).length > 0 ? data : undefined,
    } as unknown as OpenAIFetchResult;
  },
};
