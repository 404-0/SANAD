/**
 * Presentation-only ordering for the manual test buttons on the home screen.
 * It affects nothing inside the engine — an unlisted flow simply sorts last,
 * so dropping a new JSON file into src/data/flows still needs zero code edits.
 */
export const HOME_PRIORITY = [
  'severe_external_bleeding',
  'cardiac_arrest_cpr',
  'unresponsive_breathing',
  'choking',
  'seizure',
  'poisoning',
  'electrical_shock',
  'burns',
  'heat_illness',
  'fracture_serious_injury',
];

export const homeSort = (a, b) => {
  const rank = (flow) => {
    const index = HOME_PRIORITY.indexOf(flow.id);
    return index === -1 ? HOME_PRIORITY.length : index;
  };
  return rank(a) - rank(b) || a.id.localeCompare(b.id);
};
