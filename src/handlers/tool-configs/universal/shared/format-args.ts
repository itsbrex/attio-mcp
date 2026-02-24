/**
 * Helpers for parsing universal tool formatter arguments.
 *
 * Formatters may be called in two shapes:
 * 1) Legacy tests/callers: formatResult(results, resourceType, ...)
 * 2) Dispatcher runtime:    formatResult(results, argsObject, infoType)
 */

/**
 * Returns formatter args object when provided by the dispatcher.
 */
export function getFormatArgsObject(
  args: unknown[]
): Record<string, unknown> | undefined {
  if (!Array.isArray(args) || args.length === 0) {
    return undefined;
  }

  const first = args[0];
  if (typeof first !== 'object' || first === null || Array.isArray(first)) {
    return undefined;
  }

  return first as Record<string, unknown>;
}

/**
 * Reads a string argument from dispatcher args object first, then legacy index.
 */
export function getFormatArgString(
  args: unknown[],
  key: string,
  legacyIndex: number = 0
): string | undefined {
  const argObject = getFormatArgsObject(args);
  const valueFromObject = argObject?.[key];
  if (typeof valueFromObject === 'string') {
    return valueFromObject;
  }

  const legacyValue = args[legacyIndex];
  return typeof legacyValue === 'string' ? legacyValue : undefined;
}
