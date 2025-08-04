/**
 * Unit tests for OpenAI Data Transformer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIDataTransformer } from '../../src/openai/data-transformer.js';

describe('OpenAIDataTransformer', () => {
  let transformer: OpenAIDataTransformer;

  beforeEach(() => {
    transformer = new OpenAIDataTransformer('https://test.attio.com');
  });

  describe('transformToSearchResult', () => {
    it('should transform person record correctly', () => {
      // Arrange
      const personRecord = {
        id: 'person-123',
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: ['john@example.com', 'john.doe@work.com'] },
          phone_numbers: { value: ['+1234567890'] },
          job_title: { value: 'Software Engineer' },
          company: { value: { display_name: 'Acme Corp' } },
        },
      };

      // Act
      const result = transformer.transformToSearchResult(personRecord, 'john', 'people');

      // Assert
      expect(result).toMatchObject({
        id: 'person-123',
        title: 'John Doe',
        text: expect.stringContaining('Name: John Doe'),
        url: 'https://test.attio.com/people/person-123',
      });
      expect(result.text).toContain('Email: john@example.com, john.doe@work.com');
      expect(result.text).toContain('Phone: +1234567890');
      expect(result.text).toContain('Job Title: Software Engineer');
      expect(result.text).toContain('Company: Acme Corp');
    });

    it('should transform company record correctly', () => {
      // Arrange
      const companyRecord = {
        id: 'company-456',
        values: {
          name: { value: 'Acme Corporation' },
          domain: { value: 'acme.com' },
          industry: { value: { option: 'Technology' } },
          location: { value: 'San Francisco, CA' },
          description: { value: 'Leading technology company' },
        },
      };

      // Act
      const result = transformer.transformToSearchResult(companyRecord, 'acme', 'companies');

      // Assert
      expect(result).toMatchObject({
        id: 'company-456',
        title: 'Acme Corporation',
        text: expect.stringContaining('Company: Acme Corporation'),
        url: 'https://test.attio.com/companies/company-456',
      });
      expect(result.text).toContain('Domain: acme.com');
      expect(result.text).toContain('Industry: Technology');
      expect(result.text).toContain('Location: San Francisco, CA');
      expect(result.text).toContain('Description: Leading technology company');
    });

    it('should transform list record correctly', () => {
      // Arrange
      const listRecord = {
        id: 'list-789',
        values: {
          list_name: { value: 'Potential Customers' },
          description: { value: 'List of potential customers for outreach' },
        },
      };

      // Act
      const result = transformer.transformToSearchResult(listRecord, 'customers', 'lists');

      // Assert
      expect(result).toMatchObject({
        id: 'list-789',
        title: 'Potential Customers',
        text: expect.stringContaining('List: Potential Customers'),
        url: 'https://test.attio.com/lists/list-789',
      });
      expect(result.text).toContain('Description: List of potential customers for outreach');
    });

    it('should transform task record correctly', () => {
      // Arrange
      const taskRecord = {
        id: 'task-999',
        values: {
          title: { value: 'Follow up with lead' },
          description: { value: 'Call John Doe to discuss proposal' },
          status: { value: { option: 'In Progress' } },
          due_date: { value: '2024-01-15' },
        },
      };

      // Act
      const result = transformer.transformToSearchResult(taskRecord, 'follow up', 'tasks');

      // Assert
      expect(result).toMatchObject({
        id: 'task-999',
        title: 'Follow up with lead',
        text: expect.stringContaining('Task: Follow up with lead'),
        url: 'https://test.attio.com/tasks/task-999',
      });
      expect(result.text).toContain('Description: Call John Doe to discuss proposal');
      expect(result.text).toContain('Status: In Progress');
      expect(result.text).toContain('Due: 2024-01-15');
    });

    it('should handle records with minimal data', () => {
      // Arrange
      const minimalRecord = {
        id: 'minimal-123',
        values: {},
      };

      // Act
      const result = transformer.transformToSearchResult(minimalRecord, 'test', 'generic');

      // Assert
      expect(result).toMatchObject({
        id: 'minimal-123',
        title: 'minimal-123', // Falls back to ID
        text: expect.any(String),
        url: 'https://test.attio.com/generic/minimal-123',
      });
    });
  });

  describe('transformToFetchResult', () => {
    it('should include metadata in fetch results', () => {
      // Arrange
      const personRecord = {
        id: 'person-123',
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: ['john@example.com'] },
          created_at: { value: '2023-01-01T00:00:00Z' },
          updated_at: { value: '2023-12-01T00:00:00Z' },
        },
      };

      // Act
      const result = transformer.transformToFetchResult(personRecord, 'people', false);

      // Assert
      expect(result.metadata).toMatchObject({
        objectType: 'people',
        recordId: 'person-123',
        hasEmail: true,
        hasPhone: false,
        hasCompany: false,
        hasJobTitle: false,
      });
    });

    it('should include detailed text content for fetch', () => {
      // Arrange
      const companyRecord = {
        id: 'company-456',
        values: {
          name: { value: 'Acme Corp' },
          domain: { value: 'acme.com' },
          created_at: { value: '2023-01-01T00:00:00Z' },
          updated_at: { value: '2023-12-01T00:00:00Z' },
        },
      };

      // Act
      const result = transformer.transformToFetchResult(companyRecord, 'companies', false);

      // Assert
      expect(result.text).toContain('Company: Acme Corp');
      expect(result.text).toContain('Domain: acme.com');
      expect(result.text).toContain('Created: 1/1/2023');
      expect(result.text).toContain('Last Updated: 12/1/2023');
    });
  });

  describe('createTitle', () => {
    it('should create title from name field', () => {
      // Arrange
      const record = {
        values: { name: { value: 'Test Name' } },
      };

      // Act
      const title = transformer.createTitle(record, 'generic');

      // Assert
      expect(title).toBe('Test Name');
    });

    it('should create title from first and last name for people', () => {
      // Arrange
      const record = {
        values: {
          first_name: { value: 'John' },
          last_name: { value: 'Doe' },
        },
      };

      // Act
      const title = transformer.createTitle(record, 'people');

      // Assert
      expect(title).toBe('John Doe');
    });

    it('should fallback to company name for companies', () => {
      // Arrange
      const record = {
        values: {
          company_name: { value: 'Acme Corporation' },
        },
      };

      // Act
      const title = transformer.createTitle(record, 'companies');

      // Assert
      expect(title).toBe('Acme Corporation');
    });

    it('should fallback to ID when no name fields exist', () => {
      // Arrange
      const record = {
        id: 'test-123',
        values: {},
      };

      // Act
      const title = transformer.createTitle(record, 'generic');

      // Assert
      expect(title).toBe('test-123');
    });

    it('should return "Untitled Record" when no ID exists', () => {
      // Arrange
      const record = {
        values: {},
      };

      // Act
      const title = transformer.createTitle(record, 'generic');

      // Assert
      expect(title).toBe('Untitled Record');
    });
  });

  describe('generateUrl', () => {
    it('should generate correct URLs for different object types', () => {
      const testCases = [
        { id: 'person-123', type: 'people', expected: 'https://test.attio.com/people/person-123' },
        { id: 'company-456', type: 'companies', expected: 'https://test.attio.com/companies/company-456' },
        { id: 'list-789', type: 'lists', expected: 'https://test.attio.com/lists/list-789' },
        { id: 'task-999', type: 'tasks', expected: 'https://test.attio.com/tasks/task-999' },
      ];

      testCases.forEach(({ id, type, expected }) => {
        const url = transformer.generateUrl(id, type);
        expect(url).toBe(expected);
      });
    });

    it('should handle special characters in IDs', () => {
      // Arrange
      const id = 'test id with spaces';

      // Act
      const url = transformer.generateUrl(id, 'people');

      // Assert
      expect(url).toBe('https://test.attio.com/people/test%20id%20with%20spaces');
    });
  });

  describe('extractArrayValues', () => {
    it('should extract array values correctly', () => {
      // Test via email extraction in person record
      const record = {
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: ['john@example.com', 'john.doe@work.com'] },
        },
      };

      const result = transformer.transformToSearchResult(record, 'john', 'people');
      expect(result.text).toContain('Email: john@example.com, john.doe@work.com');
    });

    it('should handle single values as arrays', () => {
      // Test single email value
      const record = {
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: 'john@example.com' },
        },
      };

      const result = transformer.transformToSearchResult(record, 'john', 'people');
      expect(result.text).toContain('Email: john@example.com');
    });

    it('should handle empty arrays', () => {
      // Test empty email array
      const record = {
        values: {
          name: { value: 'John Doe' },
          email_addresses: { value: [] },
        },
      };

      const result = transformer.transformToSearchResult(record, 'john', 'people');
      expect(result.text).not.toContain('Email:');
    });
  });

  describe('formatValue', () => {
    it('should format select option values', () => {
      // Test via industry field in company record
      const record = {
        values: {
          name: { value: 'Acme Corp' },
          industry: { value: { option: 'Technology' } },
        },
      };

      const result = transformer.transformToSearchResult(record, 'acme', 'companies');
      expect(result.text).toContain('Industry: Technology');
    });

    it('should format reference values', () => {
      // Test via company reference in person record
      const record = {
        values: {
          name: { value: 'John Doe' },
          company: { value: { referenced_actor_id: 'company-123', display_name: 'Acme Corp' } },
        },
      };

      const result = transformer.transformToSearchResult(record, 'john', 'people');
      expect(result.text).toContain('Company: Acme Corp');
    });

    it('should handle string values', () => {
      // Test simple string value
      const record = {
        values: {
          name: { value: 'Simple String' },
        },
      };

      const result = transformer.transformToSearchResult(record, 'simple', 'generic');
      expect(result.text).toContain('Simple String');
    });
  });
});