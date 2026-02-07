const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{6,}\d)/g;

export const maskPhone = (value = '') => {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 4) return value;
  const tail = digits.slice(-4);
  return `****${tail}`;
};

export const maskEmail = (value = '') => {
  const str = String(value);
  const [user, domain] = str.split('@');
  if (!user || !domain) return value;
  const head = user.slice(0, 1);
  return `${head}***@${domain}`;
};

export const redactText = (text = '') => {
  return String(text)
    .replace(EMAIL_REGEX, (match) => maskEmail(match))
    .replace(PHONE_REGEX, (match) => maskPhone(match));
};

export const redactTranscript = (segments = []) => {
  return segments.map((seg) => ({
    ...seg,
    text: redactText(seg.text),
  }));
};

export const computeExpiresAt = (startTime, retentionDays) => {
  const days = Number(retentionDays || 0);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return startTime + days * 24 * 60 * 60 * 1000;
};

export const sanitizeCallForStorage = (call, compliance = {}) => {
  const anonymize = Boolean(compliance.anonymizePii);
  const retentionDays = compliance.retentionDays;
  const safeCall = { ...call };

  if (anonymize) {
    safeCall.phoneNumber = maskPhone(call.phoneNumber);
    safeCall.transcript = redactTranscript(call.transcript || []);
    safeCall.piiRedacted = true;
  }

  const expiresAt = computeExpiresAt(call.startTime, retentionDays);
  if (expiresAt) {
    safeCall.expiresAt = expiresAt;
  }

  return safeCall;
};
