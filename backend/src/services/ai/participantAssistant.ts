/**
 * AI help for organisers around a participant: summarising an email the participant
 * sent (with suggested next steps), and drafting a message to the participant from the
 * open AI review findings. Suggestions only; nothing is changed automatically.
 */
import { askClaudeJson } from './claudeJson.js';
import { loadParticipantForAi, describeParticipantForAi } from './participantContext.js';

const ORGANISER_TOOLS = `What the organiser can do on the participant's page in EasyReimburse: edit a trip (amount, dates, route, purchase date, luggage), link a document to a trip, "Don't reimburse" a trip, delete a trip, upload a document, add a file the participant emailed to their documents ("Add to documents"), tick an AI review finding as checked, edit bank details, reopen the reimbursement with a message.`;

export interface ReplySummary {
  summary: string;
  needsAction: boolean;
  suggestedActions: { text: string; travelItemId: string | null }[];
}

export async function summariseParticipantReply(
  participantId: string,
  email: { subject: string | null; text: string; attachmentNames: string[] }
): Promise<ReplySummary | null> {
  const p = await loadParticipantForAi(participantId);
  if (!p) return null;

  const prompt = `You help an Erasmus+ organisation handle an email from a participant about their travel reimbursement in EasyReimburse. The organisation reads your summary above the original email, so be short, neutral and factual.

${describeParticipantForAi(p)}
${ORGANISER_TOOLS}

THE PARTICIPANT'S EMAIL
Subject: ${email.subject || '(none)'}
Attachments: ${email.attachmentNames.length ? email.attachmentNames.map((n) => `"${n}"`).join(', ') : 'none'}
---
${email.text.slice(0, 8000)}
---

Answer in English with JSON only:
{
  "summary": "1-2 sentences: what the participant says, asks or sent",
  "needsAction": true or false (does the organisation have to do something?),
  "suggestedActions": [
    { "text": "one concrete step for the organiser in EasyReimburse, max 25 words", "tripNumber": number from TRIPS or null }
  ]
}
Rules:
- At most 4 steps, none if nothing needs doing (e.g. a thank-you).
- Base everything on the email and the data above. Never invent documents, amounts or facts.
- If files are attached, suggest adding them to the documents (name the file and the trip it belongs to when clear).
- If the participant explains something or refuses to change it, suggest how the organiser can settle it in the app (for example accept it and tick the related finding, or use "Don't reimburse" on that trip).`;

  const answer = await askClaudeJson<{ summary?: string; needsAction?: boolean; suggestedActions?: { text?: string; tripNumber?: number | null }[] }>(
    'EMAIL',
    prompt,
    { maxTokens: 800, context: { participantId, projectId: p.projectId } }
  );
  const actions = (answer.suggestedActions ?? [])
    .filter((a) => typeof a.text === 'string' && a.text.trim())
    .slice(0, 4)
    .map((a) => ({
      text: a.text!.trim(),
      travelItemId:
        a.tripNumber != null && a.tripNumber >= 1 && a.tripNumber <= p.travelItems.length ? p.travelItems[a.tripNumber - 1].id : null,
    }));
  return {
    summary: (answer.summary || '').trim() || 'The participant sent a message.',
    needsAction: answer.needsAction !== false && actions.length > 0,
    suggestedActions: actions,
  };
}

/** A short, friendly message asking the participant to fix what is still open */
export async function draftMessageToParticipant(participantId: string): Promise<string> {
  const p = await loadParticipantForAi(participantId);
  if (!p) throw new Error('Participant not found');

  const prompt = `Write a short, friendly message from the organisation to an Erasmus+ participant whose travel reimbursement in EasyReimburse is being reopened, so they know exactly what to fix or upload.

${describeParticipantForAi(p)}

The message is placed inside an email that already says "Hello ${p.firstName}," and "Your reimbursement has been reopened", and ends with a link to their reimbursement page. So:
- Do not greet and do not sign; start with one friendly sentence, then the list.
- Only ask for things the OPEN AI REVIEW FINDINGS show are needed from the participant (missing documents, prices, boarding passes, explanations). Skip findings the organisation can settle alone (bank details are an exception: ask for them if missing).
- A numbered list, one short line per item, naming the trip (route and date) or the file it is about.
- Plain, warm English for someone who may not be a native speaker. No jargon like "finding" or "AI review".
- At most 6 items. If nothing is needed from the participant, say so in one sentence.

Answer with JSON only: { "message": "the message text, with \\n for line breaks" }`;

  const answer = await askClaudeJson<{ message?: string }>('MESSAGE', prompt, {
    maxTokens: 900,
    context: { participantId, projectId: p.projectId },
  });
  const message = (answer.message || '').trim();
  if (!message) throw new Error('The AI returned an empty message');
  return message;
}
