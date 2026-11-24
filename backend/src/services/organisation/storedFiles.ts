/**
 * Every file in storage that belongs to the participants of an organisation or of one
 * project, so they can be removed together with the rows that point at them.
 */
import prisma from '../../utils/prisma.js';

export type FilesOf = { organisationId: string } | { projectId: string };

export async function storedFilesOf(scope: FilesOf): Promise<string[]> {
  const ofParticipant = 'projectId' in scope ? { projectId: scope.projectId } : { project: { organisationId: scope.organisationId } };
  const ofActivity = 'projectId' in scope ? { projectId: scope.projectId } : { project: { organisationId: scope.organisationId } };
  const [documents, photos, posts, travelDeclarations, greenDeclarations, messages] = await Promise.all([
    prisma.document.findMany({ where: { participant: ofParticipant }, select: { storedFilePath: true } }),
    prisma.disseminationPhoto.findMany({ where: { disseminationActivity: ofActivity }, select: { storedFilePath: true } }),
    prisma.socialMediaPost.findMany({ where: { participant: ofParticipant }, select: { storedFilePath: true } }),
    prisma.declarationOfTravel.findMany({ where: { participant: ofParticipant }, select: { generatedPdfPath: true } }),
    prisma.greenTravelDeclaration.findMany({ where: { participant: ofParticipant }, select: { generatedPdfPath: true } }),
    prisma.participantMessage.findMany({ where: { participant: ofParticipant, attachments: { not: null } }, select: { attachments: true } }),
  ]);

  const paths = new Set<string>();
  const add = (p: string | null | undefined) => { if (p) paths.add(p); };
  documents.forEach((d) => add(d.storedFilePath));
  photos.forEach((p) => add(p.storedFilePath));
  posts.forEach((p) => add(p.storedFilePath));
  travelDeclarations.forEach((d) => add(d.generatedPdfPath));
  greenDeclarations.forEach((d) => add(d.generatedPdfPath));
  for (const m of messages) {
    try {
      for (const a of JSON.parse(m.attachments!) as { storedPath?: string }[]) add(a.storedPath);
    } catch {
      // not a list of attachments: nothing to delete
    }
  }
  return [...paths];
}
