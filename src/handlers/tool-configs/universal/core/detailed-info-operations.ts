import {
  UniversalToolConfig,
  UniversalDetailedInfoParams,
  UniversalResourceType,
} from '../types.js';
import {
  getDetailedInfoSchema,
  validateUniversalToolParams,
} from '../schemas.js';
import {
  handleUniversalGetDetailedInfo,
  getSingularResourceType,
} from '../shared-handlers.js';
import { formatToolDescription } from '@/handlers/tools/standards/index.js';

export const getDetailedInfoConfig: UniversalToolConfig<
  UniversalDetailedInfoParams,
  Record<string, unknown>
> = {
  name: 'records_get_info',
  handler: async (params: UniversalDetailedInfoParams) => {
    validateUniversalToolParams('records_get_info', params);
    return await handleUniversalGetDetailedInfo(params);
  },
  formatResult: (info: Record<string, unknown>, ...args: unknown[]): string => {
    const resourceType = args[0] as UniversalResourceType | undefined;
    const detailedInfoType = args[1] as string | undefined;
    if (!info) {
      return 'No detailed information found';
    }

    const resourceTypeName = resourceType
      ? getSingularResourceType(resourceType)
      : 'record';

    let infoTypeLabel = 'detailed';
    if (detailedInfoType) {
      switch (detailedInfoType) {
        case 'contact':
          infoTypeLabel = 'contact';
          break;
        case 'business':
          infoTypeLabel = 'business';
          break;
        case 'social':
          infoTypeLabel = 'social';
          break;
        default:
          infoTypeLabel = 'detailed';
      }
    }

    let result = `${resourceTypeName.charAt(0).toUpperCase() + resourceTypeName.slice(1)} ${infoTypeLabel} information:\n\n`;

    if (typeof info === 'object' && info.values) {
      Object.entries(info.values as Record<string, unknown>).forEach(
        ([field, values]: [string, unknown]) => {
          if (Array.isArray(values) && values.length > 0) {
            const value = (values[0] as { value: string }).value;
            if (value) {
              const displayField =
                field.charAt(0).toUpperCase() + field.slice(1);
              result += `${displayField}: ${value}\n`;
            }
          }
        }
      );
    } else if (typeof info === 'object') {
      Object.entries(info).forEach(([key, value]: [string, unknown]) => {
        if (value && typeof value === 'string' && value.length < 200) {
          const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
          result += `${displayKey}: ${value}\n`;
        }
      });
    } else {
      result += JSON.stringify(info, null, 2);
    }

    return result;
  },
};

export const getDetailedInfoDefinition = {
  name: 'records_get_info',
  description: formatToolDescription({
    capability:
      'Retrieve enriched info subsets (contact, business, social) for a record.',
    boundaries: 'search lists of records or mutate data.',
    constraints:
      'Requires resource_type, record_id, and info_type (contact|business|social).',
    recoveryHint:
      'Use records.get_details if you need the full record payload.',
  }),
  inputSchema: getDetailedInfoSchema,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
  },
};
