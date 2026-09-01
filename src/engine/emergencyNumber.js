import { getRegion } from '../config/regions.js';

/**
 * Resolution order for the number behind the persistent call button:
 *   1. a number the user typed in themselves (they know their own city)
 *   2. flow.emergency_number.regions[<region>]      (per-flow, per-region)
 *   3. flow.emergency_number.number                 (per-flow default)
 *   4. the app's region table
 *   5. nothing — the UI must then ask the user to configure a number
 */
export function resolveEmergencyNumber({ flow, regionId, customNumber }) {
  const region = getRegion(regionId);

  if (customNumber) {
    return {
      number: customNumber,
      verified: false,
      origin: 'custom',
      regionId: region.id,
      requiresVerification: true,
      source: null,
    };
  }

  const flowConfig = flow?.emergencyNumber || null;
  const flowRegion = flowConfig?.regions?.[region.id] || flowConfig?.regions?._default || null;
  if (flowRegion?.number) {
    return {
      number: flowRegion.number,
      verified: flowRegion.requires_verification !== true,
      origin: 'flow_region',
      regionId: region.id,
      requiresVerification: flowRegion.requires_verification === true,
      source: (flowRegion.sources || [])[0] || null,
      sourceKey: (flowRegion.sources || [])[0] || null,
    };
  }

  if (flowConfig?.number) {
    return {
      number: flowConfig.number,
      verified: flowConfig.requires_verification !== true,
      origin: 'flow_default',
      regionId: region.id,
      requiresVerification: flowConfig.requires_verification === true,
      source: null,
    };
  }

  if (region.number) {
    return {
      number: region.number,
      verified: region.verified === true,
      origin: 'app_region',
      regionId: region.id,
      requiresVerification: region.verified !== true,
      source: region.source || null,
    };
  }

  return {
    number: null,
    verified: false,
    origin: 'none',
    regionId: region.id,
    requiresVerification: true,
    source: null,
  };
}
