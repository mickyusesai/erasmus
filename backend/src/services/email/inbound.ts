/**
 * Participants' email replies arrive at reply+<code>@<INBOUND_EMAIL_DOMAIN> (Postmark inbound).
 * Each reply is stored with its attachments (handleInboundEmail, before Postmark gets its answer),
 * then summarised by AI with suggested next steps and forwarded to the organisation with a link
 * to the participant's page (summariseAndForward). Attachments are only added to the
 * participant's documents when the organiser clicks "Add to documents".
 */
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../utils/prisma.js';
import { getStorageService } from '../storage/index.js';
import { getEmailService } from './index.js';
import { organisationReplyAddress } from './context.js';
import * as templates from './templates.js';
import { summariseParticipantReply } from '../ai/participantAssistant.js';

export interface PostmarkInboundAttachment {
  Name: string;
  Content: string;
  ContentType: string;
  ContentLength?: number;
  ContentID?: string;
}

export interface PostmarkInbound {
  MessageID?: string;
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  To?: string;
  ToFull?: { Email?: string; MailboxHash?: string }[];
  CcFull?: { Email?: string; MailboxHash?: string }[];
  OriginalRecipient?: string;
  MailboxHash?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Attachments?: PostmarkInboundAttachment[];
}

export interface StoredAttachment {
  name: string;
  contentType: string;
  size: number;
  storedPath: string;
  documentId: string | null;
}

/** Files an organiser can add to the documents (same types as participant uploads) */
export const ADDABLE_TYPES = /^(application\/pdf|image\/(jpeg|jpg|png|webp))$/i;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const REPLY_CODE = /^[a-f0-9]{20}$/i;

export function replyCodeFrom(msg: PostmarkInbound): string | null {
  const hashes = [msg.MailboxHash, ...(msg.ToFull ?? []).map((t) => t.MailboxHash), ...(msg.CcFull ?? []).map((t) => t.MailboxHash)];
  for (const h of hashes) if (h && REPLY_CODE.test(h)) return h.toLowerCase();
  const addresses = [msg.OriginalRecipient, msg.To, ...(msg.ToFull ?? []).map((t) => t.Email), ...(msg.CcFull ?? []).map((t) => t.Email)]
    .filter(Boolean)
    .join(' ');
  const m = addresses.match(/reply\+([a-f0-9]{20})@/i);
  return m ? m[1].toLowerCase() : null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The reply itself, without the quoted earlier emails when Postmark could strip them */
export function replyText(msg: PostmarkInbound): string {
  const text = msg.StrippedTextReply?.trim() || msg.TextBody?.trim() || (msg.HtmlBody ? htmlToText(msg.HtmlBody) : '');
  return text.slice(0, 20000) || '(empty message)';
}

export async function handleInboundEmail(msg: PostmarkInbound): Promise<{ status: string; messageId?: string }> {
  const fromEmail = (msg.FromFull?.Email || msg.From || '').trim();
  const fromName = (msg.FromFull?.Name || msg.FromName || '').trim() || null;
  const externalId = msg.MessageID?.trim() || null;
  if (externalId) {
    // Postmark sends a webhook again when our answer was slow or failed
    const existing = await prisma.participantMessage.findUnique({ where: { externalId }, select: { id: true } });
    if (existing) return { status: 'duplicate', messageId: existing.id };
  }
  const code = replyCodeFrom(msg);
  const participant = code
    ? await prisma.participant.findUnique({ where: { replyCode: code }, select: { id: true, email: true } })
    : null;
  const text = replyText(msg);

  if (!participant) {
    // Not one of our reply addresses: hand it to the fallback mailbox if there is one
    const fallback = process.env.INBOUND_FALLBACK_EMAIL?.trim();
    if (fallback) {
      await getEmailService().send({
        to: fallback,
        subject: `[Inbound, no participant] ${msg.Subject || '(no subject)'}`,
        text: `From: ${fromName || ''} <${fromEmail}>\nTo: ${msg.OriginalRecipient || msg.To || ''}\n\n${text}`,
        replyTo: fromEmail || undefined,
      });
    }
    console.warn(`[Inbound] No participant for ${msg.OriginalRecipient || msg.To}; ${fallback ? 'forwarded to fallback' : 'dropped'}`);
    return { status: 'unknown-recipient' };
  }

  // Keep document-like attachments; skip logos and signatures embedded in the email
  const storage = getStorageService();
  const attachments: StoredAttachment[] = [];
  const skipped: string[] = [];
  for (const a of msg.Attachments ?? []) {
    const buffer = Buffer.from(a.Content || '', 'base64');
    if (a.ContentID && buffer.length < 30_000) continue;
    if (!ADDABLE_TYPES.test(a.ContentType) || buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
      skipped.push(a.Name);
      continue;
    }
    const storedPath = `participants/${participant.id}/inbox/${uuidv4()}${path.extname(a.Name || '').toLowerCase()}`;
    await storage.store({ buffer, originalname: a.Name, mimetype: a.ContentType, size: buffer.length }, storedPath);
    attachments.push({ name: a.Name, contentType: a.ContentType, size: buffer.length, storedPath, documentId: null });
  }

  try {
    const message = await prisma.participantMessage.create({
      data: {
        participantId: participant.id,
        fromEmail: fromEmail || participant.email,
        fromName,
        subject: msg.Subject?.slice(0, 500) || null,
        textBody: skipped.length ? `${text}\n\n[Not saved: ${skipped.join(', ')}]` : text,
        attachments: JSON.stringify(attachments),
        externalId,
      },
    });
    return { status: 'stored', messageId: message.id };
  } catch (err) {
    // The same webhook arriving twice at the same moment
    if ((err as { code?: string }).code === 'P2002') return { status: 'duplicate' };
    throw err;
  }
}

/**
 * AI summary with suggested steps, then the forward to the organisation (or the fallback
 * mailbox). Runs after Postmark has its answer; the email is forwarded even when the AI fails.
 */
export async function summariseAndForward(messageId: string): Promise<void> {
  const message = await prisma.participantMessage.findUnique({
    where: { id: messageId },
    include: { participant: { include: { project: true } } },
  });
  if (!message || message.forwardedAt) return;
  const { participant } = message;
  const attachmentNames = (JSON.parse(message.attachments || '[]') as StoredAttachment[]).map((a) => a.name);

  let summary: Awaited<ReturnType<typeof summariseParticipantReply>> = null;
  try {
    summary = await summariseParticipantReply(participant.id, {
      subject: message.subject,
      text: message.textBody,
      attachmentNames,
    });
    if (summary) {
      await prisma.participantMessage.update({
        where: { id: message.id },
        data: { aiSummary: summary.summary, aiSuggestions: JSON.stringify(summary.suggestedActions) },
      });
    }
  } catch (err) {
    console.warn('[Inbound] AI summary failed:', err instanceof Error ? err.message : err);
  }

  const org = await organisationReplyAddress(participant.project);
  const to = org.email || process.env.INBOUND_FALLBACK_EMAIL?.trim();
  if (!to) return;
  const participantName = `${participant.firstName} ${participant.lastName}`.trim();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const forward: templates.ForwardedReply = {
    participantName,
    participantEmail: message.fromEmail,
    projectName: participant.project.name,
    subject: message.subject,
    text: message.textBody,
    summary: summary?.summary ?? null,
    suggestedActions: summary?.suggestedActions.map((a) => a.text) ?? [],
    attachmentNames,
    dashboardUrl: `${frontendUrl}/org/participants/${participant.id}`,
  };
  const result = await getEmailService().send({
    to,
    subject: templates.participantReplySubject(forward),
    text: templates.participantReplyText(forward),
    html: templates.participantReplyHtml(forward),
    fromName: `${participantName} via EasyReimburse`,
    replyTo: forward.participantEmail,
  });
  if (result.success) {
    await prisma.participantMessage.update({ where: { id: message.id }, data: { forwardedTo: to, forwardedAt: new Date() } });
  }
}
