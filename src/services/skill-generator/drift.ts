/**
 * Schema drift detection for generated workspace skills.
 *
 * The generator stamps a content hash of the fetched schema into SKILL.md.
 * `generate-skill --check` re-fetches the live schema, recomputes the hash,
 * and compares it against the stamped value to detect workspace drift
 * without regenerating the skill.
 */

import { createHash } from 'node:crypto';
import type {
  AttributeSchema,
  ListSchema,
  ObjectSchema,
  WorkspaceSchema,
} from './types.js';

/** Marker line rendered into SKILL.md (parsed back out by --check) */
export const SCHEMA_HASH_LABEL = 'Schema Hash';

const SCHEMA_HASH_PATTERN = /\*\*Schema Hash\*\*:\s*`([0-9a-f]{64})`/;

function sortByKey<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

/**
 * Produces a canonical, order-independent projection of an attribute
 * containing only fields that represent real schema state.
 */
function canonicalAttribute(attr: AttributeSchema): Record<string, unknown> {
  return {
    apiSlug: attr.apiSlug,
    displayName: attr.displayName,
    type: attr.type,
    isMultiselect: attr.isMultiselect,
    isUnique: attr.isUnique,
    isRequired: attr.isRequired,
    isWritable: attr.isWritable,
    description: attr.description ?? null,
    options: attr.options
      ? sortByKey(attr.options, (o) => o.title).map((o) => ({
          title: o.title,
          value: o.value,
          isArchived: o.isArchived ?? false,
        }))
      : null,
    relationship: attr.relationship ?? null,
    referencedObjects: attr.referencedObjects
      ? [...attr.referencedObjects].sort()
      : null,
  };
}

function canonicalObject(obj: ObjectSchema): Record<string, unknown> {
  return {
    objectSlug: obj.objectSlug,
    displayName: obj.displayName,
    attributes: sortByKey(obj.attributes, (a) => a.apiSlug).map(
      canonicalAttribute
    ),
  };
}

function canonicalList(list: ListSchema): Record<string, unknown> {
  return {
    listId: list.listId,
    apiSlug: list.apiSlug,
    name: list.name,
    parentObjects: [...list.parentObjects].sort(),
    attributes: sortByKey(list.attributes, (a) => a.apiSlug).map(
      canonicalAttribute
    ),
  };
}

/**
 * Computes a stable SHA-256 hash of the schema content (objects + lists).
 * Metadata (timestamps, workspace naming) is excluded so regenerating an
 * unchanged workspace yields an identical hash.
 */
export function computeSchemaHash(schema: WorkspaceSchema): string {
  const canonical = {
    objects: sortByKey(schema.objects, (o) => o.objectSlug).map(
      canonicalObject
    ),
    lists: schema.lists
      ? sortByKey(schema.lists, (l) => l.apiSlug || l.listId).map(canonicalList)
      : null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Extracts the stamped schema hash from SKILL.md content.
 *
 * @returns The 64-char hex hash, or null when no stamp is present
 */
export function extractSchemaHash(skillMdContent: string): string | null {
  const match = skillMdContent.match(SCHEMA_HASH_PATTERN);
  return match ? match[1] : null;
}

/** Result of a drift comparison */
export interface DriftReport {
  /** True when the live schema hash matches the stamped hash */
  inSync: boolean;

  /** Hash computed from the live workspace schema */
  liveHash: string;

  /** Hash stamped in the installed skill (null when missing) */
  installedHash: string | null;
}

/**
 * Compares a live schema against installed SKILL.md content.
 */
export function compareSchemaToSkill(
  liveSchema: WorkspaceSchema,
  skillMdContent: string
): DriftReport {
  const liveHash = computeSchemaHash(liveSchema);
  const installedHash = extractSchemaHash(skillMdContent);
  return {
    inSync: installedHash !== null && installedHash === liveHash,
    liveHash,
    installedHash,
  };
}
