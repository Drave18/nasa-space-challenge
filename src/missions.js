/** @typedef {import('./missions.d.ts').MissionRecord} MissionRecord */

/**
 * Fetch the static mission snapshot. Never runs the scraper or contacts NASA.
 * @param {string | URL} [url]
 * @returns {Promise<MissionRecord[]>}
 */
export async function loadMissions(url = '/data/missions.json') {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mission snapshot request failed: ${response.status} ${url}`);
  }
  let data;
  try {
    data = await response.json();
  } catch (cause) {
    throw new Error(`Invalid mission JSON from ${url}`, { cause });
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Expected a non-empty mission array from ${url}`);
  }
  return data;
}
