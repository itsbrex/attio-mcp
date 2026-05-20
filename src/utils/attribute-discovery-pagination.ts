/**
 * Shared attribute discovery pagination helpers.
 *
 * Attio attribute endpoints may return paginated data depending on workspace size.
 * This helper fetches up to a configured maximum and stops early when:
 * - no attributes are returned
 * - a page adds no new attributes (prevents loops when pagination params are ignored)
 * - response size indicates final page (and no cursor is provided)
 */

export const DEFAULT_ATTRIBUTE_DISCOVERY_MAX = 500;
export const DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE = 100;

interface HttpClientLike {
  get: (path: string) => Promise<{ data?: unknown }>;
}

interface FetchAllObjectAttributesOptions {
  client: HttpClientLike;
  objectSlug: string;
  categories?: string[];
  maxAttributes?: number;
  pageSize?: number;
}

function toPositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseAttributesPayload(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    const payload = data as Record<string, unknown>;
    const directData = payload.data;
    if (Array.isArray(directData)) {
      return directData;
    }

    const attrs = payload.attributes;
    if (Array.isArray(attrs)) {
      return attrs;
    }

    const items = payload.items;
    if (Array.isArray(items)) {
      return items;
    }
  }

  return [];
}

function getPaginationCursor(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as Record<string, unknown>;
  const direct = payload.next_cursor;
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }

  const meta = payload.meta;
  if (meta && typeof meta === 'object') {
    const metaCursor = (meta as Record<string, unknown>).next_cursor;
    if (typeof metaCursor === 'string' && metaCursor.length > 0) {
      return metaCursor;
    }
  }

  const pagination = payload.pagination;
  if (pagination && typeof pagination === 'object') {
    const paginationCursor = (pagination as Record<string, unknown>)
      .next_cursor;
    if (typeof paginationCursor === 'string' && paginationCursor.length > 0) {
      return paginationCursor;
    }
  }

  return null;
}

function getAttributeKey(attribute: unknown): string {
  if (!attribute || typeof attribute !== 'object') {
    return JSON.stringify(attribute);
  }

  const record = attribute as Record<string, unknown>;
  const apiSlug = record.api_slug;
  if (typeof apiSlug === 'string' && apiSlug.length > 0) {
    return `api_slug:${apiSlug}`;
  }

  const slug = record.slug;
  if (typeof slug === 'string' && slug.length > 0) {
    return `slug:${slug}`;
  }

  const id = record.id;
  if (typeof id === 'string' && id.length > 0) {
    return `id:${id}`;
  }

  if (id && typeof id === 'object') {
    const attributeId = (id as Record<string, unknown>).attribute_id;
    if (typeof attributeId === 'string' && attributeId.length > 0) {
      return `attribute_id:${attributeId}`;
    }
  }

  return `json:${JSON.stringify(record)}`;
}

export async function fetchAllObjectAttributes(
  options: FetchAllObjectAttributesOptions
): Promise<unknown[]> {
  const maxAttributes = toPositiveInteger(
    options.maxAttributes ?? DEFAULT_ATTRIBUTE_DISCOVERY_MAX,
    DEFAULT_ATTRIBUTE_DISCOVERY_MAX
  );
  const pageSize = Math.min(
    toPositiveInteger(
      options.pageSize ?? DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE,
      DEFAULT_ATTRIBUTE_DISCOVERY_PAGE_SIZE
    ),
    maxAttributes
  );

  const collected: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let usingCursor = false;
  let offset = 0;

  while (collected.length < maxAttributes) {
    const requestedLimit = Math.min(pageSize, maxAttributes - collected.length);
    const query = new URLSearchParams();
    const isFirstPageWithoutCursor = !cursor && offset === 0;
    if (!isFirstPageWithoutCursor) {
      query.set('limit', String(requestedLimit));
    }

    if (options.categories && options.categories.length > 0) {
      query.set('categories', options.categories.join(','));
    }

    if (cursor) {
      query.set('cursor', cursor);
    } else if (offset > 0) {
      query.set('offset', String(offset));
    }

    const queryString = query.toString();
    const path = queryString
      ? `/objects/${options.objectSlug}/attributes?${queryString}`
      : `/objects/${options.objectSlug}/attributes`;
    const response = await options.client.get(path);

    const responseData = response?.data;
    const pageAttributes = parseAttributesPayload(responseData);
    if (pageAttributes.length === 0) {
      break;
    }

    let addedThisPage = 0;
    for (const attribute of pageAttributes) {
      const key = getAttributeKey(attribute);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      collected.push(attribute);
      addedThisPage += 1;

      if (collected.length >= maxAttributes) {
        break;
      }
    }

    if (addedThisPage === 0) {
      // Smart stop: pagination params are likely ignored or exhausted.
      break;
    }

    const nextCursor = getPaginationCursor(responseData);
    if (nextCursor) {
      usingCursor = true;
      cursor = nextCursor;
      continue;
    }

    if (usingCursor) {
      break;
    }

    // Offset fallback for APIs that support offset pagination.
    offset += pageAttributes.length;

    if (pageAttributes.length < requestedLimit) {
      break;
    }
  }

  return collected;
}
