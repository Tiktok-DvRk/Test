const DEFAULT_TEMPLATE_ID = 4;
const TIMEOUT_MS = 12000;

export function parseSender(raw) {
  const m = String(raw || '').match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  return m
    ? { name: (m[1] || '').trim() || 'Schutz App', email: m[2].trim() }
    : { name: 'Schutz App', email: String(raw || '').trim() };
}

export function getBrevoTemplateId() {
  const id = Number(process.env.BREVO_TEMPLATE_ID || DEFAULT_TEMPLATE_ID);
  return Number.isInteger(id) && id > 0 ? id : DEFAULT_TEMPLATE_ID;
}

export async function sendBrevoTemplate({ apiKey, sender, to, replyTo, subject, params, templateId }) {
  if (!apiKey) throw new Error('BREVO_API_KEY manquante');
  if (!to) throw new Error('Destinataire manquant');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const payload = {
      sender,
      to: [{ email: String(to).trim() }],
      templateId: templateId || getBrevoTemplateId(),
      params: params || {},
      ...(subject ? { subject } : {}),
      ...(replyTo ? { replyTo: { email: String(replyTo).trim() } } : {})
    };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Brevo API ${res.status}: ${data.message || data.code || 'erreur inconnue'}`);
    }
    return data;
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Brevo API : délai dépassé');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
