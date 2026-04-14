import { supabase } from './supabase';

// ── Banned words (pt-BR) — comprehensive ──
const BANNED_PATTERNS = [
  // Threats & violence
  /\b(vou\s+te\s+matar|vou\s+te\s+pegar|vou\s+te\s+achar|bomba|explosivo|ameaça\s+de\s+morte|vou\s+te\s+esfaquear|vou\s+te\s+atirar)\b/i,
  // Racial slurs
  /\b(macac[oa]|neguinh[oa]|crioul[oa]|preto\s+imundo|brancel[oa]|chimpanze)\b/i,
  // Homophobic slurs
  /\b(viado|viad[oa]|bicha|bichona|sapatao|traveco|boiola)\b/i,
  // Heavy insults / harassment
  /\b(filh[oa]\s+da\s+puta|fdp|arrombad[oa]|desgraçad[oa]|corno\s+manso|vagabund[oa]|piranho|prostitut[oa]|lixo\s+humano|aborto\s+ambulante)\b/i,
  // Sexual harassment
  /\b(vou\s+te\s+comer|vou\s+te\s+estuprar|gostosa\s+do\s+caralho|manda\s+nudes|quer\s+transar)\b/i,
  // Panic/terrorism
  /\b(atentado|terroris[tm]a|sequestro|tiroteio\s+aqui|alerta\s+de\s+bomba|jihad|vou\s+explodir)\b/i,
  // Suicide/self-harm instigation
  /\b(vai\s+se\s+matar|se\s+mata|suicid[ae]|deveria\s+morrer)\b/i,
];

// ── PII detection (anti-doxxing) ──
const PII_PATTERNS = [
  { name: 'CPF', regex: /\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}/ },
  { name: 'Telefone', regex: /\(?\d{2}\)?[\s.-]?\d{4,5}[-.]?\d{4}/ },
  { name: 'Email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  { name: 'RG', regex: /\d{2}\.?\d{3}\.?\d{3}[-.]?\d{1,2}/ },
];

/**
 * Validate content before capsule creation.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export function validateContent(text) {
  if (!text || typeof text !== 'string') return { allowed: true };

  // Check banned words
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      return { allowed: false, reason: 'Conteudo proibido detectado. Sua mensagem viola os termos de uso.' };
    }
  }

  // Check PII (anti-doxxing)
  for (const { name, regex } of PII_PATTERNS) {
    if (regex.test(text)) {
      return { allowed: false, reason: `Dados pessoais detectados (${name}). Remova antes de enviar.` };
    }
  }

  return { allowed: true };
}

/**
 * Check rate limit for an action.
 * Returns { allowed: true } or { allowed: false, retryAfter: string }
 */
export async function checkRateLimit(userId, action) {
  const limits = {
    create_capsule: { max: 10, windowMin: 60 },
    create_ping: { max: 20, windowMin: 60 },
    report: { max: 15, windowMin: 60 },
    upload_media: { max: 5, windowMin: 60 },
  };

  const limit = limits[action];
  if (!limit) return { allowed: true };

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_action: action,
    p_max_count: limit.max,
    p_window_minutes: limit.windowMin,
  });

  if (error) {
    console.warn('[XPortl] Rate limit check failed, allowing:', error.message);
    return { allowed: true }; // fail-open for UX, but log
  }

  if (!data) {
    return { allowed: false, retryAfter: `Limite atingido (${limit.max}/${limit.windowMin}min). Tente novamente em breve.` };
  }

  return { allowed: true };
}

/**
 * Check if coordinates are in a restricted zone.
 * Returns null if OK, or { zone_name, zone_type } if restricted.
 */
export async function checkRestrictedZone(lat, lng) {
  const { data, error } = await supabase.rpc('is_restricted_zone', {
    check_lat: lat,
    check_lng: lng,
  });

  if (error) {
    console.warn('[XPortl] Geofence check failed:', error.message);
    return null; // fail-open
  }

  if (data && data.length > 0) return data[0];
  return null;
}

/**
 * Submit a report/denuncia
 */
export async function submitReport({ reporterId, targetType, targetId, reason, description }) {
  // Insert report
  const { error: reportError } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reason,
      description: description || null,
    });

  if (reportError) throw reportError;

  // Trigger auto-moderation on the capsule
  if (targetType === 'capsule') {
    const { data: result } = await supabase.rpc('handle_capsule_report', {
      capsule_id: targetId,
    });
    return { action: result || 'flagged' };
  }

  return { action: 'flagged' };
}

/**
 * Log an access event (Marco Civil Art. 15)
 */
export async function logAccess({ userId, action, targetId, lat, lng, metadata }) {
  await supabase.from('access_logs').insert({
    user_id: userId,
    action,
    target_id: targetId,
    ip_address: null, // Captured server-side via Supabase Edge Function headers
    user_agent: navigator.userAgent,
    lat,
    lng,
    metadata: metadata || {},
  });
}

/**
 * Check minor restrictions (ECA)
 */
export function getMinorRestrictions(profile) {
  if (!profile?.is_minor) return null;
  return {
    noMedia: true,         // Cannot upload photos/audio
    noGhost: true,         // Cannot create ghost capsules
    dailyLimit: 5,         // Max 5 capsules per day
    message: 'Conta de menor: funcoes limitadas para sua protecao (ECA).',
  };
}
