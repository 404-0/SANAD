/**
 * Which step gets a diagram, keyed `flowId:nodeId`.
 *
 * Presentation only: each entry mirrors what that node's own text already says.
 * A node missing from this map renders without a picture, so new flow files
 * keep working untouched.
 */
export const STEP_ART = {
  'severe_external_bleeding:__entry_action__': 'directPressure',
  'severe_external_bleeding:instr_wound_packing': 'directPressure',
  'severe_external_bleeding:instr_tourniquet_apply': 'tourniquet',
  'severe_external_bleeding:instr_second_tourniquet': 'tourniquet',
  'severe_external_bleeding:amputation_branch': 'directPressure',
  'severe_external_bleeding:shock_care': 'legsRaised',
  'severe_external_bleeding:instr_open_airway': 'openAirway',

  'cardiac_arrest_cpr:adult_cpr': 'compressions',
  'cardiac_arrest_cpr:adult_30_2': 'compressions',
  'cardiac_arrest_cpr:adult_hands_only': 'compressions',
  'cardiac_arrest_cpr:child_cpr': 'compressions',
  'cardiac_arrest_cpr:child_initial_breaths': 'openAirway',
  'cardiac_arrest_cpr:infant_initial_breaths': 'openAirway',
  'cardiac_arrest_cpr:infant_cpr': 'infantCompressions',

  'choking:adult_back_blows': 'backBlows',
  'choking:adult_back_blows_special': 'backBlows',
  'choking:adult_abdominal_thrusts': 'abdominalThrusts',
  'choking:adult_cycle': 'backBlows',
  'choking:infant_back_blows': 'infantBackBlows',
  'choking:infant_chest_thrusts': 'infantCompressions',
  'choking:infant_cycle': 'infantBackBlows',

  'unresponsive_breathing:recovery_position': 'recoveryPosition',
  'unresponsive_breathing:recovery_position_steps': 'recoveryPosition',

  'burns:cool_burn': 'coolWater',
  'burns:finish_cooling': 'coolWater',

  'heat_illness:cool_person': 'coolWater',

  'seizure:protect_person': 'cushionHead',
  'seizure:protect_head': 'cushionHead',
};

export const artFor = (flowId, nodeId) => STEP_ART[`${flowId}:${nodeId}`] || null;
