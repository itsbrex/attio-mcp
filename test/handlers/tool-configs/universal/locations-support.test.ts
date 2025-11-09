/**
 * Test that locations are properly supported in the universal tools
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { UniversalResourceType } from '@/handlers/tool-configs/universal/types.js';
import { validateResourceType } from '@/handlers/tool-configs/universal/field-mapper/validators/resource-validator.js';
import { RESOURCE_TYPE_MAPPINGS } from '@/handlers/tool-configs/universal/field-mapper/constants/index.js';
import { mapRecordFields } from '@/handlers/tool-configs/universal/field-mapper/index.js';
import { loadMappingConfig } from '@/utils/config-loader.js';

describe('Locations Support in Universal Tools', () => {
  describe('Resource Type Enum', () => {
    it('should include LOCATIONS in UniversalResourceType enum', () => {
      expect(UniversalResourceType.LOCATIONS).toBe('locations');
      expect(Object.values(UniversalResourceType)).toContain('locations');
    });
  });

  describe('Resource Type Validation', () => {
    it('should validate "locations" as a valid resource type', () => {
      const result = validateResourceType('locations');
      expect(result.valid).toBe(true);
      expect(result.corrected).toBeUndefined();
    });

    it('should validate "location" and correct to "locations"', () => {
      const result = validateResourceType('location');
      expect(result.valid).toBe(false);
      expect(result.corrected).toBe(UniversalResourceType.LOCATIONS);
    });

    it('should validate "Locations" and correct to "locations"', () => {
      const result = validateResourceType('Locations');
      expect(result.valid).toBe(false);
      expect(result.corrected).toBe(UniversalResourceType.LOCATIONS);
    });
  });

  describe('Field Mappings', () => {
    it('should have field mappings for locations', () => {
      expect(
        RESOURCE_TYPE_MAPPINGS[UniversalResourceType.LOCATIONS]
      ).toBeDefined();
      const mapping = RESOURCE_TYPE_MAPPINGS[UniversalResourceType.LOCATIONS];
      expect(mapping.fieldMappings).toBeDefined();
      expect(mapping.validFields).toBeDefined();
      expect(mapping.commonMistakes).toBeDefined();
    });

    it('should map common location field names', async () => {
      const result = await mapRecordFields(UniversalResourceType.LOCATIONS, {
        tenant: 'Acme Corp',
        building: 'Tower One',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        square_feet: 5000,
      });

      expect(result.mapped).toMatchObject({
        tenant_name: 'Acme Corp',
        building_name: 'Tower One',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        sf_occupied: 5000,
      });
      // Some warnings about unmapped fields are expected
      // as not all fields have direct mappings
      expect(result.warnings).toBeDefined();
    });
  });

  describe('Config Loader Integration', () => {
    it('should include locations in the objects mapping', () => {
      const config = loadMappingConfig();
      const objectMappings = config.mappings.objects;

      // Check that at least one mapping to 'locations' exists
      const locationMappings = Object.entries(objectMappings).filter(
        ([_, value]) => value === 'locations'
      );

      expect(locationMappings.length).toBeGreaterThan(0);

      // Check for both singular and plural forms
      const mappingKeys = locationMappings.map(([key]) => key);
      expect(mappingKeys).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^Location$/i),
          expect.stringMatching(/^Locations$/i),
        ])
      );
    });

    it('should have location attributes in the config', () => {
      const config = loadMappingConfig();
      expect(config.mappings.attributes.objects.locations).toBeDefined();

      const locationAttrs = config.mappings.attributes.objects.locations;
      // Check for some key location attributes
      expect(locationAttrs).toHaveProperty('Tenant Name');
      expect(locationAttrs).toHaveProperty('City');
      expect(locationAttrs).toHaveProperty('State');
    });
  });
});
