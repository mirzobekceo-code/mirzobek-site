// Vercel serverless funksiya: formadagi arizani Telegramga yuboradi
// va Meta Conversions API orqali Lead eventini server tomondan jo'natadi.
//
// Vercel > Project > Settings > Environment Variables:
//   TG_BOT_TOKEN       - @BotFather bergan token
//   TG_CHAT_ID         - arizalar keladigan chat ID (o'zingizning ID)
//   META_PIXEL_ID      - Pixel ID
//   META_ACCESS_TOKEN  - Events Manager > Settings > Conversions API > Generate access token
//   META_TEST_CODE     - (ixtiyoriy) Test Events kodi, sinovdan keyin o'chiring

const crypto = require('crypto');
const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const b = req.body || {};
  const name = String(b.name || '').slice(0, 100);
  let phone = String(b.phone || '').replace(/\D/g, '');
  if (!name || phone.length < 9) return res.status(400).json({ ok: false });
  if (phone.length === 9) phone = '998' + phone;

  // 1) Telegramga xabar
  const text = [
    'Yangi ariza (sayt)',
    '',
    'Ism: ' + name,
    'Telefon: +' + phone,
    'Biznes: ' + (b.business || '-'),
    'Xizmat: ' + (b.service || '-'),
    'Byudjet: ' + (b.budget || '-'),
    '',
    'Kampaniya: ' + (b.utm_campaign || '-'),
    'Reklama: ' + (b.utm_content || '-'),
  ].join('\n');

  let tgOk = false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TG_CHAT_ID, text }),
    });
    tgOk = r.ok;
  } catch (e) {}

  // 2) Meta Conversions API (sozlangan bo'lsa)
  if (process.env.META_PIXEL_ID && process.env.META_ACCESS_TOKEN) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const user_data = {
      ph: [sha256(phone)],
      fn: [sha256(name.split(' ')[0])],
      country: [sha256('uz')],
      client_ip_address: ip || undefined,
      client_user_agent: req.headers['user-agent'],
      fbp: b.fbp || undefined,
      fbc: b.fbc || undefined,
    };
    const payload = {
      data: [{
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: b.event_id,
        action_source: 'website',
        event_source_url: b.page,
        user_data,
        custom_data: { content_name: b.service, content_category: 'targetolog_xizmati' },
      }],
    };
    if (process.env.META_TEST_CODE) payload.test_event_code = process.env.META_TEST_CODE;
    try {
      await fetch(`https://graph.facebook.com/v21.0/${process.env.META_PIXEL_ID}/events?access_token=${process.env.META_ACCESS_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {}
  }

  if (!tgOk) return res.status(502).json({ ok: false });
  return res.status(200).json({ ok: true });
};
