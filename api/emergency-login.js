// EMERGENCY ADMIN LOGIN — generates a one-click magic-link URL for an
// admin account, bypassing the normal login UI. Uses the Supabase
// service_role key, so it MUST be protected by a shared secret.
//
// Flow:
//   GET  /api/emergency-login          → small HTML form
//   POST /api/emergency-login          → { email, secret } → { action_link }
//
// Required env vars (set in Vercel dashboard):
//   VITE_SUPABASE_URL               – already set for the client build
//   SUPABASE_SERVICE_ROLE_KEY       – from Supabase Dashboard > Project Settings > API
//   EMERGENCY_LOGIN_SECRET          – random string you choose, acts as the gate
//
// Security:
//   - The endpoint is a no-op (401) unless SECRET header/body matches.
//   - Email must belong to an ACTIVE row in admin_users (double check).
//   - The generated link is single-use and expires in ~1h (Supabase default).
//   - Remove EMERGENCY_LOGIN_SECRET from Vercel env to disable the endpoint
//     without redeploying.

const FORM_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XPortl · emergency login</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#06061a;color:#e8e8f0;font-family:ui-monospace,Menlo,monospace;padding:24px}
  .card{width:100%;max-width:420px;padding:28px;background:#0c0c1c;border:1px solid #1a1a30;border-radius:12px}
  h1{margin:0 0 4px;font-size:.9rem;letter-spacing:.2em;text-transform:uppercase;color:#ff4466}
  .sub{color:#8888a0;font-size:.68rem;line-height:1.6;margin-bottom:20px}
  label{display:block;font-size:.55rem;letter-spacing:.2em;text-transform:uppercase;color:#55556a;margin:12px 0 6px}
  input{width:100%;padding:10px 12px;background:#050510;border:1px solid #1a1a30;border-radius:6px;color:#e8e8f0;font-family:inherit;font-size:.78rem;box-sizing:border-box}
  button{margin-top:18px;width:100%;padding:11px;background:#ff4466;color:#0a0a14;border:0;border-radius:6px;font-family:inherit;font-weight:700;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
  button:disabled{opacity:.5;cursor:wait}
  .out{margin-top:16px;padding:12px;background:#05050f;border:1px solid #1a1a30;border-radius:6px;font-size:.64rem;line-height:1.6;word-break:break-all;color:#9FE870}
  .err{color:#ff8888;border-color:rgba(255,68,102,.3)}
  a.go{display:block;margin-top:10px;padding:10px;background:#00e5ff;color:#050510;text-align:center;text-decoration:none;border-radius:6px;font-weight:700;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase}
</style></head><body>
<div class="card">
<h1>emergency login</h1>
<p class="sub">Gera um magic-link 1-clique pro admin. Use apenas em emergência.</p>
<form id="f">
  <label for="email">admin email</label>
  <input id="email" type="email" required autocomplete="email" />
  <label for="secret">emergency secret</label>
  <input id="secret" type="password" required autocomplete="current-password" />
  <button type="submit" id="b">Gerar link</button>
</form>
<div id="out"></div>
</div>
<script>
const f=document.getElementById('f'),b=document.getElementById('b'),out=document.getElementById('out');
f.addEventListener('submit',async(e)=>{
  e.preventDefault();b.disabled=true;b.textContent='Gerando...';out.innerHTML='';
  try{
    const r=await fetch('/api/emergency-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value.trim(),secret:document.getElementById('secret').value})});
    const j=await r.json();
    if(!r.ok){throw new Error(j.error||('HTTP '+r.status))}
    out.innerHTML='<div class="out">Link gerado. Clique pra logar neste device:</div><a class="go" href="'+j.action_link+'">Entrar →</a>';
  }catch(err){
    out.innerHTML='<div class="out err">'+String(err.message||err)+'</div>';
  }finally{b.disabled=false;b.textContent='Gerar link';}
});
</script>
</body></html>`;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return res.status(200).send(FORM_HTML);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secretEnv = process.env.EMERGENCY_LOGIN_SECRET;

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'server_misconfigured', message: 'Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL' });
  }
  if (!secretEnv) {
    // Hard-disable the endpoint if no secret is set.
    return res.status(503).json({ error: 'endpoint_disabled', message: 'EMERGENCY_LOGIN_SECRET not set — endpoint disabled.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { email, secret } = body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'missing_email' });
  }
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ error: 'missing_secret' });
  }

  // Constant-time-ish comparison (not critical — Vercel doesn't expose timing meaningfully)
  if (secret.length !== secretEnv.length || secret !== secretEnv) {
    return res.status(401).json({ error: 'invalid_secret' });
  }

  const authHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'content-type': 'application/json',
  };

  try {
    // 1) Find user by email (admin API)
    const lookup = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
      headers: authHeaders,
    });
    if (!lookup.ok) {
      const t = await lookup.text().catch(() => '');
      return res.status(502).json({ error: 'lookup_failed', status: lookup.status, detail: t.slice(0, 300) });
    }
    const lookupJson = await lookup.json();
    const user = Array.isArray(lookupJson?.users) ? lookupJson.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) : null;
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    // 2) Verify user is an active admin (defense in depth — so even with a leaked
    //    secret, only real admins can get in)
    const adminCheck = await fetch(`${supabaseUrl}/rest/v1/admin_users?user_id=eq.${user.id}&is_active=eq.true&select=role`, {
      headers: authHeaders,
    });
    if (!adminCheck.ok) {
      const t = await adminCheck.text().catch(() => '');
      return res.status(502).json({ error: 'admin_check_failed', status: adminCheck.status, detail: t.slice(0, 300) });
    }
    const adminRows = await adminCheck.json();
    if (!Array.isArray(adminRows) || adminRows.length === 0) {
      return res.status(403).json({ error: 'not_admin', message: 'Email não é um admin ativo.' });
    }

    // 3) Generate magic link (one-click login URL). Supabase returns action_link
    //    in the response. We pass a redirect_to so the link lands on /godmode.
    const origin = `https://${req.headers.host || 'xportl.com'}`;
    const gen = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        type: 'magiclink',
        email,
        options: { redirect_to: `${origin}/godmode` },
      }),
    });
    if (!gen.ok) {
      const t = await gen.text().catch(() => '');
      return res.status(502).json({ error: 'generate_link_failed', status: gen.status, detail: t.slice(0, 300) });
    }
    const genJson = await gen.json();
    const actionLink = genJson?.action_link || genJson?.properties?.action_link;
    if (!actionLink) {
      return res.status(502).json({ error: 'no_action_link', raw: JSON.stringify(genJson).slice(0, 300) });
    }

    return res.status(200).json({ action_link: actionLink });
  } catch (err) {
    return res.status(500).json({ error: 'fetch_failed', message: String(err?.message || err) });
  }
}
