import { describe, it, expect } from 'vitest';
import { replyCodeFrom, replyText } from '../services/email/inbound.js';

const code = '0123456789abcdef0123';

describe('inbound email replies', () => {
  it('finds the participant code in the mailbox hash or the address', () => {
    expect(replyCodeFrom({ MailboxHash: code })).toBe(code);
    expect(replyCodeFrom({ ToFull: [{ Email: `reply+${code}@reply.easyreimburse.ai`, MailboxHash: code }] })).toBe(code);
    expect(replyCodeFrom({ OriginalRecipient: `Reply+${code.toUpperCase()}@reply.easyreimburse.ai` })).toBe(code);
    expect(replyCodeFrom({ To: 'info@easyreimburse.ai', MailboxHash: '' })).toBeNull();
  });

  it('uses the reply without the quoted history, and falls back to the HTML', () => {
    expect(replyText({ StrippedTextReply: 'Thanks, attached!', TextBody: 'Thanks, attached!\n> old email' })).toBe('Thanks, attached!');
    expect(replyText({ HtmlBody: '<p>Hello&nbsp;Marija</p><p>Bus ticket attached</p>' })).toBe('Hello Marija\nBus ticket attached');
    expect(replyText({})).toBe('(empty message)');
  });
});
