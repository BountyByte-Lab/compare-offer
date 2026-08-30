// Perbandingan Tawaran Kerja — Cloudflare Worker
// Menerima webhook dari Lynk.id, generate kode unik, kirim email via Brevo
//
// SETUP (lakukan sekali):
// 1. Sign up Cloudflare (gratis): https://dash.cloudflare.com
// 2. Sign up Brevo (gratis, 300 email/hari): https://brevo.com
//    - Di Brevo: Senders & IP -> Senders -> Add a Sender (verifikasi email kamu)
//    - Di Brevo: SMTP & API -> API Keys -> Generate API Key
// 3. Install Wrangler CLI: npm install -g wrangler
// 4. Login: wrangler login
// 5. Deploy: wrangler deploy
// 6. Set secrets (jangan tulis di sini, gunakan perintah ini):
//    wrangler secret put SECRET          <- isi dengan nilai yang SAMA persis seperti di index.html dan code.html, BEDA dari secret Dwitku
//    wrangler secret put BREVO_API_KEY   <- dari dashboard Brevo (boleh sama dengan punya Dwitku)
// 7. Daftarkan URL worker ini sebagai webhook di Lynk.id dashboard, untuk produk INI saja
//    Format URL: https://tawaran-kerja-gate.bibleseedsforkids.workers.dev

// --- Konfigurasi -------------------------------------------------------------
// Ganti FROM_EMAIL dengan email yang sudah diverifikasi di Brevo, lalu deploy ulang
const FROM_EMAIL = 'situmeang.yoel@gmail.com'; // verifikasi email ini di Brevo -> Senders & IP -> Senders
const FROM_NAME  = 'Perbandingan Tawaran Kerja';
const APP_NAME   = 'Perbandingan Tawaran Kerja';

// --- Algoritma kode (harus identik dengan index.html dan code.html) ----------
function fnv32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h;
}

function toB36(n) {
  return n.toString(36).toUpperCase().padStart(4, '0').slice(-4);
}

function generateCode(orderId, secret) {
  const id    = toB36(fnv32(orderId));
  const check = toB36(fnv32(secret + id));
  return `${id}-${check}`;
}

// --- Worker --------------------------------------------------------------------
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    // Log raw payload agar bisa cek struktur dari Lynk.id
    console.log('Lynk.id payload:', JSON.stringify(payload));

    // Abaikan test event dari Lynk.id
    if (payload.event === 'test_event') {
      console.log('Test webhook received, ignored');
      return new Response('OK', { status: 200 });
    }

    const data       = payload.data ?? payload;
    const orderId    = data.order_id ?? data.id ?? data.transaction_id ?? data.invoice_id;
    const buyerEmail = data.buyer?.email ?? data.buyer_email ?? data.customer?.email ?? data.email;
    const buyerName  = data.buyer?.name  ?? data.buyer_name  ?? data.customer?.name  ?? data.name ?? 'Pembeli';

    if (!orderId || !buyerEmail) {
      console.error('Missing fields, check payload structure:', JSON.stringify(payload));
      return new Response('Missing required fields', { status: 400 });
    }

    const code = generateCode(String(orderId), env.SECRET);

    const emailSent = await sendEmail(env.BREVO_API_KEY, {
      to:   buyerEmail,
      name: buyerName,
      code,
    });

    if (!emailSent) {
      return new Response('Failed to send email', { status: 500 });
    }

    console.log(`Code sent to ${buyerEmail} for order ${orderId}`);
    return new Response('OK', { status: 200 });
  }
};

// --- Kirim email via Brevo ------------------------------------------------------
async function sendEmail(apiKey, { to, name, code }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key':      apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender:      { name: FROM_NAME, email: FROM_EMAIL },
      to:          [{ email: to, name }],
      subject:     `Kode Akses ${APP_NAME} Anda`,
      htmlContent: emailHtml(name, code),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Brevo error:', err);
  }
  return res.ok;
}

// --- Template email ---------------------------------------------------------------
function emailHtml(name, code) {
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#E4E8EA;font-family:system-ui,sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#F9FAFA;border:1px solid #C7CFD3;border-radius:6px;overflow:hidden;">

  <div style="background:#1B2430;padding:20px 28px;">
    <div style="color:#F4F6F7;font-size:20px;font-weight:600;letter-spacing:.02em;">${APP_NAME}</div>
  </div>

  <div style="padding:28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#1B2430;">Halo ${escHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#4A5560;line-height:1.6;">
      Terima kasih sudah membeli ${APP_NAME}! Berikut kode akses pribadi Anda:
    </p>

    <div style="background:#FFFFFF;border:1px solid #1B2430;border-radius:4px;padding:24px;text-align:center;margin-bottom:24px;">
      <div style="font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#55636F;margin-bottom:12px;">Kode Akses</div>
      <div style="font-size:34px;font-weight:700;letter-spacing:.14em;font-family:monospace;color:#1B2430;">${escHtml(code)}</div>
    </div>

    <p style="margin:0 0 8px;font-size:13px;color:#4A5560;line-height:1.6;">
      Masukkan kode ini saat membuka ${APP_NAME} untuk pertama kali.
      Kode ini <strong>unik untuk Anda</strong>, jaga kerahasiaannya.
    </p>
    <p style="margin:0;font-size:12px;color:#8A97A0;line-height:1.5;">
      Semua perhitungan ${APP_NAME} terjadi di perangkat Anda. Tidak ada data yang dikirim ke mana pun.
    </p>
  </div>

  <div style="padding:16px 28px;border-top:1px solid #C7CFD3;">
    <p style="margin:0;font-size:11px;color:#8A97A0;">${APP_NAME}</p>
  </div>
</div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}
