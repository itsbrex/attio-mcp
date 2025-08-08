/** Helper functions for transformers (extracted to avoid circular deps) */

/**
 * Extract text value from an Attio attribute
 */
export function extractAttributeValue(attribute: any): string {
  if (!attribute) return '';

  if (typeof attribute === 'string') return attribute;
  if (attribute.value !== undefined) return String(attribute.value);
  if (attribute.text) return attribute.text;
  if (attribute.name) return attribute.name;

  if (attribute.email_address) return attribute.email_address;
  if (attribute.phone_number) return attribute.phone_number;

  if (Array.isArray(attribute)) {
    return attribute
      .map((item) => extractAttributeValue(item))
      .filter(Boolean)
      .join(', ');
  }

  if (attribute.values && Array.isArray(attribute.values)) {
    return attribute.values
      .map((v: any) => extractAttributeValue(v))
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

/**
 * Build a text description from multiple attributes
 */
export function buildTextDescription(
  attributes: any,
  fields: string[]
): string {
  const parts: string[] = [];

  for (const field of fields) {
    const value = extractAttributeValue(attributes[field]);
    if (value) {
      parts.push(value);
    }
  }

  return parts.join(' • ');
}

/**
 * Generate a URL for an Attio record
 */
export function generateRecordUrl(
  recordId: string,
  resourceType: string
): string {
  const baseUrl = process.env.ATTIO_BASE_URL || 'https://app.attio.com';

  switch (resourceType) {
    case 'companies':
      return `${baseUrl}/objects/companies/${recordId}`;
    case 'people':
      return `${baseUrl}/objects/people/${recordId}`;
    case 'lists':
      return `${baseUrl}/lists/${recordId}`;
    case 'tasks':
      return `${baseUrl}/tasks/${recordId}`;
    default:
      return `${baseUrl}/objects/${resourceType}/${recordId}`;
  }
}
