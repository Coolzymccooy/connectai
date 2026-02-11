const getTermiiConfig = () => {
  return {
    apiKey: process.env.TERMII_API_KEY || '',
    baseUrl: process.env.TERMII_BASE_URL || '',
    whatsappEndpoint: process.env.TERMII_WHATSAPP_ENDPOINT || '',
    senderId: process.env.TERMII_SENDER_ID || '',
    channel: process.env.TERMII_CHANNEL || 'whatsapp',
  };
};

export const sendWhatsAppMessage = async ({ to, message, channel }) => {
  const { apiKey, baseUrl, whatsappEndpoint, senderId, channel: defaultChannel } = getTermiiConfig();
  if (!apiKey || !baseUrl || !whatsappEndpoint) {
    throw new Error('Termii config missing');
  }
  const url = `${baseUrl.replace(/\/$/, '')}/${whatsappEndpoint.replace(/^\//, '')}`;
  const payload = {
    api_key: apiKey,
    to,
    from: senderId,
    sms: message,
    type: 'plain',
    channel: channel || defaultChannel,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Termii request failed (${res.status})`);
  }
  return res.json();
};
