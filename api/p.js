// Public portal preview — /p/:id
//
// Renders a static, SSR-style HTML page for a single capsule with full
// OG/Twitter meta tags. This is the unit of virality: when a user shares
// a portal, the recipient lands here (it previews nicely on WhatsApp /
// iMessage / X / LinkedIn), then CTAs into the PWA.
//
// Strategy:
//   - Reads with the anon key via PostgREST (respects RLS).
//   - Caches at the edge for 60s — portals are mostly write-once, so
//     stale previews are fine.
//   - If the capsule is locked or moderated-out, we still render a
//     tasteful landing (no 404 shame on a shared link) and invite the
//     user to explore other portals.
//
// Required env vars (already present for the client build):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function renderPage({ title, description, imageUrl, rarityLabel, rarityColor, locked, bodySnippet, shareUrl, ctaHref }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(imageUrl || 'https://xportl.com/og-image.png');
  const rl = escapeHtml(rarityLabel || '');
  const rc = escapeHtml(rarityColor || '#00f0ff');
  const snippet = escapeHtml(bodySnippet || '');
  const su = escapeHtml(shareUrl);
  const cta = escapeHtml(ctaHref);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t} · XPortl</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${su}">

<meta property="og:site_name" content="XPortl">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${su}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">

<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Geist:wght@400;600;700&display=swap">

<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:#06061a;color:#e8e8f0;font-family:Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:24px}
  .wrap{width:100%;max-width:560px}
  .card{position:relative;padding:32px;border-radius:20px;background:linear-gradient(180deg,#0c0c1c 0%,#06061a 100%);border:1px solid rgba(255,255,255,.06);box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .tag{display:inline-flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;font-size:.62rem;font-weight:700;letter-spacing:.18em;text-transform:uppercase;border:1px solid ${rc}44;color:${rc};background:${rc}0d}
  .body{font-family:'Instrument Serif',serif;font-size:1.9rem;line-height:1.25;margin:18px 0 8px;color:#fff}
  .lock{margin-top:10px;padding:10px 14px;border-radius:10px;background:rgba(180,74,255,.08);border:1px solid rgba(180,74,255,.2);color:#cba6ff;font-size:.78rem}
  .meta{margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.06);font-size:.62rem;color:rgba(255,255,255,.35);letter-spacing:.14em;text-transform:uppercase}
  .cta{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}
  .btn{flex:1;min-width:170px;text-align:center;padding:13px 18px;border-radius:12px;font-weight:700;font-size:.78rem;text-decoration:none;letter-spacing:.04em}
  .btn.primary{background:#00e5ff;color:#050510}
  .btn.secondary{background:rgba(255,255,255,.04);color:#e8e8f0;border:1px solid rgba(255,255,255,.08)}
  h1{margin:0;font-family:'Instrument Serif',serif;font-size:1.25rem;font-weight:400;color:rgba(255,255,255,.65)}
  a{color:inherit}
  footer{margin-top:18px;text-align:center;font-size:.58rem;color:rgba(255,255,255,.3);letter-spacing:.16em;text-transform:uppercase}
</style>
</head>
<body>
<main class="wrap">
  <article class="card">
    ${rl ? `<span class="tag">${rl}</span>` : ''}
    <h1>${t}</h1>
    ${snippet ? `<p class="body">${snippet}</p>` : ''}
    ${locked ? '<div class="lock">🔒 Este portal ainda nao foi aberto. Chegue perto no horario marcado pra revelar.</div>' : ''}
    <div class="meta">XPortl · Portais de Realidade Aumentada</div>
    <div class="cta">
      <a class="btn primary" href="${cta}">Abrir no XPortl</a>
      <a class="btn secondary" href="https://xportl.com/">Explorar portais</a>
    </div>
  </article>
  <footer>Feito no Brasil · xportl.com</footer>
</main>
</body>
</html>`;
}

function fallbackPage({ shareUrl }) {
  return renderPage({
    title: 'Portal nao encontrado',
    description: 'Esse portal pode ter sido removido ou ainda nao existe. Explore outros rastros no XPortl.',
    imageUrl: 'https://xportl.com/og-image.png',
    rarityLabel: '',
    rarityColor: '#00f0ff',
    locked: false,
    bodySnippet: '',
    shareUrl,
    ctaHref: 'https://xportl.com/app',
  });
}

const RARITY_MAP = {
  common:    { label: 'Comum',    color: '#a0a0b0' },
  rare:      { label: 'Rara',     color: '#3b82f6' },
  legendary: { label: 'Lendaria', color: '#f59e0b' },
  mythic:    { label: 'Mitica',   color: '#ec4899' },
};

export default async function handler(req, res) {
  const host = req.headers.host || 'xportl.com';
  const rawId = (req.query?.id || '').toString();
  const id = rawId.trim();
  const shareUrl = `https://${host}/p/${encodeURIComponent(id)}`;

  // Always HTML — we never want browsers to fall back to JSON here.
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=600');

  if (!id || !isUuid(id)) {
    return res.status(200).send(fallbackPage({ shareUrl }));
  }

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return res.status(200).send(fallbackPage({ shareUrl }));
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/capsules?select=id,content,rarity,capsule_type,unlock_date,media_url,media_type,moderation_status&id=eq.${encodeURIComponent(id)}&limit=1`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        accept: 'application/json',
      },
    });

    if (!r.ok) return res.status(200).send(fallbackPage({ shareUrl }));

    const rows = await r.json();
    const cap = Array.isArray(rows) ? rows[0] : null;

    if (!cap) return res.status(200).send(fallbackPage({ shareUrl }));

    // Respect moderation: hide body, but still render a "this portal is
    // under review" landing so the shared link isn't a dead end.
    const hidden = cap.moderation_status && cap.moderation_status !== 'active';
    const locked = cap.unlock_date && new Date(cap.unlock_date) > new Date();

    const r2 = RARITY_MAP[cap.rarity] || RARITY_MAP.common;
    const body = cap.content?.body || cap.content?.emoji || '';
    const snippet = hidden ? '' : body.slice(0, 240);
    const title = hidden
      ? 'Portal em revisao'
      : (locked ? 'Portal lacrado · abre em breve' : (snippet ? snippet.slice(0, 70) : 'Portal descoberto'));
    const description = hidden
      ? 'Este portal esta em revisao pela moderacao.'
      : (locked
          ? 'Um rastro lacrado aguarda o momento certo. Abra o app e chegue perto para revelar.'
          : (snippet ? `"${snippet.slice(0, 140)}"` : 'Um portal de realidade aumentada no XPortl.'));

    // If the capsule has an image as media, use it as OG image (great preview).
    const imageUrl =
      !hidden && cap.media_type === 'image' && cap.media_url
        ? cap.media_url
        : 'https://xportl.com/og-image.png';

    const html = renderPage({
      title,
      description,
      imageUrl,
      rarityLabel: hidden ? '' : r2.label,
      rarityColor: r2.color,
      locked,
      bodySnippet: hidden ? '' : snippet,
      shareUrl,
      ctaHref: `https://${host}/app?capsule=${encodeURIComponent(id)}`,
    });

    return res.status(200).send(html);
  } catch (_err) {
    return res.status(200).send(fallbackPage({ shareUrl }));
  }
}
