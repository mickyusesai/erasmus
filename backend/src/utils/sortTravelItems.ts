/**
 * Re-sorts travel items that share the same departure date by journey continuity.
 *
 * When two legs have the same date, the DB sort order reflects insertion order
 * (i.e. which document the consolidation AI processed first), which can produce
 * incorrect orderings like "Eindhoven→Dordrecht" before "Krakow→Eindhoven" even
 * though you obviously need to arrive in Eindhoven first.
 *
 * Within each same-date group we do a greedy topological sort: repeatedly pick
 * the item whose fromLocation matches the previous leg's toLocation. Falls back
 * to original order when no continuity match is found (e.g. disconnected legs).
 */
export function sortTravelItemsByJourney<
  T extends { departureDate: Date | string; fromLocation: string; toLocation: string },
>(items: T[]): T[] {
  if (items.length <= 1) return items;

  const normalize = (s: string) => s.toLowerCase().trim();
  const dateKey = (item: T) =>
    typeof item.departureDate === 'string'
      ? item.departureDate.slice(0, 10)
      : (item.departureDate as Date).toISOString().slice(0, 10);

  // Group by calendar date (items already arrive sorted by date from DB)
  const groups: T[][] = [];
  for (const item of items) {
    const key = dateKey(item);
    const last = groups[groups.length - 1];
    if (last && dateKey(last[0]) === key) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }

  const result: T[] = [];
  let lastTo: string | null = null;

  for (const group of groups) {
    if (group.length === 1) {
      lastTo = normalize(group[0].toLocation);
      result.push(group[0]);
      continue;
    }

    // Greedy continuity sort within this date group
    const remaining = [...group];
    while (remaining.length > 0) {
      let nextIdx = -1;
      if (lastTo !== null) {
        nextIdx = remaining.findIndex((item) => normalize(item.fromLocation) === lastTo);
      }
      if (nextIdx === -1) nextIdx = 0; // no continuity match — keep original order
      const picked = remaining.splice(nextIdx, 1)[0];
      lastTo = normalize(picked.toLocation);
      result.push(picked);
    }
  }

  return result;
}
