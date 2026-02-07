export const normalizePhone = (value = '') => String(value).replace(/\D/g, '');

export const buildInternalConversationId = (userId, teammateId) => {
  const parts = [String(userId), String(teammateId)].sort();
  return `int_${parts.join('_')}`;
};

export const buildExternalConversationId = (phone) => {
  const norm = normalizePhone(phone);
  return norm ? `ext_${norm}` : `ext_${Date.now()}`;
};
