/**
 * Where an organisation's questions go, and who the first-days emails come from: Micky's own
 * inbox. Replies to the welcome email and the reminder arrive there too.
 */
export const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || 'micky@easyreimburse.ai').trim();
export const SUPPORT_SENDER_NAME = 'Micky from EasyReimburse';
