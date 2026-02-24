import { safeExtractRecordValues } from '@/handlers/tool-configs/shared/type-utils.js';
import {
  extractDisplayValue,
  extractRecordDisplayName,
} from '@/handlers/tool-configs/universal/core/value-extractors.js';
import { UniversalResourceType } from '@/handlers/tool-configs/universal/types.js';

const MISSING_VALUE = 'N/A';

interface LocationSummary {
  name: string;
  locationId: string;
  lxd: string;
  sfOccupied: string;
  landlord: string;
  market: string;
  submarket: string;
  streetAddress: string;
  companyName: string;
  companyId: string;
  locationWebUrl: string;
  companyWebUrl: string;
}

function extractExtendedDisplayValue(value: unknown): string | undefined {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const direct = extractDisplayValue(value);
  if (direct) {
    return direct;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractExtendedDisplayValue(item);
      if (extracted) {
        return extracted;
      }
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  if (typeof obj.value === 'number' || typeof obj.value === 'boolean') {
    return String(obj.value);
  }

  const option = obj.option as Record<string, unknown> | undefined;
  if (typeof option?.title === 'string' && option.title.trim()) {
    return option.title.trim();
  }

  if (typeof obj.target_record_id === 'string' && obj.target_record_id.trim()) {
    return obj.target_record_id.trim();
  }

  return undefined;
}

function getLocationField(
  values: Record<string, unknown>,
  ...fieldNames: string[]
): string | undefined {
  for (const fieldName of fieldNames) {
    const extracted = extractExtendedDisplayValue(values[fieldName]);
    if (extracted) {
      return extracted;
    }
  }

  return undefined;
}

function getRecordId(record: Record<string, unknown>): string {
  const idObj =
    typeof record.id === 'object' && record.id !== null
      ? (record.id as Record<string, unknown>)
      : undefined;
  const id =
    (typeof idObj?.record_id === 'string' ? idObj.record_id : undefined) ||
    (typeof idObj?.list_id === 'string' ? idObj.list_id : undefined);
  return id || 'unknown';
}

function getLocationWebUrl(
  record: Record<string, unknown>
): string | undefined {
  return typeof record.web_url === 'string' && record.web_url.trim()
    ? record.web_url
    : undefined;
}

function getAssociatedCompanyId(
  values: Record<string, unknown>
): string | undefined {
  const companyRef = values.company;
  if (Array.isArray(companyRef)) {
    for (const ref of companyRef) {
      if (!ref || typeof ref !== 'object') continue;
      const refObj = ref as Record<string, unknown>;
      if (
        typeof refObj.target_record_id === 'string' &&
        refObj.target_record_id.trim()
      ) {
        return refObj.target_record_id.trim();
      }
      if (typeof refObj.record_id === 'string' && refObj.record_id.trim()) {
        return refObj.record_id.trim();
      }
    }
  }

  if (typeof companyRef === 'string' && companyRef.trim()) {
    return companyRef.trim();
  }

  return undefined;
}

function inferCompanyNameFromTenant(tenantName?: string): string | undefined {
  if (!tenantName) {
    return undefined;
  }
  const separatorIndex = tenantName.indexOf(' - ');
  if (separatorIndex > 0) {
    return tenantName.slice(0, separatorIndex).trim();
  }
  return tenantName.trim() || undefined;
}

function getAssociatedCompanyName(
  values: Record<string, unknown>,
  companyId?: string
): string {
  const explicitCompanyName = getLocationField(
    values,
    'company_name',
    'associated_company_name'
  );
  if (explicitCompanyName) {
    return explicitCompanyName;
  }

  const tenantName = getLocationField(values, 'tenant_name');
  const inferredFromTenant = inferCompanyNameFromTenant(tenantName);
  if (inferredFromTenant) {
    return inferredFromTenant;
  }

  return companyId || MISSING_VALUE;
}

function getWorkspaceSlugFromWebUrl(webUrl: string): string | undefined {
  const match = webUrl.match(/^https?:\/\/app\.attio\.com\/([^/]+)\//i);
  return match?.[1];
}

function buildCompanyWebUrl(
  locationWebUrl: string | undefined,
  companyId: string | undefined
): string | undefined {
  if (!locationWebUrl || !companyId) {
    return undefined;
  }
  const workspaceSlug = getWorkspaceSlugFromWebUrl(locationWebUrl);
  if (!workspaceSlug) {
    return undefined;
  }
  return `https://app.attio.com/${workspaceSlug}/company/${companyId}`;
}

export function isLocationResourceType(resourceType?: string): boolean {
  return resourceType === UniversalResourceType.LOCATIONS;
}

export function buildLocationSearchSummary(
  record: Record<string, unknown>
): LocationSummary {
  const values = safeExtractRecordValues(record);
  const locationId = getRecordId(record);
  const locationWebUrl = getLocationWebUrl(record) ?? MISSING_VALUE;
  const companyId = getAssociatedCompanyId(values) ?? MISSING_VALUE;
  const companyWebUrl =
    buildCompanyWebUrl(
      locationWebUrl,
      companyId === MISSING_VALUE ? undefined : companyId
    ) ?? MISSING_VALUE;

  return {
    name: extractRecordDisplayName(record, UniversalResourceType.LOCATIONS),
    locationId,
    lxd: getLocationField(values, 'exp_date') ?? MISSING_VALUE,
    sfOccupied: getLocationField(values, 'sf_occupied') ?? MISSING_VALUE,
    landlord: getLocationField(values, 'landlord') ?? MISSING_VALUE,
    market: getLocationField(values, 'market_2', 'market') ?? MISSING_VALUE,
    submarket: getLocationField(values, 'submarket') ?? MISSING_VALUE,
    streetAddress:
      getLocationField(values, 'street_address_1', 'address', 'full_address') ??
      MISSING_VALUE,
    companyName: getAssociatedCompanyName(
      values,
      companyId === MISSING_VALUE ? undefined : companyId
    ),
    companyId,
    locationWebUrl,
    companyWebUrl,
  };
}

export function formatLocationSearchResultLine(
  record: Record<string, unknown>,
  index: number
): string {
  const summary = buildLocationSearchSummary(record);

  return `${index + 1}. ${summary.name} (ID: ${summary.locationId}) | LXD: ${
    summary.lxd
  } | SF Occupied: ${summary.sfOccupied} | Landlord: ${
    summary.landlord
  } | Market: ${summary.market} | Submarket: ${
    summary.submarket
  } | Street Address: ${summary.streetAddress} | Company: ${
    summary.companyName
  } (ID: ${summary.companyId}) | Location URL: ${
    summary.locationWebUrl
  } | Company URL: ${summary.companyWebUrl}`;
}
