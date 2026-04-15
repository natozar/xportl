import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

// ── AI Fix Suggestion Engine ──
// Maps error patterns to actionable Claude Code prompts
function generateFixSuggestion(error) {
  const msg = (error.error_message || '').toLowerCase();
  const name = (error.error_name || '').toLowerCase();
  const meta = error.metadata || {};

  // RLS / Permission errors
  if (msg.includes('rls') || msg.includes('policy') || msg.includes('permission') || msg.includes('42501')) {
    return {
      diagnosis: 'RLS (Row Level Security) bloqueou a operacao. A policy de INSERT ou SELECT nao permite esta acao para o role atual.',
      prompt: `[BUG FIX] Erro de RLS na tabela capsules. O INSERT ou SELECT esta sendo bloqueado pela policy. Verifique as RLS policies no Supabase para a tabela capsules — especificamente se o usuario autenticado tem permissao de INSERT + SELECT na visibility_layer "${meta.visibility_layer || 'public'}". Erro: "${error.error_message}"`,
      severity: 'high',
    };
  }

  // Bucket not found
  if (msg.includes('bucket') || msg.includes('not found') && msg.includes('storage')) {
    return {
      diagnosis: 'O bucket de storage "capsule-media" nao existe ou as policies de upload nao estao configuradas.',
      prompt: `[BUG FIX] O bucket "capsule-media" no Supabase Storage nao foi encontrado. Crie o bucket como publico com limite de 10MB e adicione policies de INSERT/SELECT/DELETE para bucket_id = 'capsule-media'.`,
      severity: 'high',
    };
  }

  // NOT NULL violation
  if (msg.includes('not-null') || msg.includes('23502') || msg.includes('null value')) {
    return {
      diagnosis: 'Um campo obrigatorio (NOT NULL) foi enviado como null. Verifique o payload do INSERT.',
      prompt: `[BUG FIX] Violacao NOT NULL ao criar capsula. O campo que falhou provavelmente e "lat", "lng" ou "content". Verifique se o GPS esta retornando coordenadas validas antes do INSERT. Metadata: ${JSON.stringify(meta)}`,
      severity: 'high',
    };
  }

  // Constraint violation
  if (msg.includes('check') || msg.includes('23514') || msg.includes('constraint')) {
    return {
      diagnosis: 'Um CHECK constraint falhou — provavelmente media_type, visibility_layer ou moderation_status com valor invalido.',
      prompt: `[BUG FIX] CHECK constraint violation na tabela capsules. Verifique se os valores de media_type (deve ser 'image'|'audio'|'video'|null) e visibility_layer (deve ser 'public'|'ghost'|'private') estao corretos no payload. Erro: "${error.error_message}"`,
      severity: 'medium',
    };
  }

  // Network / timeout
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('failed to fetch')) {
    return {
      diagnosis: 'Erro de rede — o dispositivo perdeu conexao durante a operacao.',
      prompt: `[UX FIX] Erro de rede ao criar capsula. Adicione retry automatico com exponential backoff no createCapsule(). Se offline, salve localmente e sincronize quando a conexao voltar (queue offline).`,
      severity: 'low',
    };
  }

  // PGRST116 (no rows returned)
  if (msg.includes('pgrst116') || msg.includes('no rows')) {
    return {
      diagnosis: 'O INSERT funcionou mas o SELECT retornou 0 rows. O RLS de SELECT nao permite ler a row recem-inserida.',
      prompt: `[BUG FIX] Erro PGRST116 apos INSERT em capsules. O .insert().select().single() faz INSERT + SELECT. O INSERT passa pelo RLS de INSERT mas o SELECT falha no RLS de SELECT. Solucao: remover .select().single() ou ajustar a policy de SELECT para incluir o proprio autor.`,
      severity: 'high',
    };
  }

  // Geofence
  if (msg.includes('restricted zone') || msg.includes('geofence') || msg.includes('blocked')) {
    return {
      diagnosis: 'O trigger de geofence bloqueou a criacao. O usuario esta em uma zona restrita.',
      prompt: `[INFO] Geofence trigger funcionou corretamente — bloqueou capsula em zona restrita. Nao e um bug. Coordenadas: ${meta.lat}, ${meta.lng}.`,
      severity: 'info',
    };
  }

  // Rate limit
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('too many')) {
    return {
      diagnosis: 'Rate limit atingido — usuario excedeu o limite de acoes por hora.',
      prompt: `[INFO] Rate limit funcionou corretamente. Se o limite esta muito baixo, ajuste em feature_flags > rate_limits.`,
      severity: 'info',
    };
  }

  // Generic
  return {
    diagnosis: 'Erro nao mapeado. Analise o stack trace e metadata para mais contexto.',
    prompt: `[BUG FIX] Erro desconhecido: "${error.error_name}" — "${error.error_message}". User: ${error.user_id?.slice(0, 8) || 'anon'}. URL: ${error.url || '?'}. Metadata: ${JSON.stringify(meta)}. Investigue o stack trace e corrija.`,
    severity: 'medium',
  };
}

export default function Errors() {
  const [errors, setErrors] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, unresolved: 0, critical: 0, usersAffected: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const fetchErrors = async () => {
    setLoading(true);

    let query = supabase.from('error_events').select('*').order('captured_at', { ascending: false }).limit(200);
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
  };

  useEffect(() => { fetchErrors(); }, [filter]);

  const resolveError = async (id, type) => {
    await supabase.from('error_events').update({
      resolved_at: new Date().toISOString(),
      resolved_by: 'admin',
      resolution_type: type,
    }).eq('id', id);
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
      <h1 style={st.h1}>error events</h1>

      {/* Stats */}
      <div style={st.statsBar}>
        <Stat num={stats.total} label="total" color="#c8c8e0" />
        <Stat num={stats.unresolved} label="abertos" color={stats.unresolved > 0 ? '#ffaa00' : '#00e5ff'} />
        <Stat num={stats.critical} label="criticos" color={stats.critical > 0 ? '#ff4466' : '#00e5ff'} />
        <Stat num={stats.usersAffected} label="users afetados" color={stats.usersAffected > 0 ? '#ff8844' : '#00e5ff'} />
      </div>

      {/* Filters */}
      <div style={st.filters}>
        {[['all', 'Todos'], ['unresolved', 'Abertos'], ['critical', 'Criticos']].map(([f, label]) => (
          <button key={f} style={{ ...st.filterBtn, ...(filter === f ? st.filterActive : {}) }} onClick={() => setFilter(f)}>{label}</button>
        ))}
        <button style={st.refreshBtn} onClick={fetchErrors}>{loading ? '...' : 'Atualizar'}</button>
      </div>

      {/* Error list */}
      {errors && errors.length === 0 && <div style={st.empty}>Nenhum erro neste filtro.</div>}

      {errors && errors.map((e) => {
        const fix = generateFixSuggestion(e);
        const expanded = expandedId === e.id;
        const meta = e.metadata || {};

        return (
          <div key={e.id} style={{ ...st.card, borderLeftColor: e.severity === 'critical' ? '#ff4466' : e.severity === 'error' ? '#ff8844' : '#ffaa00' }}>
            {/* Header */}
            <div style={st.cardHead} onClick={() => setExpandedId(expanded ? null : e.id)}>
              <span style={{ ...st.badge, color: e.severity === 'critical' ? '#ff4466' : '#ff8844' }}>
                {e.severity?.toUpperCase() || 'ERROR'}
              </span>
              <span style={st.errorTitle}>{e.error_name || 'Unknown'}</span>
              <span style={st.time}>{e.captured_at ? new Date(e.captured_at).toLocaleString('pt-BR') : '---'}</span>
              {e.resolved_at && <span style={st.resolvedBadge}>RESOLVIDO</span>}
              <span style={st.chevron}>{expanded ? '▲' : '▼'}</span>
            </div>

            {/* Message (always visible) */}
            <div style={st.msg}>{e.error_message || '(sem mensagem)'}</div>

            {/* Expanded details */}
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

                  {/* Copy-paste prompt for Claude Code */}
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

                {/* Context */}
                <div style={st.ctx}>
                  <CtxItem label="User" value={e.user_id?.slice(0, 12) || 'anon'} />
                  <CtxItem label="Source" value={e.source || '---'} />
                  <CtxItem label="URL" value={e.url || '---'} />
                  <CtxItem label="Device" value={e.user_agent?.slice(0, 50) || '---'} />
                  {meta.lat && <CtxItem label="GPS" value={`${meta.lat?.toFixed(4)}, ${meta.lng?.toFixed(4)}`} />}
                  {meta.visibility_layer && <CtxItem label="Layer" value={meta.visibility_layer} />}
                  {meta.error_code && <CtxItem label="PG Code" value={meta.error_code} />}
                  {meta.error_hint && <CtxItem label="Hint" value={meta.error_hint} />}
                </div>

                {/* Stack trace */}
                {e.error_stack && (
                  <details style={st.stackWrap}>
                    <summary style={st.stackToggle}>Stack trace</summary>
                    <pre style={st.stackCode}>{e.error_stack}</pre>
                  </details>
                )}

                {/* Actions */}
                {!e.resolved_at && (
                  <div style={st.actions}>
                    <button style={{ ...st.actionBtn, ...st.actionFix }} onClick={() => resolveError(e.id, 'manual-fix')}>Resolvido</button>
                    <button style={st.actionBtn} onClick={() => resolveError(e.id, 'ignored')}>Ignorar</button>
                    <button style={st.actionBtn} onClick={() => resolveError(e.id, 'duplicate')}>Duplicado</button>
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

  statsBar: { display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  stat: { padding: '12px 18px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8, minWidth: 100 },
  statNum: { display: 'block', fontSize: '1.5rem', fontWeight: 700 },
  statLabel: { fontSize: '0.5rem', color: '#55556a', letterSpacing: '0.15em', textTransform: 'uppercase' },

  filters: { display: 'flex', gap: 6, marginBottom: 18 },
  filterBtn: { padding: '7px 14px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 6, color: '#8888a0', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit' },
  filterActive: { background: '#1a1a30', color: '#e8e8f0', borderColor: '#2a2a40' },
  refreshBtn: { marginLeft: 'auto', padding: '7px 14px', background: 'transparent', border: '1px solid #1a1a30', borderRadius: 6, color: '#00e5ff', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit' },

  empty: { padding: 40, textAlign: 'center', color: '#55556a', background: '#0c0c1c', border: '1px dashed #1a1a30', borderRadius: 8 },

  card: { background: '#0c0c1c', border: '1px solid #1a1a30', borderLeft: '3px solid', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', cursor: 'pointer', userSelect: 'none' },
  badge: { fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em' },
  errorTitle: { fontSize: '0.78rem', fontWeight: 600, color: '#e8e8f0', flex: 1 },
  time: { fontSize: '0.58rem', color: '#55556a' },
  resolvedBadge: { fontSize: '0.48rem', fontWeight: 700, color: '#00e5ff', background: 'rgba(0,229,255,0.1)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.1em' },
  chevron: { color: '#55556a', fontSize: '0.6rem' },
  msg: { padding: '0 14px 10px', fontSize: '0.72rem', color: '#8888a0', lineHeight: 1.5, wordBreak: 'break-word' },

  details: { padding: '0 14px 14px' },

  // AI diagnosis box
  aiBox: { padding: 14, background: '#08081a', border: '1px solid rgba(0,229,255,0.1)', borderRadius: 8, marginBottom: 12 },
  aiHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiIcon: { fontSize: '1rem' },
  aiTitle: { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', color: '#00e5ff' },
  aiBadge: { fontSize: '0.48rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.1em' },
  aiDiagnosis: { fontSize: '0.72rem', color: '#c8c8e0', lineHeight: 1.6, marginBottom: 10 },

  // Prompt box
  promptBox: { background: '#05050f', border: '1px solid #1a1a30', borderRadius: 6, overflow: 'hidden' },
  promptHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #1a1a30' },
  promptLabel: { fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.2em', color: '#55556a' },
  copyBtn: { padding: '4px 10px', background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 4, color: '#00e5ff', fontSize: '0.58rem', cursor: 'pointer', fontFamily: 'inherit' },
  promptText: { padding: 10, fontSize: '0.62rem', color: '#aaaacc', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto' },

  // Context
  ctx: { display: 'flex', flexWrap: 'wrap', gap: '3px 14px', padding: '8px 0', borderTop: '1px solid #1a1a30', marginBottom: 8 },
  ctxRow: { display: 'flex', gap: 5 },
  ctxLabel: { fontSize: '0.52rem', color: '#55556a', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' },
  ctxValue: { fontSize: '0.58rem', color: '#8888a0', fontFamily: 'ui-monospace, monospace' },

  // Stack
  stackWrap: { marginBottom: 10 },
  stackToggle: { fontSize: '0.58rem', color: '#55556a', cursor: 'pointer', letterSpacing: '0.1em' },
  stackCode: { fontSize: '0.55rem', color: '#666680', background: '#05050f', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 120, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' },

  // Actions
  actions: { display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid #1a1a30' },
  actionBtn: { padding: '6px 12px', background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 4, color: '#c8c8e0', fontSize: '0.58rem', cursor: 'pointer', fontFamily: 'inherit' },
  actionFix: { background: 'rgba(0,229,255,0.08)', borderColor: 'rgba(0,229,255,0.2)', color: '#00e5ff' },
};
