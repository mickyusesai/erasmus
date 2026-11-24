/**
 * Email addresses that can never receive mail: the domains and endings set aside for examples
 * and tests (RFC 2606 and RFC 6761). The made-up participants of the practice project have
 * such addresses, so no email can leave for them, whatever part of the app tries to send one.
 */
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
const RESERVED_ENDINGS = ['.example', '.invalid', '.test', '.localhost'];

export function canNeverReceiveMail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  if (!domain) return false;
  return (
    RESERVED_DOMAINS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`)) ||
    RESERVED_ENDINGS.some((ending) => domain.endsWith(ending) || `.${domain}` === ending)
  );
}
