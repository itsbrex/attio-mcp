/**
 * Response Snapshot Tests
 * Validates that response formats remain exactly the same
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { features } from '../../src/config/features.js';
import { search } from '../../src/openai/search.js';
import { fetch } from '../../src/openai/fetch.js';
import {
  transformToSearchResult,
  transformToFetchResult,
} from '../../src/openai/transformers/index.js';

// Mock the tool dispatcher
vi.mock('../../src/handlers/tools/dispatcher.js', () => ({
  executeToolRequest: vi.fn(),
}));

import { executeToolRequest } from '../../src/handlers/tools/dispatcher.js';

/**
 * Expected response formats (snapshots)
 * These represent the exact format that existing clients expect
 */
const EXPECTED_FORMATS = {
  searchResult: {
    id: expect.stringMatching(/^[a-z]+:[a-z0-9-]+$/),
    title: expect.any(String),
    text: expect.any(String),
    url: expect.stringMatching(/^https:\/\/app\.attio\.com\//),
  },

  fetchResult: {
    id: expect.stringMatching(/^[a-z]+:[a-z0-9-]+$/),
    data: expect.any(Object),
    url: expect.stringMatching(/^https:\/\/app\.attio\.com\//),
  },

  personData: {
    name: expect.any(String),
    email: expect.any(String),
    phone: expect.any(String),
    title: expect.any(String),
    company: expect.any(String),
    location: expect.any(String),
  },

  companyData: {
    name: expect.any(String),
    domain: expect.any(String),
    industry: expect.any(String),
    employee_count: expect.any(Number),
    description: expect.any(String),
  },
};

describe('Response Snapshot Tests', () => {
  beforeEach(() => {
    features.reset();
    vi.clearAllMocks();
  });

  describe('Search Response Snapshots', () => {
    it('should match person search result snapshot', async () => {
      const mockData = {
        data: [
          {
            id: { person_id: 'person-123' },
            values: {
              name: [{ value: 'John Doe' }],
              email_addresses: [{ email_address: 'john@example.com' }],
              job_title: [{ value: 'CEO' }],
              company: [
                {
                  target_object: 'company-456',
                  target_record_id: 'company-456',
                },
              ],
              location: [{ value: 'San Francisco, CA' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const results = await search('John', 'people');

      // Validate exact structure
      expect(results[0]).toMatchObject(EXPECTED_FORMATS.searchResult);

      // Snapshot specific values
      expect(results[0]).toMatchInlineSnapshot(`
        {
          "id": "people:person-123",
          "text": "John Doe
        Email: john@example.com
        Title: CEO
        Location: San Francisco, CA",
          "title": "John Doe",
          "url": "https://app.attio.com/people/person-123",
        }
      `);
    });

    it('should match company search result snapshot', async () => {
      const mockData = {
        data: [
          {
            id: { company_id: 'company-456' },
            values: {
              name: [{ value: 'Acme Corp' }],
              domain: [{ value: 'acme.com' }],
              industry: [{ value: 'Technology' }],
              employee_count: [{ value: 500 }],
              description: [{ value: 'Leading tech company' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const results = await search('Acme', 'companies');

      expect(results[0]).toMatchObject(EXPECTED_FORMATS.searchResult);

      expect(results[0]).toMatchInlineSnapshot(`
        {
          "id": "companies:company-456",
          "text": "Acme Corp
        Domain: acme.com
        Industry: Technology
        Employees: 500
        Description: Leading tech company",
          "title": "Acme Corp",
          "url": "https://app.attio.com/companies/company-456",
        }
      `);
    });

    it('should match list search result snapshot', async () => {
      const mockData = {
        data: [
          {
            id: { list_id: 'list-789' },
            values: {
              name: [{ value: 'Q4 Prospects' }],
              entries: [{ value: 50 }],
              created_at: [{ value: '2024-01-01' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const results = await search('Prospects', 'lists');

      expect(results[0]).toMatchObject(EXPECTED_FORMATS.searchResult);

      expect(results[0]).toMatchInlineSnapshot(`
        {
          "id": "lists:list-789",
          "text": "Q4 Prospects
        Entries: 50
        Created: 2024-01-01",
          "title": "Q4 Prospects",
          "url": "https://app.attio.com/lists/list-789",
        }
      `);
    });

    it('should handle empty search results', async () => {
      vi.mocked(executeToolRequest).mockResolvedValueOnce({ data: [] });

      const results = await search('NonExistent', 'people');

      expect(results).toMatchInlineSnapshot(`[]`);
    });

    it('should handle multi-type search results', async () => {
      const mockPeople = {
        data: [
          {
            id: { person_id: 'person-1' },
            values: { name: [{ value: 'Tech Person' }] },
          },
        ],
      };

      const mockCompanies = {
        data: [
          {
            id: { company_id: 'company-1' },
            values: { name: [{ value: 'Tech Company' }] },
          },
        ],
      };

      vi.mocked(executeToolRequest)
        .mockResolvedValueOnce(mockPeople)
        .mockResolvedValueOnce(mockCompanies)
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const results = await search('Tech');

      expect(results).toMatchInlineSnapshot(`
        [
          {
            "id": "people:person-1",
            "text": "Tech Person",
            "title": "Tech Person",
            "url": "https://app.attio.com/people/person-1",
          },
          {
            "id": "companies:company-1",
            "text": "Tech Company",
            "title": "Tech Company",
            "url": "https://app.attio.com/companies/company-1",
          },
        ]
      `);
    });
  });

  describe('Fetch Response Snapshots', () => {
    it('should match person fetch result snapshot', async () => {
      const mockData = {
        data: {
          id: { person_id: 'person-123' },
          values: {
            name: [{ value: 'John Doe' }],
            email_addresses: [{ email_address: 'john@example.com' }],
            phone_numbers: [{ phone_number: '+1234567890' }],
            job_title: [{ value: 'CEO' }],
            company: [{ value: 'Acme Corp' }],
            location: [{ value: 'San Francisco, CA' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const result = await fetch('people:person-123');

      expect(result).toMatchObject(EXPECTED_FORMATS.fetchResult);

      expect(result).toMatchInlineSnapshot(`
        {
          "data": {
            "company": "Acme Corp",
            "email": "john@example.com",
            "location": "San Francisco, CA",
            "name": "John Doe",
            "phone": "+1234567890",
            "title": "CEO",
          },
          "id": "people:person-123",
          "url": "https://app.attio.com/people/person-123",
        }
      `);
    });

    it('should match company fetch result snapshot', async () => {
      const mockData = {
        data: {
          id: { company_id: 'company-456' },
          values: {
            name: [{ value: 'Acme Corp' }],
            domain: [{ value: 'acme.com' }],
            industry: [{ value: 'Technology' }],
            employee_count: [{ value: 500 }],
            description: [{ value: 'Leading tech company' }],
            founded_date: [{ value: '2010-01-01' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const result = await fetch('companies:company-456');

      expect(result).toMatchObject(EXPECTED_FORMATS.fetchResult);

      expect(result).toMatchInlineSnapshot(`
        {
          "data": {
            "description": "Leading tech company",
            "domain": "acme.com",
            "employee_count": 500,
            "founded_date": "2010-01-01",
            "industry": "Technology",
            "name": "Acme Corp",
          },
          "id": "companies:company-456",
          "url": "https://app.attio.com/companies/company-456",
        }
      `);
    });

    it('should handle minimal data correctly', async () => {
      const mockData = {
        data: {
          id: { person_id: 'person-minimal' },
          values: {
            name: [{ value: 'Jane Doe' }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const result = await fetch('people:person-minimal');

      expect(result).toMatchInlineSnapshot(`
        {
          "data": {
            "name": "Jane Doe",
          },
          "id": "people:person-minimal",
          "url": "https://app.attio.com/people/person-minimal",
        }
      `);
    });

    it('should handle complex nested data', async () => {
      const mockData = {
        data: {
          id: { deal_id: 'deal-complex' },
          values: {
            name: [{ value: 'Enterprise Deal' }],
            value: [{ value: 1000000 }],
            currency: [{ value: 'USD' }],
            stage: [{ value: 'Negotiation' }],
            close_date: [{ value: '2024-12-31' }],
            owner: [
              { target_object: 'people', target_record_id: 'person-owner' },
            ],
            company: [
              {
                target_object: 'companies',
                target_record_id: 'company-client',
              },
            ],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const result = await fetch('deals:deal-complex');

      expect(result).toMatchInlineSnapshot(`
        {
          "data": {
            "close_date": "2024-12-31",
            "company": "company-client",
            "currency": "USD",
            "name": "Enterprise Deal",
            "owner": "person-owner",
            "stage": "Negotiation",
            "value": 1000000,
          },
          "id": "deals:deal-complex",
          "url": "https://app.attio.com/deals/deal-complex",
        }
      `);
    });
  });

  describe('Transformer Function Snapshots', () => {
    it('should match search transformer output', () => {
      const record = {
        id: { person_id: 'transform-test' },
        values: {
          name: [{ value: 'Transform Test' }],
          email_addresses: [{ email_address: 'test@transform.com' }],
        },
      };

      const result = transformToSearchResult(record, 'test', 'people');

      expect(result).toMatchInlineSnapshot(`
        {
          "id": "people:transform-test",
          "text": "Transform Test
        Email: test@transform.com",
          "title": "Transform Test",
          "url": "https://app.attio.com/people/transform-test",
        }
      `);
    });

    it('should match fetch transformer output', () => {
      const record = {
        id: { company_id: 'transform-company' },
        values: {
          name: [{ value: 'Transform Corp' }],
          domain: [{ value: 'transform.com' }],
          employee_count: [{ value: 100 }],
        },
      };

      const result = transformToFetchResult(record, 'companies');

      expect(result).toMatchInlineSnapshot(`
        {
          "data": {
            "domain": "transform.com",
            "employee_count": 100,
            "name": "Transform Corp",
          },
          "id": "companies:transform-company",
          "url": "https://app.attio.com/companies/transform-company",
        }
      `);
    });
  });

  describe('Edge Case Snapshots', () => {
    it('should handle special characters in data', async () => {
      const mockData = {
        data: [
          {
            id: { person_id: 'person-special' },
            values: {
              name: [{ value: "O'Reilly & Associates" }],
              email_addresses: [{ email_address: 'info@o-reilly.com' }],
              notes: [{ value: 'Uses "special" characters & symbols' }],
            },
          },
        ],
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const results = await search("O'Reilly", 'people');

      expect(results[0]).toMatchInlineSnapshot(`
        {
          "id": "people:person-special",
          "text": "O'Reilly & Associates
        Email: info@o-reilly.com
        Notes: Uses "special" characters & symbols",
          "title": "O'Reilly & Associates",
          "url": "https://app.attio.com/people/person-special",
        }
      `);
    });

    it('should handle very long text fields', async () => {
      const longDescription = 'A'.repeat(500);
      const mockData = {
        data: {
          id: { company_id: 'company-long' },
          values: {
            name: [{ value: 'Long Description Corp' }],
            description: [{ value: longDescription }],
          },
        },
      };

      vi.mocked(executeToolRequest).mockResolvedValueOnce(mockData);

      const result = await fetch('companies:company-long');

      expect(result.data.description).toHaveLength(500);
      expect(result.data.description).toBe(longDescription);
    });

    it('should handle null and undefined values', () => {
      const record = {
        id: { person_id: 'person-null' },
        values: {
          name: [{ value: 'Null Test' }],
          email_addresses: null,
          phone_numbers: undefined,
          job_title: [],
        },
      };

      const result = transformToSearchResult(record, 'test', 'people');

      expect(result).toMatchInlineSnapshot(`
        {
          "id": "people:person-null",
          "text": "Null Test",
          "title": "Null Test",
          "url": "https://app.attio.com/people/person-null",
        }
      `);
    });
  });
});
