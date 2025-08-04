/**
 * OpenAI Data Transformer
 * Transforms Attio CRM data into OpenAI-compliant formats
 */

import {
  OpenAISearchResult,
  OpenAIFetchResult,
} from '../types/openai-types.js';
import { IOpenAIDataTransformer } from './interfaces.js';
import { AttioRecord } from '../types/attio.js';

/**
 * Default implementation of OpenAI data transformer
 */
export class OpenAIDataTransformer implements IOpenAIDataTransformer {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://app.attio.com') {
    this.baseUrl = baseUrl;
  }

  /**
   * Transform an Attio record to OpenAI search result format
   */
  transformToSearchResult(
    record: any,
    query: string,
    objectType: string
  ): OpenAISearchResult {
    const id = this.extractId(record);
    const title = this.createTitle(record, objectType);
    const text = this.extractTextContent(record, objectType);
    const url = this.generateUrl(id, objectType);

    return {
      id,
      title,
      text,
      url,
    };
  }

  /**
   * Transform an Attio record to OpenAI fetch result format
   */
  transformToFetchResult(
    record: any,
    objectType: string,
    includeRelated?: boolean
  ): OpenAIFetchResult {
    const id = this.extractId(record);
    const title = this.createTitle(record, objectType);
    const text = this.extractDetailedTextContent(record, objectType, includeRelated);
    const url = this.generateUrl(id, objectType);
    const metadata = this.extractMetadata(record, objectType, includeRelated);

    return {
      id,
      title,
      text,
      url,
      metadata,
    };
  }

  /**
   * Generate a URL for accessing the record in Attio
   */
  generateUrl(id: string, objectType: string): string {
    const typeMap: Record<string, string> = {
      people: 'people',
      person: 'people',
      companies: 'companies',
      company: 'companies',
      lists: 'lists',
      list: 'lists',
      tasks: 'tasks',
      task: 'tasks',
    };

    const urlType = typeMap[objectType.toLowerCase()] || objectType.toLowerCase();
    return `${this.baseUrl}/${urlType}/${encodeURIComponent(id)}`;
  }

  /**
   * Extract relevant text content from an Attio record
   */
  extractTextContent(record: any, objectType: string): string {
    const parts: string[] = [];

    // Add basic information based on object type
    switch (objectType.toLowerCase()) {
      case 'people':
      case 'person':
        parts.push(...this.extractPersonText(record));
        break;
      case 'companies':
      case 'company':
        parts.push(...this.extractCompanyText(record));
        break;
      case 'lists':
      case 'list':
        parts.push(...this.extractListText(record));
        break;
      case 'tasks':
      case 'task':
        parts.push(...this.extractTaskText(record));
        break;
      default:
        parts.push(...this.extractGenericText(record));
    }

    return parts.filter(Boolean).join('. ');
  }

  /**
   * Create a human-readable title from an Attio record
   */
  createTitle(record: any, objectType: string): string {
    // Try to get the name field first
    if (record.values?.name?.value) {
      return record.values.name.value;
    }

    // Fallback to specific fields based on object type
    switch (objectType.toLowerCase()) {
      case 'people':
      case 'person':
        const firstName = record.values?.first_name?.value || '';
        const lastName = record.values?.last_name?.value || '';
        if (firstName || lastName) {
          return `${firstName} ${lastName}`.trim();
        }
        break;

      case 'companies':
      case 'company':
        if (record.values?.company_name?.value) {
          return record.values.company_name.value;
        }
        if (record.values?.domain?.value) {
          return record.values.domain.value;
        }
        break;

      case 'lists':
      case 'list':
        if (record.values?.list_name?.value) {
          return record.values.list_name.value;
        }
        break;

      case 'tasks':
      case 'task':
        if (record.values?.title?.value) {
          return record.values.title.value;
        }
        break;
    }

    // Final fallback
    return record.id || 'Untitled Record';
  }

  /**
   * Extract ID from record
   */
  private extractId(record: any): string {
    return record.id?.record_id || record.id || 'unknown';
  }

  /**
   * Extract detailed text content for fetch operations
   */
  private extractDetailedTextContent(
    record: any,
    objectType: string,
    includeRelated?: boolean
  ): string {
    const parts: string[] = [];

    // Start with basic text content
    parts.push(this.extractTextContent(record, objectType));

    // Add additional details for fetch operations
    parts.push(...this.extractAdditionalDetails(record, objectType));

    // Add related data if requested
    if (includeRelated) {
      parts.push(...this.extractRelatedData(record, objectType));
    }

    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * Extract metadata for fetch operations
   */
  private extractMetadata(
    record: any,
    objectType: string,
    includeRelated?: boolean
  ): Record<string, any> {
    const metadata: Record<string, any> = {
      objectType,
      recordId: this.extractId(record),
      lastUpdated: record.values?.updated_at?.value || record.updated_at,
      createdAt: record.values?.created_at?.value || record.created_at,
    };

    // Add type-specific metadata
    switch (objectType.toLowerCase()) {
      case 'people':
      case 'person':
        Object.assign(metadata, this.extractPersonMetadata(record));
        break;
      case 'companies':
      case 'company':
        Object.assign(metadata, this.extractCompanyMetadata(record));
        break;
      case 'lists':
      case 'list':
        Object.assign(metadata, this.extractListMetadata(record));
        break;
      case 'tasks':
      case 'task':
        Object.assign(metadata, this.extractTaskMetadata(record));
        break;
    }

    return metadata;
  }

  /**
   * Extract text content for person records
   */
  private extractPersonText(record: any): string[] {
    const parts: string[] = [];

    // Basic info
    const name = this.createTitle(record, 'person');
    if (name && name !== 'Untitled Record') {
      parts.push(`Name: ${name}`);
    }

    // Email addresses
    const emails = this.extractArrayValues(record.values?.email_addresses);
    if (emails.length > 0) {
      parts.push(`Email: ${emails.join(', ')}`);
    }

    // Phone numbers
    const phones = this.extractArrayValues(record.values?.phone_numbers);
    if (phones.length > 0) {
      parts.push(`Phone: ${phones.join(', ')}`);
    }

    // Job title
    if (record.values?.job_title?.value) {
      parts.push(`Job Title: ${record.values.job_title.value}`);
    }

    // Company
    if (record.values?.company?.value) {
      parts.push(`Company: ${this.formatValue(record.values.company.value)}`);
    }

    return parts;
  }

  /**
   * Extract text content for company records
   */
  private extractCompanyText(record: any): string[] {
    const parts: string[] = [];

    // Company name
    const name = this.createTitle(record, 'company');
    if (name && name !== 'Untitled Record') {
      parts.push(`Company: ${name}`);
    }

    // Domain
    if (record.values?.domain?.value) {
      parts.push(`Domain: ${record.values.domain.value}`);
    }

    // Industry
    if (record.values?.industry?.value) {
      parts.push(`Industry: ${this.formatValue(record.values.industry.value)}`);
    }

    // Location
    if (record.values?.location?.value) {
      parts.push(`Location: ${this.formatValue(record.values.location.value)}`);
    }

    // Description
    if (record.values?.description?.value) {
      parts.push(`Description: ${record.values.description.value}`);
    }

    return parts;
  }

  /**
   * Extract text content for list records
   */
  private extractListText(record: any): string[] {
    const parts: string[] = [];

    const name = this.createTitle(record, 'list');
    if (name && name !== 'Untitled Record') {
      parts.push(`List: ${name}`);
    }

    if (record.values?.description?.value) {
      parts.push(`Description: ${record.values.description.value}`);
    }

    return parts;
  }

  /**
   * Extract text content for task records
   */
  private extractTaskText(record: any): string[] {
    const parts: string[] = [];

    const title = this.createTitle(record, 'task');
    if (title && title !== 'Untitled Record') {
      parts.push(`Task: ${title}`);
    }

    if (record.values?.description?.value) {
      parts.push(`Description: ${record.values.description.value}`);
    }

    if (record.values?.status?.value) {
      parts.push(`Status: ${this.formatValue(record.values.status.value)}`);
    }

    if (record.values?.due_date?.value) {
      parts.push(`Due: ${record.values.due_date.value}`);
    }

    return parts;
  }

  /**
   * Extract generic text content
   */
  private extractGenericText(record: any): string[] {
    const parts: string[] = [];

    // Try common field names
    const commonFields = ['name', 'title', 'description', 'notes'];
    for (const field of commonFields) {
      if (record.values?.[field]?.value) {
        parts.push(`${field}: ${record.values[field].value}`);
      }
    }

    return parts;
  }

  /**
   * Extract additional details for fetch operations
   */
  private extractAdditionalDetails(record: any, objectType: string): string[] {
    const parts: string[] = [];

    // Add creation and update timestamps
    if (record.values?.created_at?.value) {
      parts.push(`Created: ${new Date(record.values.created_at.value).toLocaleDateString()}`);
    }

    if (record.values?.updated_at?.value) {
      parts.push(`Last Updated: ${new Date(record.values.updated_at.value).toLocaleDateString()}`);
    }

    return parts;
  }

  /**
   * Extract related data
   */
  private extractRelatedData(record: any, objectType: string): string[] {
    const parts: string[] = [];

    // TODO: Implement related data extraction based on object type
    // This would include related records, relationships, etc.

    return parts;
  }

  /**
   * Extract person-specific metadata
   */
  private extractPersonMetadata(record: any): Record<string, any> {
    return {
      hasEmail: !!this.extractArrayValues(record.values?.email_addresses).length,
      hasPhone: !!this.extractArrayValues(record.values?.phone_numbers).length,
      hasCompany: !!record.values?.company?.value,
      hasJobTitle: !!record.values?.job_title?.value,
    };
  }

  /**
   * Extract company-specific metadata
   */
  private extractCompanyMetadata(record: any): Record<string, any> {
    return {
      hasDomain: !!record.values?.domain?.value,
      hasIndustry: !!record.values?.industry?.value,
      hasLocation: !!record.values?.location?.value,
      hasDescription: !!record.values?.description?.value,
    };
  }

  /**
   * Extract list-specific metadata
   */
  private extractListMetadata(record: any): Record<string, any> {
    return {
      hasDescription: !!record.values?.description?.value,
    };
  }

  /**
   * Extract task-specific metadata
   */
  private extractTaskMetadata(record: any): Record<string, any> {
    return {
      hasDescription: !!record.values?.description?.value,
      hasStatus: !!record.values?.status?.value,
      hasDueDate: !!record.values?.due_date?.value,
    };
  }

  /**
   * Extract array values from Attio field format
   */
  private extractArrayValues(field: any): string[] {
    if (!field) return [];
    
    if (Array.isArray(field.value)) {
      return field.value.map((item: any) => 
        typeof item === 'string' ? item : (item.value || String(item))
      );
    }
    
    if (field.value) {
      return [String(field.value)];
    }
    
    return [];
  }

  /**
   * Format complex values (like select options, references, etc.)
   */
  private formatValue(value: any): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object') {
      // Handle select options
      if (value.option && typeof value.option === 'string') {
        return value.option;
      }

      // Handle references
      if (value.referenced_actor_id && value.display_name) {
        return value.display_name;
      }

      // Handle other object types
      if (value.display_name) {
        return value.display_name;
      }

      if (value.name) {
        return value.name;
      }

      if (value.title) {
        return value.title;
      }
    }

    return String(value);
  }
}