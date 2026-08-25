/**
 * Unit tests for WorkspaceSchemaService
 *
 * Tests schema fetching, option truncation, graceful error handling, and complex type structures.
 *
 * @see Issue #983
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkspaceSchemaService } from '@/services/skill-generator/WorkspaceSchemaService.js';
import type { AttioAttributeMetadata } from '@/api/attribute-types.js';
import type { AttributeOptionsResult } from '@/services/metadata/AttributeOptionsService.js';

// Mock dependencies
vi.mock('@/api/attribute-types.js');
vi.mock('@/api/lazy-client.js');
vi.mock('@/services/metadata/AttributeOptionsService.js');
vi.mock('@/utils/logger.js');

// Import mocked modules
const { getObjectAttributeMetadata } = await import('@/api/attribute-types.js');
const { getLazyAttioClient } = await import('@/api/lazy-client.js');
const { AttributeOptionsService } =
  await import('@/services/metadata/AttributeOptionsService.js');

// Helper functions for mocking getLazyAttioClient
const mockApiError = () =>
  vi.mocked(getLazyAttioClient).mockReturnValue({
    get: vi.fn().mockRejectedValue(new Error('Not found')),
  } as unknown as ReturnType<typeof getLazyAttioClient>);

const mockApiSuccess = (data: unknown) =>
  vi.mocked(getLazyAttioClient).mockReturnValue({
    get: vi.fn().mockResolvedValue({ data }),
  } as unknown as ReturnType<typeof getLazyAttioClient>);

describe('WorkspaceSchemaService', () => {
  let service: WorkspaceSchemaService;

  beforeEach(() => {
    service = new WorkspaceSchemaService();
    vi.clearAllMocks();

    // Default mock for getLazyAttioClient - returns null title (graceful fallback)
    // Individual tests can override this to test specific behaviors
    mockApiError();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchSchema', () => {
    it('should fetch schema for single object', async () => {
      // Mock attribute metadata
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'name',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'name',
            title: 'Name',
            type: 'text',
            is_writable: true,
            is_required: true,
            is_unique: false,
            is_multiselect: false,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.metadata.objects).toEqual(['companies']);
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0].objectSlug).toBe('companies');
      expect(result.objects[0].displayName).toBe('Companies');
      expect(result.objects[0].attributes).toHaveLength(1);
      expect(result.objects[0].attributes[0].apiSlug).toBe('name');
      expect(result.objects[0].attributes[0].displayName).toBe('Name');
      expect(result.objects[0].attributes[0].type).toBe('text');
    });

    it('should fetch schema for multiple objects', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'name',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'name',
            title: 'Name',
            type: 'text',
            is_writable: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(
        ['companies', 'people', 'deals'],
        {
          maxOptionsPerAttribute: 20,
          includeArchived: false,
          optionFetchDelayMs: 0,
        }
      );

      expect(result.objects).toHaveLength(3);
      expect(result.objects[0].objectSlug).toBe('companies');
      expect(result.objects[1].objectSlug).toBe('people');
      expect(result.objects[2].objectSlug).toBe('deals');
    });

    it('should continue processing when one object fails', async () => {
      vi.mocked(getObjectAttributeMetadata)
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(
          new Map([
            [
              'name',
              {
                id: {
                  workspace_id: 'ws1',
                  object_id: 'obj1',
                  attribute_id: 'attr1',
                },
                api_slug: 'name',
                title: 'Name',
                type: 'text',
                is_writable: true,
              },
            ],
          ])
        );

      const result = await service.fetchSchema(['companies', 'people'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      // Should have 1 object (people), companies failed
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0].objectSlug).toBe('people');
    });
  });

  describe('select/status attributes', () => {
    it('should fetch options for select attributes', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'industry',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'industry',
            title: 'Industry',
            type: 'select',
            is_writable: true,
            is_multiselect: false,
          },
        ],
      ]);

      const mockOptions: AttributeOptionsResult = {
        options: [
          { id: 'opt1', title: 'Technology', value: 'technology' },
          { id: 'opt2', title: 'Healthcare', value: 'healthcare' },
          { id: 'opt3', title: 'Finance', value: 'finance' },
        ],
        attributeType: 'select',
      };

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(AttributeOptionsService.getOptions).mockResolvedValue(
        mockOptions
      );

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const industryAttr = result.objects[0].attributes.find(
        (a) => a.apiSlug === 'industry'
      );

      expect(industryAttr?.options).toHaveLength(3);
      expect(industryAttr?.options?.[0].value).toBe('technology');
      expect(industryAttr?.optionsTruncated).toBe(false);
      expect(industryAttr?.totalOptions).toBe(3);
    });

    it('should respect optionFetchDelayMs when provided', async () => {
      vi.useFakeTimers();
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

      try {
        // Two option-based attributes: the delay applies BETWEEN fetches,
        // so a single attribute would (correctly) skip the trailing delay
        const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
          [
            'industry',
            {
              id: {
                workspace_id: 'ws1',
                object_id: 'obj1',
                attribute_id: 'attr1',
              },
              api_slug: 'industry',
              title: 'Industry',
              type: 'select',
              is_writable: true,
            },
          ],
          [
            'segment',
            {
              id: {
                workspace_id: 'ws1',
                object_id: 'obj1',
                attribute_id: 'attr2',
              },
              api_slug: 'segment',
              title: 'Segment',
              type: 'select',
              is_writable: true,
            },
          ],
        ]);

        const mockOptions: AttributeOptionsResult = {
          options: [{ id: 'opt1', title: 'Technology', value: 'technology' }],
          attributeType: 'select',
        };

        vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
        vi.mocked(AttributeOptionsService.getOptions).mockResolvedValue(
          mockOptions
        );

        const fetchPromise = service.fetchSchema(['companies'], {
          maxOptionsPerAttribute: 20,
          includeArchived: false,
          optionFetchDelayMs: 123,
          concurrency: 1,
        });

        await vi.runAllTimersAsync();
        await fetchPromise;

        expect(setTimeoutSpy.mock.calls.some((call) => call[1] === 123)).toBe(
          true
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should truncate options when exceeding maxOptionsPerAttribute', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'industry',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'industry',
            title: 'Industry',
            type: 'select',
            is_writable: true,
          },
        ],
      ]);

      const mockOptions: AttributeOptionsResult = {
        options: Array.from({ length: 30 }, (_, i) => ({
          id: `opt${i}`,
          title: `Option ${i}`,
          value: `option_${i}`,
        })),
        attributeType: 'select',
      };

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(AttributeOptionsService.getOptions).mockResolvedValue(
        mockOptions
      );

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const industryAttr = result.objects[0].attributes.find(
        (a) => a.apiSlug === 'industry'
      );

      expect(industryAttr?.options).toHaveLength(20);
      expect(industryAttr?.optionsTruncated).toBe(true);
      expect(industryAttr?.totalOptions).toBe(30);
    });

    it('should extract option_id from nested ID objects (Attio API format)', async () => {
      // Mock Attio API response with nested ID structure
      const nestedIdOptions: AttributeOptionsResult = {
        options: [
          {
            id: {
              workspace_id: 'fa02d59a-674a-4e08-9fbe-4c82cbbe80d7',
              object_id: 'acb37e8a-bed6-4895-934a-a9e1b2cbfdbe',
              attribute_id: '73170445-aa15-49c3-8173-7868f639e049',
              option_id: 'ae15f49d-0f4e-4841-8117-bf6c0a20e8a4',
            },
            title: 'Existing Customer',
            value: 'existing_customer',
            is_archived: false,
          },
          {
            id: {
              workspace_id: 'fa02d59a-674a-4e08-9fbe-4c82cbbe80d7',
              object_id: 'acb37e8a-bed6-4895-934a-a9e1b2cbfdbe',
              attribute_id: '73170445-aa15-49c3-8173-7868f639e049',
              option_id: '8f6ac4eb-6ab6-40be-909a-29042d3674e7',
            },
            title: 'Potential Customer',
            value: 'potential_customer',
            is_archived: false,
          },
        ],
        attributeType: 'select',
      };

      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'lead_type',
          {
            id: {
              workspace_id: 'fa02d59a-674a-4e08-9fbe-4c82cbbe80d7',
              object_id: 'acb37e8a-bed6-4895-934a-a9e1b2cbfdbe',
              attribute_id: '73170445-aa15-49c3-8173-7868f639e049',
            },
            api_slug: 'lead_type',
            title: 'Type',
            type: 'select',
            is_multiselect: true,
            is_writable: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(AttributeOptionsService.getOptions).mockResolvedValue(
        nestedIdOptions
      );

      const result = await service['fetchObjectSchema'](
        'companies',
        {
          maxOptionsPerAttribute: 10,
          includeArchived: false,
          optionFetchDelayMs: 0,
        },
        new Map()
      );

      const leadTypeAttr = result.attributes.find(
        (a) => a.apiSlug === 'lead_type'
      );

      // Verify option_id was extracted correctly (not '[object Object]')
      expect(leadTypeAttr?.options).toHaveLength(2);
      expect(leadTypeAttr?.options?.[0].id).toBe(
        'ae15f49d-0f4e-4841-8117-bf6c0a20e8a4'
      );
      expect(leadTypeAttr?.options?.[1].id).toBe(
        '8f6ac4eb-6ab6-40be-909a-29042d3674e7'
      );
      expect(leadTypeAttr?.options?.[0].title).toBe('Existing Customer');
      expect(leadTypeAttr?.options?.[1].title).toBe('Potential Customer');
    });

    it('should continue when options fetch fails', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'industry',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'industry',
            title: 'Industry',
            type: 'select',
            is_writable: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(AttributeOptionsService.getOptions).mockRejectedValue(
        new Error('Options not found')
      );

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const industryAttr = result.objects[0].attributes.find(
        (a) => a.apiSlug === 'industry'
      );

      // Attribute should still exist, but without options
      expect(industryAttr).toBeDefined();
      expect(industryAttr?.options).toBeUndefined();
    });
  });

  describe('complex types', () => {
    it('should add structure for location attributes', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'primary_location',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'primary_location',
            title: 'Primary Location',
            type: 'location',
            is_writable: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const locationAttr = result.objects[0].attributes.find(
        (a) => a.apiSlug === 'primary_location'
      );

      expect(locationAttr?.complexTypeStructure).toBeDefined();
      expect(locationAttr?.complexTypeStructure).toHaveProperty('line_1');
      expect(locationAttr?.complexTypeStructure).toHaveProperty('locality');
      expect(locationAttr?.complexTypeStructure).toHaveProperty('region');
      expect(locationAttr?.complexTypeStructure).toHaveProperty('postcode');
    });

    it('should add structure for personal-name attributes', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'name',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'name',
            title: 'Name',
            type: 'personal-name',
            is_writable: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['people'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const nameAttr = result.objects[0].attributes.find(
        (a) => a.apiSlug === 'name'
      );

      expect(nameAttr?.complexTypeStructure).toBeDefined();
      expect(nameAttr?.complexTypeStructure).toHaveProperty('first_name');
      expect(nameAttr?.complexTypeStructure).toHaveProperty('last_name');
      expect(nameAttr?.complexTypeStructure).toHaveProperty('full_name');
    });
  });

  describe('attribute metadata', () => {
    it('should capture multi-select flag', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'tags',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'tags',
            title: 'Tags',
            type: 'select',
            is_writable: true,
            is_multiselect: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const tagsAttr = result.objects[0].attributes[0];
      expect(tagsAttr.isMultiselect).toBe(true);
    });

    it('should capture unique flag', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'domains',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'domains',
            title: 'Domains',
            type: 'domain',
            is_writable: true,
            is_unique: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const domainsAttr = result.objects[0].attributes[0];
      expect(domainsAttr.isUnique).toBe(true);
    });

    it('should capture required flag', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'name',
          {
            id: {
              workspace_id: 'ws1',
              object_id: 'obj1',
              attribute_id: 'attr1',
            },
            api_slug: 'name',
            title: 'Name',
            type: 'text',
            is_writable: true,
            is_required: true,
          },
        ],
      ]);

      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const nameAttr = result.objects[0].attributes[0];
      expect(nameAttr.isRequired).toBe(true);
    });
  });

  describe('display names', () => {
    it('should use standard display names for Phase 1 objects', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Mock API to return null (Phase 1 objects use hardcoded fallback)
      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Not found')),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(
        ['companies', 'people', 'deals'],
        {
          maxOptionsPerAttribute: 20,
          includeArchived: false,
          optionFetchDelayMs: 0,
        }
      );

      expect(result.objects[0].displayName).toBe('Companies');
      expect(result.objects[1].displayName).toBe('People');
      expect(result.objects[2].displayName).toBe('Deals');
    });

    it('should capitalize custom object names when API fails', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Mock API to fail
      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Not found')),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(['properties'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.objects[0].displayName).toBe('Properties');
    });

    it('should use API-fetched title for custom objects (Issue #1017)', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Mock API to return custom title
      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockResolvedValue({
          data: {
            data: {
              api_slug: 'custom_prospecting_list',
              title: 'Prospecting Contacts',
            },
          },
        }),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(['custom_prospecting_list'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.objects[0].displayName).toBe('Prospecting Contacts');
      expect(result.objects[0].objectSlug).toBe('custom_prospecting_list');
    });

    it('should handle API response with flat data structure', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Mock API to return flat data structure (no nested data.data)
      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockResolvedValue({
          data: {
            api_slug: 'my_custom_object',
            title: 'My Custom Object',
          },
        }),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(['my_custom_object'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.objects[0].displayName).toBe('My Custom Object');
    });

    it('should fallback to capitalization when API returns no title', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Mock API to return object without title
      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockResolvedValue({
          data: {
            data: {
              api_slug: 'some_object',
              // No title field
            },
          },
        }),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(['some_object'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.objects[0].displayName).toBe('Some Object');
    });
  });

  describe('option values', () => {
    it('should use the API-provided value when present', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'industry',
          {
            id: { workspace_id: 'ws1', object_id: 'o1', attribute_id: 'a1' },
            api_slug: 'industry',
            title: 'Industry',
            type: 'select',
            is_writable: true,
          },
        ],
      ]);
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(AttributeOptionsService.getOptions).mockResolvedValue({
        options: [{ id: 'opt1', title: 'Technology', value: 'tech_value' }],
        attributeType: 'select',
      });

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const attr = result.objects[0].attributes[0];
      expect(attr.options?.[0].value).toBe('tech_value');
    });

    it('should fall back to the option title when no value is provided', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'lead_type',
          {
            id: { workspace_id: 'ws1', object_id: 'o1', attribute_id: 'a1' },
            api_slug: 'lead_type',
            title: 'Lead Type',
            type: 'select',
            is_writable: true,
          },
        ],
      ]);
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(AttributeOptionsService.getOptions).mockResolvedValue({
        options: [
          { id: 'opt1', title: 'Existing Customer' },
        ] as unknown as AttributeOptionsResult['options'],
        attributeType: 'select',
      });

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      const attr = result.objects[0].attributes[0];
      // Title IS the API value per Attio docs — never a slugified guess
      expect(attr.options?.[0].value).toBe('Existing Customer');
    });
  });

  describe('record-reference targets', () => {
    it('should resolve allowed_object_ids to object slugs via the object index', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'associated_company',
          {
            id: { workspace_id: 'ws1', object_id: 'o1', attribute_id: 'a1' },
            api_slug: 'associated_company',
            title: 'Associated Company',
            type: 'record-reference',
            is_writable: true,
            config: {
              record_reference: {
                allowed_object_ids: ['uuid-companies', 'uuid-unknown'],
              },
            },
          },
        ],
      ]);
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const objectIndex = new Map([['uuid-companies', 'companies']]);
      const result = await service['fetchObjectSchema'](
        'deals',
        {
          maxOptionsPerAttribute: 20,
          includeArchived: false,
          optionFetchDelayMs: 0,
        },
        objectIndex
      );

      const attr = result.attributes[0];
      // Resolved id becomes a slug; unresolved id is kept raw
      expect(attr.referencedObjects).toEqual(['companies', 'uuid-unknown']);
    });

    it('should mark unrestricted references with an empty array', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'related_record',
          {
            id: { workspace_id: 'ws1', object_id: 'o1', attribute_id: 'a1' },
            api_slug: 'related_record',
            title: 'Related Record',
            type: 'record-reference',
            is_writable: true,
          },
        ],
      ]);
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service['fetchObjectSchema'](
        'deals',
        {
          maxOptionsPerAttribute: 20,
          includeArchived: false,
          optionFetchDelayMs: 0,
        },
        new Map()
      );

      expect(result.attributes[0].referencedObjects).toEqual([]);
    });

    it('should not set referencedObjects for non-reference attributes', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'name',
          {
            id: { workspace_id: 'ws1', object_id: 'o1', attribute_id: 'a1' },
            api_slug: 'name',
            title: 'Name',
            type: 'text',
            is_writable: true,
          },
        ],
      ]);
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service['fetchObjectSchema'](
        'companies',
        {
          maxOptionsPerAttribute: 20,
          includeArchived: false,
          optionFetchDelayMs: 0,
        },
        new Map()
      );

      expect(result.attributes[0].referencedObjects).toBeUndefined();
    });
  });

  describe('workspace metadata and schema hash', () => {
    it('should stamp workspace identity from /self and a schema hash', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map([
        [
          'name',
          {
            id: { workspace_id: 'ws1', object_id: 'o1', attribute_id: 'a1' },
            api_slug: 'name',
            title: 'Name',
            type: 'text',
            is_writable: true,
          },
        ],
      ]);
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockImplementation((url: string) => {
          if (url === '/self') {
            return Promise.resolve({
              data: {
                workspace_id: 'ws-uuid-1',
                workspace_name: 'Acme Workspace',
              },
            });
          }
          return Promise.resolve({ data: { data: [] } });
        }),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.metadata.workspace).toBe('Acme Workspace');
      expect(result.metadata.workspaceId).toBe('ws-uuid-1');
      expect(result.metadata.schemaHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should fall back to "attio" when /self fails', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Default beforeEach mock rejects all client calls

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.metadata.workspace).toBe('attio');
      expect(result.metadata.workspaceId).toBeUndefined();
    });
  });

  describe('lists', () => {
    it('should fetch lists with stage options when includeLists is set', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      vi.mocked(getLazyAttioClient).mockReturnValue({
        get: vi.fn().mockImplementation((url: string) => {
          if (url.startsWith('/lists?')) {
            return Promise.resolve({
              data: {
                data: [
                  {
                    id: { workspace_id: 'ws1', list_id: 'list-uuid-1' },
                    api_slug: 'prospecting',
                    name: 'Prospecting',
                    parent_object: 'companies',
                  },
                ],
              },
            });
          }
          if (url.startsWith('/lists/list-uuid-1/attributes?')) {
            return Promise.resolve({
              data: {
                data: [
                  {
                    api_slug: 'stage',
                    title: 'Stage',
                    type: 'status',
                    is_writable: true,
                  },
                ],
              },
            });
          }
          if (url.startsWith('/lists/list-uuid-1/attributes/stage/statuses')) {
            return Promise.resolve({
              data: {
                data: [
                  {
                    id: { status_id: 'status-1' },
                    title: 'Interested',
                    is_archived: false,
                  },
                  {
                    id: { status_id: 'status-2' },
                    title: 'Demo Scheduled',
                    is_archived: false,
                  },
                ],
              },
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      } as unknown as ReturnType<typeof getLazyAttioClient>);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
        includeLists: true,
      });

      expect(result.lists).toHaveLength(1);
      const list = result.lists![0];
      expect(list.listId).toBe('list-uuid-1');
      expect(list.apiSlug).toBe('prospecting');
      expect(list.name).toBe('Prospecting');
      expect(list.parentObjects).toEqual(['companies']);
      expect(list.attributes).toHaveLength(1);
      expect(list.attributes[0].apiSlug).toBe('stage');
      expect(list.attributes[0].options?.map((o) => o.title)).toEqual([
        'Interested',
        'Demo Scheduled',
      ]);
      expect(list.attributes[0].options?.[0].id).toBe('status-1');
    });

    it('should omit lists when includeLists is not set', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
      });

      expect(result.lists).toBeUndefined();
    });

    it('should degrade to an empty list array when /lists fails', async () => {
      const mockMetadata: Map<string, AttioAttributeMetadata> = new Map();
      vi.mocked(getObjectAttributeMetadata).mockResolvedValue(mockMetadata);
      // Default beforeEach mock rejects all client calls

      const result = await service.fetchSchema(['companies'], {
        maxOptionsPerAttribute: 20,
        includeArchived: false,
        optionFetchDelayMs: 0,
        includeLists: true,
      });

      expect(result.lists).toEqual([]);
    });
  });
});
