/**
 * The same person in another project of the same organisation (same email, or else the same
 * name) whose trips can't all have happened: trips on the same days in both files, or trips
 * in one file while the other project was running. Typical when someone goes from one project
 * to the next and claims both the trip home and the trip out to the next project.
 */
import prisma from '../../utils/prisma.js';

interface TripLike {
  departureDate: Date | null;
  arrivalDate: Date | null;
  fromLocation: string | null;
  toLocation: string | null;
  excludedFromReimbursement: boolean;
}

interface ProjectDates {
  startDate: Date;
  endDate: Date;
}

export interface TripComparison {
  /** Days with claimed trips in both files */
  sameDays: { date: string; here: string[]; there: string[] }[];
  /** Trips in this file while the other project was running (not its first or last day) */
  hereDuringOther: { date: string; trip: string }[];
  /** Trips in the other file while this project was running */
  thereDuringThis: { date: string; trip: string }[];
}

export interface OtherProjectOverlap extends TripComparison {
  participantId: string;
  projectId: string;
  projectName: string;
  projectStart: string;
  projectEnd: string;
  matchedBy: 'email' | 'name';
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const tripLabel = (t: TripLike) => `${(t.fromLocation || '?').trim()} → ${(t.toLocation || '?').trim()}`;

/** Claimed trips by day (departure and arrival day) */
function tripsByDay(trips: TripLike[]): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  for (const t of trips) {
    if (t.excludedFromReimbursement) continue;
    const days = new Set([t.departureDate, t.arrivalDate].filter((d): d is Date => !!d).map(isoDay));
    for (const day of days) byDay.set(day, [...(byDay.get(day) ?? []), tripLabel(t)]);
  }
  return byDay;
}

/** Trips on days strictly inside a project (travelling on its first or last day is normal) */
function duringProject(byDay: Map<string, string[]>, project: ProjectDates) {
  const start = isoDay(project.startDate);
  const end = isoDay(project.endDate);
  return [...byDay.entries()]
    .filter(([day]) => day > start && day < end)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, trips]) => trips.map((trip) => ({ date, trip })));
}

export function compareTrips(here: TripLike[], thisProject: ProjectDates, there: TripLike[], otherProject: ProjectDates): TripComparison {
  const hereDays = tripsByDay(here);
  const thereDays = tripsByDay(there);
  return {
    sameDays: [...hereDays.keys()]
      .filter((day) => thereDays.has(day))
      .sort()
      .map((date) => ({ date, here: hereDays.get(date)!, there: thereDays.get(date)! })),
    hereDuringOther: duringProject(hereDays, otherProject),
    thereDuringThis: duringProject(thereDays, thisProject),
  };
}

const tripSelect = { departureDate: true, arrivalDate: true, fromLocation: true, toLocation: true, excludedFromReimbursement: true } as const;
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function findOtherProjectOverlaps(participantId: string): Promise<OtherProjectOverlap[]> {
  const me = await prisma.participant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      projectId: true,
      project: { select: { organisationId: true, startDate: true, endDate: true } },
      travelItems: { select: tripSelect },
    },
  });
  if (!me || me.travelItems.length === 0) return [];

  const others = await prisma.participant.findMany({
    where: {
      id: { not: me.id },
      projectId: { not: me.projectId },
      project: { organisationId: me.project.organisationId },
      OR: [
        { email: { equals: me.email.trim(), mode: 'insensitive' } },
        {
          firstName: { equals: me.firstName.trim(), mode: 'insensitive' },
          lastName: { equals: me.lastName.trim(), mode: 'insensitive' },
        },
      ],
    },
    select: {
      id: true,
      email: true,
      project: { select: { id: true, name: true, startDate: true, endDate: true } },
      travelItems: { select: tripSelect },
    },
  });

  const overlaps: OtherProjectOverlap[] = [];
  for (const other of others) {
    const comparison = compareTrips(me.travelItems, me.project, other.travelItems, other.project);
    if (!comparison.sameDays.length && !comparison.hereDuringOther.length && !comparison.thereDuringThis.length) continue;
    overlaps.push({
      participantId: other.id,
      projectId: other.project.id,
      projectName: other.project.name,
      projectStart: isoDay(other.project.startDate),
      projectEnd: isoDay(other.project.endDate),
      matchedBy: sameText(other.email, me.email) ? 'email' : 'name',
      ...comparison,
    });
  }
  return overlaps;
}

/** The overlaps as text for the AI review */
export function otherProjectsForPrompt(overlaps: OtherProjectOverlap[]): string {
  return overlaps
    .map((o) => {
      const lines = [`"${o.projectName}" (${o.projectStart} to ${o.projectEnd}), same ${o.matchedBy}:`];
      for (const d of o.sameDays) lines.push(`- ${d.date}: trips in BOTH files. Here: ${d.here.join(', ')} | there: ${d.there.join(', ')}`);
      if (o.hereDuringOther.length) {
        lines.push(`- Trips HERE while that project was running: ${o.hereDuringOther.map((t) => `${t.date} ${t.trip}`).join('; ')}`);
      }
      if (o.thereDuringThis.length) {
        lines.push(`- Trips THERE while this project was running: ${o.thereDuringThis.map((t) => `${t.date} ${t.trip}`).join('; ')}`);
      }
      return lines.join('\n');
    })
    .join('\n');
}
