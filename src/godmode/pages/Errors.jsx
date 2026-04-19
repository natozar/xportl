import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabase';

// ── Build metadata (defined in vite.config.js) ──
const APP_COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev';
const APP_REPO   = typeof __APP_REPO__   !== 'undefined' ? __APP_REPO__   : 'natozar/xportl';

// ── Stack frame parser ──
// Pulls the first app-owned source location from a stack trace. Skips
// node_modules, vendor chunks, browser internals.
function extractTopFrame(stack) {
  if (!stack) return null;
  const lines = stack.split('\n');
  const re = /\(?(https?:\/\/[^)]+|\/[^\s)]+|[A-Za-z]:[\\/][^\s)]+)[\s)]?/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes('node_modules')) continue;
    if (line.includes('/@react-refresh')) continue;
    const m = line.match(re);
    if (!m) continue;
    const loc = m[1];
    // Normalize https URL → path (strip origin)
    const path = loc.replace(/^https?:\/\/[^/]+/, '');
    // Only show src/ or root files — vendor/chunk URLs are noise
    if (!path.includes('/src/') && !/\/[A-Za-z_-]+\.(jsx?|tsx?|mjs)/.test(path)) continue;
    const locMatch = path.match(/(.+?):(\d+):(\d+)?/);
    if (locMatch) {
      return { file: locMatch[1], line: Number(locMatch[2]), col: Number(locMatch[3] || 0) };
    }
    return { file: path, line: 0, col: 0 };
  }
  return null;
}

// ── Error signature (for grouping) ──
function errorSignature(err) {
  const name = err.error_name || 'Unknown';
  const frame = extractTopFrame(err.error_stack);
  const loc = frame ? `${frame.file}:${frame.line}` : (err.url || 'no-loc');
  // Collapse trailing numbers in messages (ids, timestamps) so similar errors group
  const msgCore = (err.error_message || '')
    .replace(/[a-f0-9-]{8,}/gi, '_ID_')
    .replace(/\d{5,}/g, '_N_')
    .slice(0, 120);
  return `${name}::${loc}::${msgCore}`;
}

// ── Source file link (GitHub) ──
function githubLink(frame) {
  if (!frame) return null;
  // Normalize /src/... paths; strip query/hash
  let path = frame.file.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = '/' + path;
  // If path has /src/ anywhere (Vite dev server serves absolute paths), trim to that
  const srcIdx = path.indexOf('/src/');
  if (srcIdx >= 0) path = path.slice(srcIdx);
  const sha = APP_COMMIT === 'dev' ? 'main' : APP_COMMIT;
  return `https://github.com/${APP_REPO}/blob/${sha}${path}#L${frame.line || 1}`;
}

// ── AI Fix Suggestion Engine ──
// Maps error patterns to actionable Claude Code prompts with full context.
function generateFixSuggestion(error) {
  const msg = (error.error_message || '').toLowerCase();
  const meta = error.metadata || {};
  const frame = extractTopFrame(error.error_stack);
  const fileRef = frame ? `${frame.file}:${frame.line}` : '(stack indisponivel)';
  const gh = githubLink(frame);

  const ctxLines = [
    `Commit: ${APP_COMMIT}`,
    `Arquivo provavel: ${fileRef}`,
    gh ? `GitHub: ${gh}` : null,
    error.url ? `URL onde ocorreu: ${error.url}` : null,
    error.user_agent ? `UA: ${error.user_agent.slice(0, 80)}` : null,
    Object.keys(meta).length ? `Metadata: ${JSON.stringify(meta)}` : null,
  ].filter(Boolean).join('\n');

  // RLS / Permission errors
  if (msg.includes('rls') || msg.includes('policy') || (msg.includes('permission')) || msg.includes('42501')) {
    return {
      category: 'RLS',
      diagnosis: 'RLS (Row Level Security) bloqueou a operacao. A policy de INSERT ou SELECT nao permite esta acao para o role atual.',
      prompt: `[BUG FIX · RLS] Erro de Row-Level-Security no Supabase.

Erro: "${error.error_message}"
${ctxLines}

Acao: verifique as RLS policies da tabela envolvida (provavelmente capsules). Confirme se o usuario autenticado tem INSERT+SELECT na visibility_layer "${meta.visibility_layer || 'public'}". Se o INSERT passa mas o SELECT nao, a policy de SELECT precisa incluir auth.uid() = created_by. Reporte o diff SQL sugerido e, se aplicavel, qualquer ajuste no client que precise tratar PGRST116.`,
      severity: 'high',
    };
  }

  // Bucket not found
  if (msg.includes('bucket') || (msg.includes('not found') && msg.includes('storage'))) {
    return {
      category: 'STORAGE',
      diagnosis: 'O bucket de storage "capsule-media" nao existe ou as policies de upload nao estao configuradas.',
      prompt: `[BUG FIX · STORAGE] Bucket "capsule-media" nao encontrado ou sem policy.

Erro: "${error.error_message}"
${ctxLines}

Acao: crie o bucket "capsule-media" como publico com limite de 10MB e adicione policies INSERT/SELECT/DELETE para bucket_id='capsule-media'. Reporte o SQL de criacao de bucket + policies.`,
      severity: 'high',
    };
  }

  // NOT NULL violation
  if (msg.includes('not-null') || msg.includes('23502') || msg.includes('null value')) {
    return {
      category: 'NOT_NULL',
      diagnosis: 'Um campo obrigatorio (NOT NULL) foi enviado como null. Verifique o payload do INSERT.',
      prompt: `[BUG FIX · NOT NULL] Violacao de coluna NOT NULL.

Erro: "${error.error_message}"
${ctxLines}

Acao: identifique qual coluna nao pode ser null (provavelmente lat, lng, ou content). Adicione guard client-side em ${fileRef} que bloqueie o INSERT com mensagem clara ao usuario se faltar GPS/conteudo. Reporte o diff do guard + mensagem.`,
      severity: 'high',
    };
  }

  // Constraint violation
  if (msg.includes('check') || msg.includes('23514') || msg.includes('constraint')) {
    return {
      category: 'CHECK',
      diagnosis: 'Um CHECK constraint falhou — provavelmente media_type, visibility_layer ou moderation_status com valor invalido.',
      prompt: `[BUG FIX · CHECK] CHECK constraint violation.

Erro: "${error.error_message}"
${ctxLines}

Acao: valide que media_type esta em {'image','audio','video',null} e visibility_layer em {'public','ghost','private'}. Adicione enum/validacao client-side em ${fileRef}. Reporte o diff.`,
      severity: 'medium',
    };
  }

  // Network / timeout
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('failed to fetch')) {
    return {
      category: 'NETWORK',
      diagnosis: 'Erro de rede — o dispositivo perdeu conexao durante a operacao.',
      prompt: `[UX FIX · NETWORK] Erro de rede.

Erro: "${error.error_message}"
${ctxLines}

Acao: envolva a chamada em ${fileRef} com retry exponential-backoff (3 tentativas, 500ms/1500ms/4500ms). Se offline apos retries, enfileire em localStorage e sincronize quando navigator.onLine voltar. Reporte o diff.`,
      severity: 'low',
    };
  }

  // PGRST116 (no rows returned)
  if (msg.includes('pgrst116') || msg.includes('no rows')) {
    return {
      category: 'PGRST116',
      diagnosis: 'O INSERT funcionou mas o SELECT retornou 0 rows. O RLS de SELECT nao permite ler a row recem-inserida.',
      prompt: `[BUG FIX · PGRST116] INSERT ok, SELECT bloqueado por RLS.

Erro: "${error.error_message}"
${ctxLines}

Acao: em ${fileRef}, remover .select().single() do encadeamento ou ajustar a RLS de SELECT para permitir o proprio autor (auth.uid() = created_by). Reporte os dois caminhos e escolha o menos arriscado.`,
      severity: 'high',
    };
  }

  // Geofence
  if (msg.includes('restricted zone') || msg.includes('geofence') || msg.includes('blocked')) {
    return {
      category: 'GEOFENCE',
      diagnosis: 'O trigger de geofence bloqueou a criacao. O usuario esta em uma zona restrita.',
      prompt: `[INFO · GEOFENCE] Geofence bloqueou criacao — funcionou como esperado.

${ctxLines}

Nao e um bug. Se quiser, marque como "ignorado" no GodMode.`,
      severity: 'info',
    };
  }

  // Rate limit
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
    return {
      category: 'RATE_LIMIT',
      diagnosis: 'Rate limit atingido — usuario excedeu o limite de acoes por hora.',
      prompt: `[INFO · RATE LIMIT] Rate limit funcionou corretamente.

${ctxLines}

Se o limite esta muito baixo, ajuste em feature_flags > rate_limits. Caso contrario, ignore.`,
      severity: 'info',
    };
  }

  // ReferenceError — broken global / undefined var (THE bug I just fixed)
  if (msg.includes('is not defined') || msg.includes('referenceerror')) {
    return {
      category: 'REF_ERROR',
      diagnosis: 'Uma variavel global/funcao nao existe no ambiente (browser/ESM). Provavel uso de require() em ESM ou global do Node.',
      prompt: `[BUG FIX · ReferenceError] Simbolo indefinido em ${fileRef}.

Erro: "${error.error_message}"
${ctxLines}

Acao: abra ${fileRef}, localize o simbolo indefinido. Se for require(), substitua por import() dinamico. Se for global Node (process, Buffer), troque por equivalente browser. Reporte o diff.`,
      severity: 'high',
    };
  }

  // TypeError — null/undefined access
  if (msg.includes('cannot read') || msg.includes('undefined') || msg.includes('null') || msg.includes('typeerror')) {
    return {
      category: 'TYPE_ERROR',
      diagnosis: 'Leitura de propriedade em null/undefined. Falta guard ou optional chaining antes do acesso.',
      prompt: `[BUG FIX · TypeError] Acesso a null/undefined em ${fileRef}.

Erro: "${error.error_message}"
${ctxLines}

Acao: em ${fileRef}, adicione optional chaining (?.) ou guard explicito antes do acesso que falhou. Se o estado pode legitimamente ser vazio, retorne um fallback UI. Reporte o diff minimo.`,
      severity: 'medium',
    };
  }

  // Generic
  return {
    category: 'UNKNOWN',
    diagnosis: 'Erro nao mapeado. Analise o stack trace e metadata para mais contexto.',
    prompt: `[BUG FIX · ?] Erro nao classificado.

Erro: ${error.error_name} — "${error.error_message}"
${ctxLines}

Acao: investigue ${fileRef} e o stack trace completo. Identifique causa raiz e proponha correcao minima. Reporte diagnostico + diff.`,
    severity: 'medium',
  };
}

// ── Mega-prompt builder for batch fix ──
function buildMegaPrompt(groups) {
  if (!groups.length) return '';
  const head = `[BATCH BUG FIX · ${groups.length} bug${groups.length > 1 ? 's' : ''} agrupado${groups.length > 1 ? 's' : ''}]

Commit rodando: ${APP_COMMIT}
Repo: ${APP_REPO}

Corrija os bugs abaixo em ordem de severidade. Para cada bug, reporte: (1) causa raiz, (2) arquivo e linhas alteradas, (3) diff aplicado. Ao final, rode lint + build e comite.

`;
  const body = groups.map((g, i) => {
    const fix = generateFixSuggestion(g.sample);
    const frame = extractTopFrame(g.sample.error_stack);
    const fileRef = frame ? `${frame.file}:${frame.line}` : '(stack indisponivel)';
    return `═══ ${i + 1}/${groups.length} · ${fix.category} · ${g.count} ocorrencia${g.count > 1 ? 's' : ''} · ${g.users} user${g.users !== 1 ? 's' : ''} afetado${g.users !== 1 ? 's' : ''} ═══

Erro: ${g.sample.error_name} — "${g.sample.error_message}"
Local: ${fileRef}
Severidade: ${fix.severity.toUpperCase()}

Diagnostico: ${fix.diagnosis}

Acao: ${fix.prompt.split('\n').slice(-3).join(' ').replace(/\s+/g, ' ').trim()}
`;
  }).join('\n');
  return head + body;
}

export default function Errors() {
  const [errors, setErrors] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, unresolved: 0, critical: 0, usersAffected: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [view, setView] = useState('grouped'); // 'grouped' | 'raw'

  const fetchErrors = useCallback(async () => {
    setLoading(true);

    let query = supabase.from('error_events').select('*').order('captured_at', { ascending: false }).limit(500);
    if (filter === 'unresolved') query = query.is('resolved_at', null);
    if (filter === 'critical') query = query.eq('severity', 'critical');

    const { data } = await query;
    setErrors(data || []);

    const [{ count: total }, { count: unresolved }, { count: critical }, { data: affectedRaw }] = await Promise.all([
      supabase.from('error_events').select('*', { count: 'exact', head: true }),
      supabase.from('error_events').select('*', { count: 'exact', head: true }).is('resolved_at', null),
      supabase.from('error_events').select('*', { count: 'exact', head: true }).eq('severity', 'critical'),
      supabase.from('error_events').select('user_id').is('resolved_at', null).not('user_id', 'is', null),
    ]);
    setStats({
      total: total || 0,
      unresolved: unresolved || 0,
      critical: critical || 0,
      usersAffected: new Set((affectedRaw || []).map((e) => e.user_id)).size,
    });
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchErrors(); }, [fetchErrors]);

  // ── Group errors by signature ──
  const groups = useMemo(() => {
    if (!errors) return [];
    const map = new Map();
    for (const e of errors) {
      const sig = errorSignature(e);
      const existing = map.get(sig);
      if (existing) {
        existing.count += 1;
        existing.users.add(e.user_id || 'anon');
        if (!e.resolved_at) existing.openCount += 1;
        if (new Date(e.captured_at) > new Date(existing.lastSeen)) {
          existing.lastSeen = e.captured_at;
          existing.sample = e; // freshest sample is most useful
        }
        if (new Date(e.captured_at) < new Date(existing.firstSeen)) {
          existing.firstSeen = e.captured_at;
        }
      } else {
        map.set(sig, {
          sig,
          sample: e,
          count: 1,
          openCount: e.resolved_at ? 0 : 1,
          users: new Set([e.user_id || 'anon']),
          firstSeen: e.captured_at,
          lastSeen: e.captured_at,
        });
      }
    }
    return Array.from(map.values())
      .map((g) => ({ ...g, users: g.users.size }))
      .sort((a, b) => {
        // Open > resolved, then by count desc
        if ((a.openCount > 0) !== (b.openCount > 0)) return a.openCount > 0 ? -1 : 1;
        return b.count - a.count;
      });
  }, [errors]);

  const openGroups = useMemo(() => groups.filter((g) => g.openCount > 0), [groups]);
  const megaPrompt = useMemo(() => buildMegaPrompt(openGroups), [openGroups]);

  const resolveError = async (id, type) => {
    await supabase.from('error_events').update({
      resolved_at: new Date().toISOString(),
      resolved_by: 'admin',
      resolution_type: type,
    }).eq('id', id);
    fetchErrors();
  };

  const resolveGroup = async (sig, type) => {
    // Resolve every unresolved error sharing this signature
    const ids = (errors || []).filter((e) => !e.resolved_at && errorSignature(e) === sig).map((e) => e.id);
    if (!ids.length) return;
    await supabase.from('error_events').update({
      resolved_at: new Date().toISOString(),
      resolved_by: 'admin',
      resolution_type: type,
    }).in('id', ids);
    fetchErrors();
  };

  const copyPrompt = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div>
      <h1 style={st.h1}>error events <span style={st.commitTag}>· {APP_COMMIT}</span></h1>

      {/* Stats */}
      <div style={st.statsBar}>
        <Stat num={stats.total} label="total" color="#c8c8e0" />
        <Stat num={stats.unresolved} label="abertos" color={stats.unresolved > 0 ? '#ffaa00' : '#00e5ff'} />
        <Stat num={stats.critical} label="criticos" color={stats.critical > 0 ? '#ff4466' : '#00e5ff'} />
        <Stat num={stats.usersAffected} label="users afetados" color={stats.usersAffected > 0 ? '#ff8844' : '#00e5ff'} />
        <Stat num={openGroups.length} label="bugs unicos abertos" color={openGroups.length > 0 ? '#00e5ff' : '#55556a'} />
      </div>

      {/* Mega-prompt bar */}
      {openGroups.length > 0 && (
        <div style={st.megaBar}>
          <div style={st.megaLeft}>
            <span style={st.megaIcon}>⚡</span>
            <div>
              <div style={st.megaTitle}>Auto-fix batch · {openGroups.length} bug{openGroups.length > 1 ? 's' : ''} unico{openGroups.length > 1 ? 's' : ''}</div>
              <div style={st.megaSub}>Copia um unico prompt com todos os bugs agrupados — cola no Claude Code e ele corrige em lote.</div>
            </div>
          </div>
          <button
            style={st.megaBtn}
            onClick={() => copyPrompt(megaPrompt, 'MEGA')}
          >
            {copiedId === 'MEGA' ? '✓ Copiado!' : `Copiar prompt batch (${openGroups.length})`}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={st.filters}>
        {[['all', 'Todos'], ['unresolved', 'Abertos'], ['critical', 'Criticos']].map(([f, label]) => (
          <button key={f} style={{ ...st.filterBtn, ...(filter === f ? st.filterActive : {}) }} onClick={() => setFilter(f)}>{label}</button>
        ))}
        <div style={st.viewToggle}>
          <button
            style={{ ...st.viewBtn, ...(view === 'grouped' ? st.viewActive : {}) }}
            onClick={() => setView('grouped')}
          >Agrupado</button>
          <button
            style={{ ...st.viewBtn, ...(view === 'raw' ? st.viewActive : {}) }}
            onClick={() => setView('raw')}
          >Raw</button>
        </div>
        <button style={st.refreshBtn} onClick={fetchErrors}>{loading ? '...' : 'Atualizar'}</button>
      </div>

      {/* Empty state */}
      {errors && errors.length === 0 && <div style={st.empty}>Nenhum erro neste filtro.</div>}

      {/* Grouped view */}
      {view === 'grouped' && groups.map((g) => {
        const e = g.sample;
        const fix = generateFixSuggestion(e);
        const expanded = expandedId === g.sig;
        const meta = e.metadata || {};
        const frame = extractTopFrame(e.error_stack);
        const gh = githubLink(frame);

        return (
          <div key={g.sig} style={{ ...st.card, borderLeftColor: e.severity === 'critical' ? '#ff4466' : e.severity === 'error' ? '#ff8844' : '#ffaa00', opacity: g.openCount === 0 ? 0.55 : 1 }}>
            <div style={st.cardHead} onClick={() => setExpandedId(expanded ? null : g.sig)}>
              <span style={st.groupCount}>×{g.count}</span>
              <span style={{ ...st.badge, color: e.severity === 'critical' ? '#ff4466' : '#ff8844' }}>
                {fix.category}
              </span>
              <span style={st.errorTitle}>{e.error_name || 'Unknown'}</span>
              <span style={st.usersTag}>{g.users} user{g.users !== 1 ? 's' : ''}</span>
              <span style={st.time}>{g.lastSeen ? new Date(g.lastSeen).toLocaleString('pt-BR') : '---'}</span>
              {g.openCount === 0 && <span style={st.resolvedBadge}>RESOLVIDO</span>}
              <span style={st.chevron}>{expanded ? '▲' : '▼'}</span>
            </div>

            <div style={st.msg}>{e.error_message || '(sem mensagem)'}</div>

            {expanded && (
              <div style={st.details}>
                {/* AI Diagnosis */}
                <div style={st.aiBox}>
                  <div style={st.aiHeader}>
                    <span style={st.aiIcon}>🤖</span>
                    <span style={st.aiTitle}>DIAGNOSTICO IA</span>
                    <span style={{ ...st.aiBadge, background: fix.severity === 'high' ? 'rgba(255,68,102,0.15)' : fix.severity === 'info' ? 'rgba(0,229,255,0.15)' : 'rgba(255,170,0,0.15)', color: fix.severity === 'high' ? '#ff4466' : fix.severity === 'info' ? '#00e5ff' : '#ffaa00' }}>
                      {fix.severity === 'high' ? 'URGENTE' : fix.severity === 'info' ? 'INFO' : 'MEDIO'}
                    </span>
                  </div>
                  <p style={st.aiDiagnosis}>{fix.diagnosis}</p>

                  <div style={st.promptBox}>
                    <div style={st.promptHeader}>
                      <span style={st.promptLabel}>PROMPT PARA CLAUDE CODE</span>
                      <button style={st.copyBtn} onClick={() => copyPrompt(fix.prompt, g.sig)}>
                        {copiedId === g.sig ? '✓ Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <pre style={st.promptText}>{fix.prompt}</pre>
                  </div>
                </div>

                {/* Context */}
                <div style={st.ctx}>
                  <CtxItem label="Assinatura" value={g.sig.slice(0, 50) + (g.sig.length > 50 ? '…' : '')} />
                  <CtxItem label="First seen" value={g.firstSeen ? new Date(g.firstSeen).toLocaleString('pt-BR') : '---'} />
                  <CtxItem label="Source" value={e.source || '---'} />
                  {frame && <CtxItem label="Frame" value={`${frame.file.split('/').slice(-2).join('/')}:${frame.line}`} />}
                  {gh && <CtxItem label="GitHub" value={<a href={gh} target="_blank" rel="noreferrer" style={st.ghLink}>abrir ↗</a>} />}
                  <CtxItem label="Device" value={e.user_agent?.slice(0, 42) || '---'} />
                  {meta.lat && <CtxItem label="GPS" value={`${meta.lat?.toFixed(4)}, ${meta.lng?.toFixed(4)}`} />}
                  {meta.visibility_layer && <CtxItem label="Layer" value={meta.visibility_layer} />}
                  {meta.error_code && <CtxItem label="PG Code" value={meta.error_code} />}
                </div>

                {e.error_stack && (
                  <details style={st.stackWrap}>
                    <summary style={st.stackToggle}>Stack trace</summary>
                    <pre style={st.stackCode}>{e.error_stack}</pre>
                  </details>
                )}

                {g.openCount > 0 && (
                  <div style={st.actions}>
                    <button style={{ ...st.actionBtn, ...st.actionFix }} onClick={() => resolveGroup(g.sig, 'manual-fix')}>Resolver grupo ({g.openCount})</button>
                    <button style={st.actionBtn} onClick={() => resolveGroup(g.sig, 'ignored')}>Ignorar grupo</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Raw (legacy) view — one card per individual event */}
      {view === 'raw' && errors && errors.map((e) => {
        const fix = generateFixSuggestion(e);
        const expanded = expandedId === e.id;
        return (
          <div key={e.id} style={{ ...st.card, borderLeftColor: e.severity === 'critical' ? '#ff4466' : e.severity === 'error' ? '#ff8844' : '#ffaa00' }}>
            <div style={st.cardHead} onClick={() => setExpandedId(expanded ? null : e.id)}>
              <span style={{ ...st.badge, color: e.severity === 'critical' ? '#ff4466' : '#ff8844' }}>{fix.category}</span>
              <span style={st.errorTitle}>{e.error_name || 'Unknown'}</span>
              <span style={st.time}>{e.captured_at ? new Date(e.captured_at).toLocaleString('pt-BR') : '---'}</span>
              {e.resolved_at && <span style={st.resolvedBadge}>RESOLVIDO</span>}
              <span style={st.chevron}>{expanded ? '▲' : '▼'}</span>
            </div>
            <div style={st.msg}>{e.error_message || '(sem mensagem)'}</div>
            {expanded && (
              <div style={st.details}>
                <div style={st.aiBox}>
                  <div style={st.promptBox}>
                    <div style={st.promptHeader}>
                      <span style={st.promptLabel}>PROMPT PARA CLAUDE CODE</span>
                      <button style={st.copyBtn} onClick={() => copyPrompt(fix.prompt, e.id)}>
                        {copiedId === e.id ? '✓ Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <pre style={st.promptText}>{fix.prompt}</pre>
                  </div>
                </div>
                {!e.resolved_at && (
                  <div style={st.actions}>
                    <button style={{ ...st.actionBtn, ...st.actionFix }} onClick={() => resolveError(e.id, 'manual-fix')}>Resolvido</button>
                    <button style={st.actionBtn} onClick={() => resolveError(e.id, 'ignored')}>Ignorar</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ num, label, color }) {
  return (
    <div style={st.stat}>
      <span style={{ ...st.statNum, color }}>{num}</span>
      <span style={st.statLabel}>{label}</span>
    </div>
  );
}

function CtxItem({ label, value }) {
  return (
    <div style={st.ctxRow}>
      <span style={st.ctxLabel}>{label}</span>
      <span style={st.ctxValue}>{value}</span>
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 20, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  commitTag: { fontSize: '0.6rem', color: '#55556a', letterSpacing: '0.1em', fontWeight: 400 },

  statsBar: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  stat: { padding: '12px 18px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8, minWidth: 100 },
  statNum: { display: 'block', fontSize: '1.5rem', fontWeight: 700 },
  statLabel: { fontSize: '0.5rem', color: '#55556a', letterSpacing: '0.15em', textTransform: 'uppercase' },

  // Mega-prompt bar
  megaBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    padding: '14px 18px', marginBottom: 16,
    background: 'linear-gradient(90deg, rgba(0,229,255,0.08), rgba(167,123,255,0.08))',
    border: '1px solid rgba(0,229,255,0.2)', borderRadius: 10,
  },
  megaLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  megaIcon: { fontSize: '1.4rem' },
  megaTitle: { fontSize: '0.8rem', fontWeight: 600, color: '#e8e8f0', letterSpacing: '0.02em' },
  megaSub: { fontSize: '0.62rem', color: '#8888a0', lineHeight: 1.5, marginTop: 2 },
  megaBtn: {
    padding: '10px 18px', background: '#00e5ff', border: 'none', borderRadius: 8,
    color: '#050510', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    boxShadow: '0 4px 18px rgba(0,229,255,0.25)',
  },

  filters: { display: 'flex', gap: 6, marginBottom: 18, alignItems: 'center' },
  filterBtn: { padding: '7px 14px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 6, color: '#8888a0', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit' },
  filterActive: { background: '#1a1a30', color: '#e8e8f0', borderColor: '#2a2a40' },
  viewToggle: { marginLeft: 12, display: 'flex', gap: 2, padding: 3, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 6 },
  viewBtn: { padding: '5px 11px', background: 'transparent', border: 'none', borderRadius: 4, color: '#55556a', fontSize: '0.62rem', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.05em' },
  viewActive: { background: '#1a1a30', color: '#00e5ff' },
  refreshBtn: { marginLeft: 'auto', padding: '7px 14px', background: 'transparent', border: '1px solid #1a1a30', borderRadius: 6, color: '#00e5ff', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit' },

  empty: { padding: 40, textAlign: 'center', color: '#55556a', background: '#0c0c1c', border: '1px dashed #1a1a30', borderRadius: 8 },

  card: { background: '#0c0c1c', border: '1px solid #1a1a30', borderLeft: '3px solid', borderRadius: 8, marginBottom: 8, overflow: 'hidden', transition: 'opacity 0.25s' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', cursor: 'pointer', userSelect: 'none' },
  groupCount: { fontSize: '0.66rem', fontWeight: 700, color: '#e8e8f0', background: '#1a1a30', padding: '3px 9px', borderRadius: 4, letterSpacing: '0.03em' },
  badge: { fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', padding: '3px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4 },
  errorTitle: { fontSize: '0.78rem', fontWeight: 600, color: '#e8e8f0', flex: 1 },
  usersTag: { fontSize: '0.58rem', color: '#8888a0', letterSpacing: '0.05em' },
  time: { fontSize: '0.58rem', color: '#55556a' },
  resolvedBadge: { fontSize: '0.48rem', fontWeight: 700, color: '#00e5ff', background: 'rgba(0,229,255,0.1)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.1em' },
  chevron: { color: '#55556a', fontSize: '0.6rem' },
  msg: { padding: '0 14px 10px', fontSize: '0.72rem', color: '#8888a0', lineHeight: 1.5, wordBreak: 'break-word' },

  details: { padding: '0 14px 14px' },

  aiBox: { padding: 14, background: '#08081a', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, marginBottom: 12 },
  aiHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiIcon: { fontSize: '1rem' },
  aiTitle: { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', color: '#00e5ff' },
  aiBadge: { fontSize: '0.48rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.1em' },
  aiDiagnosis: { fontSize: '0.72rem', color: '#c8c8e0', lineHeight: 1.6, marginBottom: 10 },

  promptBox: { background: '#05050f', border: '1px solid #1a1a30', borderRadius: 6, overflow: 'hidden' },
  promptHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #1a1a30' },
  promptLabel: { fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.2em', color: '#55556a' },
  copyBtn: { padding: '4px 10px', background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 4, color: '#00e5ff', fontSize: '0.58rem', cursor: 'pointer', fontFamily: 'inherit' },
  promptText: { padding: 10, fontSize: '0.62rem', color: '#aaaacc', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' },

  ctx: { display: 'flex', flexWrap: 'wrap', gap: '3px 14px', padding: '8px 0', borderTop: '1px solid #1a1a30', marginBottom: 8 },
  ctxRow: { display: 'flex', gap: 5 },
  ctxLabel: { fontSize: '0.52rem', color: '#55556a', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' },
  ctxValue: { fontSize: '0.58rem', color: '#8888a0', fontFamily: 'ui-monospace, monospace' },
  ghLink: { color: '#00e5ff', textDecoration: 'none' },

  stackWrap: { marginBottom: 10 },
  stackToggle: { fontSize: '0.58rem', color: '#55556a', cursor: 'pointer', letterSpacing: '0.1em' },
  stackCode: { fontSize: '0.55rem', color: '#666680', background: '#05050f', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 120, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' },

  actions: { display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid #1a1a30' },
  actionBtn: { padding: '6px 12px', background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 4, color: '#c8c8e0', fontSize: '0.58rem', cursor: 'pointer', fontFamily: 'inherit' },
  actionFix: { background: 'rgba(0,229,255,0.08)', borderColor: 'rgba(0,229,255,0.2)', color: '#00e5ff' },
};
