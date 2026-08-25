/**
 * Service for fetching and aggregating Attio workspace schema data
 *
 * This service orchestrates calls to existing services to build a complete
 * workspace schema including objects, attributes, select options, and metadata.
 *
 * @see Issue #983
 */

import { getObjectAttributeMetadata } from '@/api/attribute-types.js';
import type { AttioAttributeMetadata } from '@/api/attribute-types.js';
import { getLazyAttioClient } from '@/api/lazy-client.js';
import { AttributeOptionsService } from '@/services/metadata/AttributeOptionsService.js';
import {
  debug as logDebug,
  error as logError,
  warn as logWarn,
} from '@/utils/logger.js';
import {
  DEFAULT_CONCURRENCY,
  mapWithConcurrency,
  withRateLimitRetry,
} from './concurrency.js';
import { computeSchemaHash } from './drift.js';
import type {
  WorkspaceSchema,
  ObjectSchema,
  AttributeSchema,
  FetchSchemaOptions,
  ListSchema,
} from './types.js';

/**
 * Represents a nested option ID object returned by Attio API
 * @see Issue #1014
 */
interface NestedOptionId {
  option_id: string;
  workspace_id?: string;
  object_id?: string;
  attribute_id?: string;
}

/**
 * Type guard to check if an ID is a nested option ID object
 * Attio API returns option IDs as nested objects: {workspace_id, object_id, attribute_id, option_id}
 * @param id - The ID value to check
 * @returns True if the ID is a nested option ID object
 * @see Issue #1014
 */
function isNestedOptionId(id: unknown): id is NestedOptionId {
  return typeof id === 'object' && id !== null && 'option_id' in id;
}

/**
 * Resolves the API value for a select/status option.
 *
 * Uses the real `value` field when the API provides one; otherwise falls
 * back to the option title, which per Attio docs is the value accepted in
 * record payloads. (Previously a slugified guess was generated from the
 * title, which produced values the API would reject.)
 *
 * @param option - Raw option from the Attio API
 * @returns The API value for this option
 */
function resolveOptionValue(option: {
  title: string;
  value?: unknown;
}): string {
  if (typeof option.value === 'string' && option.value.length > 0) {
    return option.value;
  }
  return option.title;
}

/**
 * Service for fetching complete workspace schema data
 *
 * Note: API key flows through getLazyAttioClient() from environment/context,
 * not through constructor dependency injection.
 */
export class WorkspaceSchemaService {
  /**
   * Creates a new WorkspaceSchemaService
   */
  constructor() {
    // No parameters needed - API key flows through getLazyAttioClient()
  }

  /**
   * Fetches the display title for an object from the Attio API
   *
   * @param objectSlug - Object API slug (e.g., 'companies', 'custom_prospecting_list')
   * @returns The object title from Attio, or null if fetch fails
   * @see Issue #1017
   */
  private async fetchObjectTitle(objectSlug: string): Promise<string | null> {
    try {
      const client = getLazyAttioClient();
      const response = await client.get(`/objects/${objectSlug}`);
      const obj = response?.data?.data || response?.data;
      return obj?.title || null;
    } catch {
      logDebug(
        'WorkspaceSchemaService',
        `Could not fetch title for ${objectSlug}, using fallback`,
        { objectSlug }
      );
      return null;
    }
  }

  private getOptionFetchDelayMs(options: FetchSchemaOptions): number {
    const optionFetchDelayMs = options.optionFetchDelayMs;
    if (optionFetchDelayMs === undefined) return 100;
    if (
      typeof optionFetchDelayMs !== 'number' ||
      !Number.isFinite(optionFetchDelayMs) ||
      optionFetchDelayMs < 0
    ) {
      return 100;
    }
    return optionFetchDelayMs;
  }

  /**
   * Fetches complete workspace schema for specified objects
   *
   * This method implements graceful degradation:
   * - If an object fails to fetch, it logs the error and continues with other objects
   * - If an attribute's options fail to fetch, it includes the attribute without options
   *
   * @param objectSlugs - Array of object slugs to fetch (e.g., ['companies', 'people'])
   * @param options - Fetching options (max options, include archived)
   * @returns Complete workspace schema
   */
  async fetchSchema(
    objectSlugs: string[],
    options: FetchSchemaOptions
  ): Promise<WorkspaceSchema> {
    // Fetch workspace identity and the object index (id → slug) up front;
    // both degrade gracefully to nulls/empty maps on failure.
    const [workspaceInfo, objectIndex] = await Promise.all([
      this.fetchWorkspaceInfo(),
      this.fetchObjectIndex(),
    ]);

    // Fetch object schemas with bounded parallelism (options within each
    // object are also fetched concurrently, so keep this level modest).
    const objectResults = await mapWithConcurrency(
      objectSlugs,
      Math.min(2, options.concurrency ?? DEFAULT_CONCURRENCY),
      async (objectSlug) => {
        try {
          return await this.fetchObjectSchema(objectSlug, options, objectIndex);
        } catch (error: unknown) {
          logError(
            'WorkspaceSchemaService',
            `Failed to fetch schema for ${objectSlug}`,
            error instanceof Error ? error : new Error(String(error)),
            { objectSlug }
          );
          // Continue processing other objects despite error
          return null;
        }
      }
    );
    const objects = objectResults.filter(
      (obj): obj is ObjectSchema => obj !== null
    );

    const lists = options.includeLists
      ? await this.fetchListSchemas(options)
      : undefined;

    const schema: WorkspaceSchema = {
      metadata: {
        generatedAt: new Date().toISOString(),
        workspace: workspaceInfo.name || 'attio',
        workspaceId: workspaceInfo.id,
        objects: objectSlugs,
      },
      objects,
      ...(lists !== undefined ? { lists } : {}),
    };
    schema.metadata.schemaHash = computeSchemaHash(schema);
    return schema;
  }

  /**
   * Fetches workspace identity from the Attio token introspection endpoint.
   * Degrades to empty values on failure.
   */
  private async fetchWorkspaceInfo(): Promise<{
    name?: string;
    id?: string;
  }> {
    try {
      const client = getLazyAttioClient();
      const response = await client.get('/self');
      const data = response?.data?.data || response?.data;
      return {
        name:
          typeof data?.workspace_name === 'string'
            ? data.workspace_name
            : undefined,
        id:
          typeof data?.workspace_id === 'string'
            ? data.workspace_id
            : undefined,
      };
    } catch {
      logDebug(
        'WorkspaceSchemaService',
        'Could not fetch workspace info from /self, using fallback',
        {}
      );
      return {};
    }
  }

  /**
   * Fetches the workspace object index mapping object UUIDs to API slugs.
   * Used to resolve record-reference `allowed_object_ids` into readable
   * object slugs. Degrades to an empty map on failure.
   */
  private async fetchObjectIndex(): Promise<Map<string, string>> {
    const index = new Map<string, string>();
    try {
      const client = getLazyAttioClient();
      const response = await client.get('/objects');
      const data = response?.data?.data || response?.data;
      if (Array.isArray(data)) {
        for (const obj of data) {
          const slug = obj?.api_slug;
          const rawId = obj?.id;
          const objectId =
            typeof rawId === 'string'
              ? rawId
              : typeof rawId?.object_id === 'string'
                ? rawId.object_id
                : undefined;
          if (typeof slug === 'string' && objectId) {
            index.set(objectId, slug);
          }
        }
      }
    } catch {
      logDebug(
        'WorkspaceSchemaService',
        'Could not fetch object index; record-reference targets will show raw ids',
        {}
      );
    }
    return index;
  }

  /**
   * Fetches schema for a single object
   *
   * @param objectSlug - Object slug (e.g., 'companies', 'people', 'deals')
   * @param options - Fetching options
   * @returns Object schema with all attributes and metadata
   */
  private async fetchObjectSchema(
    objectSlug: string,
    options: FetchSchemaOptions,
    objectIndex: Map<string, string>
  ): Promise<ObjectSchema> {
    const optionFetchDelayMs = this.getOptionFetchDelayMs(options);
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const PHASE1_OBJECTS = ['companies', 'people', 'deals'];

    // 1. Fetch object title from API for custom objects (Issue #1017)
    // Skip API call for Phase 1 objects - they have hardcoded display names
    const objectTitle = PHASE1_OBJECTS.includes(objectSlug)
      ? null
      : await this.fetchObjectTitle(objectSlug);

    // 2. Fetch attribute metadata (uses existing 15min TTL cache)
    const metadataMap = await getObjectAttributeMetadata(objectSlug);

    // 3. Convert metadata to AttributeSchema array
    const attributes: AttributeSchema[] = [];

    for (const [apiSlug, metadata] of metadataMap.entries()) {
      const attributeSchema: AttributeSchema = {
        apiSlug,
        displayName: metadata.title,
        type: metadata.type,
        isMultiselect: metadata.is_multiselect || false,
        isUnique: metadata.is_unique || false,
        isRequired: metadata.is_required || false,
        isWritable: metadata.is_writable !== false, // Default to true
        description: metadata.description,
      };

      // 4. Add complex type structures
      if (this.isComplexType(metadata.type)) {
        attributeSchema.complexTypeStructure = this.getComplexTypeStructure(
          metadata.type
        );
      }

      // 5. Add relationship metadata (only when we have real data)
      if (metadata.relationship?.object && metadata.relationship?.cardinality) {
        attributeSchema.relationship = {
          targetObject: metadata.relationship.object,
          cardinality: metadata.relationship.cardinality,
        };
      }

      // 6. Resolve record-reference targets to object slugs
      const referencedObjects = this.resolveReferencedObjects(
        metadata,
        objectIndex
      );
      if (referencedObjects) {
        attributeSchema.referencedObjects = referencedObjects;
      }

      attributes.push(attributeSchema);
    }

    // 7. Fetch options for select/status attributes with bounded
    // parallelism and rate-limit-aware retries
    const optionAttributes = attributes.filter((attr) =>
      this.isOptionBasedAttribute(attr.type)
    );
    await mapWithConcurrency(
      optionAttributes,
      concurrency,
      (attr) => this.populateAttributeOptions(objectSlug, attr, options),
      optionFetchDelayMs
    );

    return {
      objectSlug,
      displayName: this.getDisplayName(objectSlug, objectTitle),
      attributes,
    };
  }

  /**
   * Fetches and attaches select/status options to an attribute schema.
   * Failures are logged and leave the attribute without options.
   */
  private async populateAttributeOptions(
    objectSlug: string,
    attributeSchema: AttributeSchema,
    options: FetchSchemaOptions
  ): Promise<void> {
    const apiSlug = attributeSchema.apiSlug;
    try {
      const optionsResult = await withRateLimitRetry(
        () =>
          AttributeOptionsService.getOptions(
            objectSlug,
            apiSlug,
            options.includeArchived
          ),
        `${objectSlug}.${apiSlug} options`
      );

      // Apply truncation
      const totalOptions = optionsResult.options.length;
      const truncated = totalOptions > options.maxOptionsPerAttribute;

      attributeSchema.options = optionsResult.options
        .slice(0, options.maxOptionsPerAttribute)
        .map((opt) => ({
          // Handle nested ID objects from Attio API
          // API returns: { workspace_id, object_id, attribute_id, option_id }
          id: isNestedOptionId(opt.id)
            ? opt.id.option_id
            : typeof opt.id === 'string'
              ? opt.id
              : '',
          title: opt.title,
          value: resolveOptionValue(opt),
          isArchived: 'is_archived' in opt ? opt.is_archived : false,
        }));

      attributeSchema.optionsTruncated = truncated;
      attributeSchema.totalOptions = totalOptions;
    } catch (error: unknown) {
      // Log warning but don't fail - attribute can still be documented
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logWarn(
        'WorkspaceSchemaService',
        `No options available for ${objectSlug}.${apiSlug}`,
        { objectSlug, attributeSlug: apiSlug, errorMessage }
      );
    }
  }

  /**
   * Resolves the object slugs a record-reference attribute may point at.
   *
   * Prefers explicit relationship metadata; otherwise maps
   * `config.record_reference.allowed_object_ids` (UUIDs) to slugs via the
   * workspace object index. Unresolvable ids are kept raw so the
   * information is never silently dropped.
   *
   * @returns Slug array (empty = unrestricted reference), or undefined
   *          when the attribute is not a record reference
   */
  private resolveReferencedObjects(
    metadata: AttioAttributeMetadata,
    objectIndex: Map<string, string>
  ): string[] | undefined {
    if (metadata.type !== 'record-reference') {
      return undefined;
    }
    const allowedIds = metadata.config?.record_reference?.allowed_object_ids;
    if (!Array.isArray(allowedIds) || allowedIds.length === 0) {
      // Null/empty means the reference is unrestricted
      return [];
    }
    return allowedIds.map((id) => objectIndex.get(id) ?? id);
  }

  /**
   * Fetches workspace lists with their stage/select attributes and options.
   * Every step degrades gracefully; a list that fails to enumerate its
   * attributes is still included without them.
   */
  private async fetchListSchemas(
    options: FetchSchemaOptions
  ): Promise<ListSchema[]> {
    const client = getLazyAttioClient();
    let rawLists: unknown[] = [];
    try {
      const response = await client.get('/lists?limit=100');
      const data = response?.data?.data || response?.data;
      if (Array.isArray(data)) {
        rawLists = data;
      }
    } catch (error: unknown) {
      logWarn('WorkspaceSchemaService', 'Could not fetch workspace lists', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return [];
    }

    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const listResults = await mapWithConcurrency(
      rawLists,
      Math.min(2, concurrency),
      async (raw) => {
        const entry = raw as Record<string, unknown>;
        const rawId = entry.id as string | { list_id?: string } | undefined;
        const listId =
          typeof rawId === 'string' ? rawId : (rawId?.list_id ?? '');
        const apiSlug =
          typeof entry.api_slug === 'string' ? entry.api_slug : '';
        if (!listId && !apiSlug) return null;

        const parentRaw = entry.parent_object;
        const parentObjects = Array.isArray(parentRaw)
          ? parentRaw.filter((p): p is string => typeof p === 'string')
          : typeof parentRaw === 'string'
            ? [parentRaw]
            : [];

        return {
          listId,
          apiSlug,
          name: typeof entry.name === 'string' ? entry.name : apiSlug,
          parentObjects,
          attributes: await this.fetchListAttributes(
            listId || apiSlug,
            options
          ),
        } satisfies ListSchema;
      }
    );

    return listResults.filter((list): list is ListSchema => list !== null);
  }

  /**
   * Fetches a list's select/status attributes with their options.
   */
  private async fetchListAttributes(
    listIdOrSlug: string,
    options: FetchSchemaOptions
  ): Promise<AttributeSchema[]> {
    const client = getLazyAttioClient();
    let rawAttributes: unknown[] = [];
    try {
      const response = await client.get(
        `/lists/${listIdOrSlug}/attributes?limit=500`
      );
      const data = response?.data?.data || response?.data;
      if (Array.isArray(data)) {
        rawAttributes = data;
      }
    } catch (error: unknown) {
      logWarn(
        'WorkspaceSchemaService',
        `Could not fetch attributes for list ${listIdOrSlug}`,
        {
          listId: listIdOrSlug,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );
      return [];
    }

    const attributes: AttributeSchema[] = [];
    for (const raw of rawAttributes) {
      const meta = raw as AttioAttributeMetadata;
      if (!meta?.api_slug) continue;
      attributes.push({
        apiSlug: meta.api_slug,
        displayName: meta.title,
        type: meta.type,
        isMultiselect: meta.is_multiselect || false,
        isUnique: meta.is_unique || false,
        isRequired: meta.is_required || false,
        isWritable: meta.is_writable !== false,
        description: meta.description,
      });
    }

    // Only fetch options for stage/select attributes on lists
    const optionAttributes = attributes.filter((attr) =>
      this.isOptionBasedAttribute(attr.type)
    );
    await mapWithConcurrency(
      optionAttributes,
      options.concurrency ?? DEFAULT_CONCURRENCY,
      (attr) => this.populateListAttributeOptions(listIdOrSlug, attr, options),
      this.getOptionFetchDelayMs(options)
    );

    return attributes;
  }

  /**
   * Fetches and attaches options for a list attribute (statuses for stage
   * attributes, options for selects). Failures leave the attribute bare.
   */
  private async populateListAttributeOptions(
    listIdOrSlug: string,
    attributeSchema: AttributeSchema,
    options: FetchSchemaOptions
  ): Promise<void> {
    const client = getLazyAttioClient();
    const endpoint = attributeSchema.type === 'status' ? 'statuses' : 'options';
    const showArchived = options.includeArchived ? '?show_archived=true' : '';
    try {
      const response = await withRateLimitRetry(
        () =>
          client.get(
            `/lists/${listIdOrSlug}/attributes/${attributeSchema.apiSlug}/${endpoint}${showArchived}`
          ),
        `list ${listIdOrSlug}.${attributeSchema.apiSlug} ${endpoint}`
      );
      const data = response?.data?.data || response?.data;
      if (!Array.isArray(data)) return;

      const totalOptions = data.length;
      attributeSchema.options = data
        .slice(0, options.maxOptionsPerAttribute)
        .map((raw) => {
          const opt = raw as {
            id?: unknown;
            title: string;
            value?: unknown;
            is_archived?: boolean;
          };
          const rawId = opt.id as
            | string
            | { option_id?: string; status_id?: string }
            | undefined;
          return {
            id:
              typeof rawId === 'string'
                ? rawId
                : (rawId?.option_id ?? rawId?.status_id ?? ''),
            title: opt.title,
            value: resolveOptionValue(opt),
            isArchived: opt.is_archived ?? false,
          };
        });
      attributeSchema.optionsTruncated =
        totalOptions > options.maxOptionsPerAttribute;
      attributeSchema.totalOptions = totalOptions;
    } catch (error: unknown) {
      logWarn(
        'WorkspaceSchemaService',
        `No options available for list ${listIdOrSlug}.${attributeSchema.apiSlug}`,
        {
          listId: listIdOrSlug,
          attributeSlug: attributeSchema.apiSlug,
          errorMessage: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Checks if an attribute type supports options (select, status, multi-select)
   *
   * @param type - Attribute type from Attio API
   * @returns True if attribute supports options
   */
  private isOptionBasedAttribute(type: string): boolean {
    return ['select', 'status', 'multi-select'].includes(type);
  }

  /**
   * Checks if an attribute type is a complex type requiring structure documentation
   *
   * @param type - Attribute type from Attio API
   * @returns True if attribute is a complex type
   */
  private isComplexType(type: string): boolean {
    return [
      'location',
      'personal-name',
      'phone-number',
      'email-address',
    ].includes(type);
  }

  /**
   * Gets the structure definition for complex attribute types
   *
   * @param type - Complex attribute type
   * @returns Structure definition with field types
   */
  private getComplexTypeStructure(type: string): Record<string, unknown> {
    switch (type) {
      case 'location':
        return {
          line_1: 'string | null (street address)',
          line_2: 'string | null (apt/suite)',
          line_3: 'string | null (additional)',
          line_4: 'string | null (additional)',
          locality: 'string | null (city)',
          region: 'string | null (state/province)',
          postcode: 'string | null (ZIP/postal code)',
          country_code: 'string | null (ISO country code)',
          latitude: 'number | null (coordinates)',
          longitude: 'number | null (coordinates)',
        };

      case 'personal-name':
        return {
          first_name: 'string (required)',
          last_name: 'string | null',
          middle_name: 'string | null',
          title: 'string | null (e.g., "Dr.", "Prof.")',
          full_name: 'string (auto-generated, read-only)',
        };

      case 'phone-number':
        return {
          country_code: 'string (e.g., "+1")',
          number: 'string (digits only)',
          original_number: 'string (as provided)',
        };

      case 'email-address':
        return {
          email_address: 'string (valid email format)',
        };

      default:
        return {};
    }
  }

  /**
   * Gets human-readable display name for an object slug
   *
   * Uses the fetched title from Attio API if available, otherwise falls back
   * to hardcoded display names for Phase 1 objects or slug capitalization.
   *
   * @param objectSlug - Object API slug
   * @param fetchedTitle - Title fetched from Attio API (optional)
   * @returns Human-readable display name
   * @see Issue #1017
   */
  private getDisplayName(
    objectSlug: string,
    fetchedTitle?: string | null
  ): string {
    // Use API-fetched title if available
    if (fetchedTitle) {
      return fetchedTitle;
    }

    // Fallback to hardcoded display names for Phase 1 objects
    const displayNames: Record<string, string> = {
      companies: 'Companies',
      people: 'People',
      deals: 'Deals',
    };

    // If not in map, title-case the slug (replace underscores with spaces)
    return (
      displayNames[objectSlug] ||
      objectSlug
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    );
  }
}
