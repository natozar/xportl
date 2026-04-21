// Vercel serverless function (Node runtime).
//
// Accepts a POST with an error payload and returns an AI-generated diagnosis
// and a ready-to-paste Claude Code prompt. Used only from the godmode
// "Refinar com IA" button — opt-in so the API budget isn't spent on every
// error view.
//
// Env var required (set in Vercel dashboard):
//   ANTHROPIC_API_KEY

const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM = `You are a senior engineer embedded in the XPortl codebase.

XPortl stack:
- React 19 + Vite 6 PWA, multi-entry (/ LP, /app PWA, /godmode admin)
- Supabase (Postgres + PostGIS, Realtime, Storage, RLS)
- A-Frame + AR.js for AR capsules rendered at real GPS coords
- Deployed on Vercel with auto-deploy from main
- Styles are inline JSX objects, not Tailwind
- Supabase migrations are manual via Dashboard (no CLI)

Hard rules in this codebase:
- Capsules render ONLY at real GPS coords — never synthetic/screen positions
- AR camera uses videoTexture:false + native <video> — do not switch to WebGL texture
- 8s GPS retry window on publish (waitForGpsFix)
- Locked capsules excluded from "N portais" badge

Given an error event, output strict JSON (no prose outside JSON) with:
{
  "category": "RLS | STORAGE | NOT_NULL | CHECK | NETWORK | PGRST116 | GEOFENCE | RATE_LIMIT | REF_ERROR | TYPE_ERROR | CSP | GPS | AR_CAMERA | REALTIME | UNKNOWN",
  "severity": "high | medium | low | info",
  "diagnosis": "1–3 sentences in pt-BR explaining the root cause concretely.",
  "prompt": "A ready-to-paste Claude Code prompt in pt-BR that tells Claude exactly what to fix, which file/line to touch (use the frame provided), and the minimal diff to produce. Start the prompt with a [BUG FIX · CATEGORY] tag. Be surgical — no speculation, no refactors, no feature additions."
}

Be concise. The prompt must be self-contained: include the error message, file:line reference, relevant metadata, and the expected output (diff + which commands to run before commit).`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'missing_api_key', message: 'ANTHROPIC_API_KEY not set in Vercel env.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'bad_payload' });
  }

  const {
    error_name,
    error_message,
    error_stack,
    url,
    user_agent,
    metadata,
    source,
    severity,
    frame, // { file, line } if known
    commit,
  } = body;

  const userContent = [
    `Error name: ${error_name || 'Unknown'}`,
    `Error message: ${error_message || '(none)'}`,
    frame ? `Top app frame: ${frame.file}:${frame.line}` : null,
    source ? `Source: ${source}` : null,
    severity ? `Reported severity: ${severity}` : null,
    url ? `URL: ${url}` : null,
    user_agent ? `User agent: ${user_agent.slice(0, 160)}` : null,
    commit ? `App commit: ${commit}` : null,
    metadata && Object.keys(metadata).length ? `Metadata: ${safeJson(metadata)}` : null,
    error_stack ? `Stack (truncated):\n${error_stack.slice(0, 2000)}` : null,
  ].filter(Boolean).join('\n');

  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'upstream_error', status: upstream.status, detail: text.slice(0, 500) });
    }

    const data = await upstream.json();
    const text = data?.content?.[0]?.text || '';
    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(502).json({ error: 'unparseable_response', raw: text.slice(0, 500) });
    }

    // Minimal shape guard
    const out = {
      category: String(parsed.category || 'UNKNOWN'),
      severity: String(parsed.severity || 'medium'),
      diagnosis: String(parsed.diagnosis || ''),
      prompt: String(parsed.prompt || ''),
    };
    if (!out.diagnosis || !out.prompt) {
      return res.status(502).json({ error: 'incomplete_response', raw: text.slice(0, 500) });
    }
    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: 'fetch_failed', message: String(err?.message || err) });
  }
}

function safeJson(o) {
  try { return JSON.stringify(o).slice(0, 600); } catch { return '{}'; }
}

// The model is instructed to return strict JSON, but tolerate a fenced block.
function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  // Find the first { ... last } span
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { return null; }
}
