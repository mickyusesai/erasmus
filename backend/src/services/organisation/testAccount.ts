/**
 * The onboarding test account: one organisation that super-admin can open as "just signed up",
 * again and again. Every start deletes the previous test account with everything in it and
 * creates a fresh one through the same code as a real sign-up, so what you see is exactly
 * what a new organisation sees.
 *
 * Only organisations marked isTestAccount are ever deleted here.
 */
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type { Organisation } from '@prisma/client';
import prisma from '../../utils/prisma.js';
import { getStorageService } from '../storage/index.js';
import { ConflictError, ValidationError } from '../../middleware/errorHandler.js';
import { createNewOrganisation } from './signup.js';

export const TEST_ACCOUNT_NAME = 'Onboarding Test Organisation';
export const TEST_ACCOUNT_MAX_CREDITS = 5;

/** micky@example.org → micky+onboarding-test@example.org: lands in the same inbox at most mail providers */
export function suggestedTestAccountEmail(adminEmail: string): string {
  const at = adminEmail.lastIndexOf('@');
  if (at <= 0) return adminEmail;
  const local = adminEmail.slice(0, at).split('+')[0];
  return `${local}+onboarding-test${adminEmail.slice(at)}`.toLowerCase();
}

export async function findTestAccount() {
  return prisma.organisation.findFirst({
    where: { isTestAccount: true },
    orderBy: { createdAt: 'desc' },
    include: { projects: { select: { id: true, name: true, _count: { select: { participants: true } } } } },
  });
}

/** Every file a participant of this organisation has in storage */
async function storedFilesOf(organisationId: string): Promise<string[]> {
  const ofOrg = { project: { organisationId } };
  const [documents, photos, posts, travelDeclarations, greenDeclarations, messages] = await Promise.all([
    prisma.document.findMany({ where: { participant: ofOrg }, select: { storedFilePath: true } }),
    prisma.disseminationPhoto.findMany({ where: { disseminationActivity: ofOrg }, select: { storedFilePath: true } }),
    prisma.socialMediaPost.findMany({ where: { participant: ofOrg }, select: { storedFilePath: true } }),
    prisma.declarationOfTravel.findMany({ where: { participant: ofOrg }, select: { generatedPdfPath: true } }),
    prisma.greenTravelDeclaration.findMany({ where: { participant: ofOrg }, select: { generatedPdfPath: true } }),
    prisma.participantMessage.findMany({ where: { participant: ofOrg, attachments: { not: null } }, select: { attachments: true } }),
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

/** Deletes a test account with all its projects, participants and files. Refuses any other organisation. */
async function deleteTestAccount(organisationId: string): Promise<void> {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!organisation) return;
  if (!organisation.isTestAccount) {
    throw new Error(`Refusing to delete organisation ${organisationId}: it is not the onboarding test account`);
  }

  const storage = getStorageService();
  for (const path of await storedFilesOf(organisationId)) {
    await storage.delete(path).catch((err) => console.error(`[Test account] Could not delete file ${path}:`, err));
  }

  await prisma.$transaction([
    // Activities point at the participant who created them without a cascade, so they go first
    prisma.disseminationActivity.deleteMany({ where: { project: { organisationId } } }),
    prisma.organisation.deleteMany({ where: { id: organisationId, isTestAccount: true } }),
  ]);
}

export interface StartTestAccount {
  /** Where the test organisation's emails go (welcome, notifications) */
  email: string;
  /** Project credits to start with: 0 is what a real new organisation has */
  credits?: number;
}

/** Deletes the previous test account and returns a fresh one, as if it signed up this moment */
export async function startTestAccount({ email, credits = 0 }: StartTestAccount): Promise<Organisation> {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new ValidationError('Please enter a valid email address for the test account');
  }
  if (!Number.isInteger(credits) || credits < 0 || credits > TEST_ACCOUNT_MAX_CREDITS) {
    throw new ValidationError(`Credits must be between 0 and ${TEST_ACCOUNT_MAX_CREDITS}`);
  }

  const taken = await prisma.organisation.findUnique({ where: { email: address } });
  if (taken && !taken.isTestAccount) {
    throw new ConflictError(
      'That email address belongs to a real organisation account. Use another one, for example with "+onboarding-test" before the @.'
    );
  }

  const previous = await prisma.organisation.findMany({ where: { isTestAccount: true }, select: { id: true } });
  for (const { id } of previous) await deleteTestAccount(id);

  // Opened from super-admin only: nobody can sign in to it with a password
  const passwordHash = await bcrypt.hash(uuidv4(), 12);
  return prisma.$transaction((tx) =>
    createNewOrganisation(tx, {
      name: TEST_ACCOUNT_NAME,
      email: address,
      passwordHash,
      isTestAccount: true,
      projectCredits: credits,
    })
  );
}
