import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

export default function Errors() {
  const [errors, setErrors] = useState(null);
  const [filter, setFilter] = useState('all'); // all | unresolved | critical
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, unresolved: 0, critical: 0 });

  const fetchErrors = async () => {
    setLoading(true);

    let query = supabase
      .from('error_events')
      .select('*')
      .order('captured_at', { ascending: false })
      .limit(200);

    if (filter === 'unresolved') query = query.is('resolved_at', null);
    if (filter === 'critical') query = query.eq('severity', 'critical');

    const { data, error } = await query;
    if (error) { console.error(error); setLoading(false); return; }
    setErrors(data || []);

    // Stats
    const [{ count: total }, { count: unresolved }, { count: critical }] = await Promise.all([
      supabase.from('error_events').select('*', { count: 'exact', head: true }),
      supabase.from('error_events').select('*', { count: 'exact', head: true }).is('resolved_at', null),
      supabase.from('error_events').select('*', { count: 'exact', head: true }).eq('severity', 'critical'),
    ]);
    setStats({ total: total || 0, unresolved: unresolved || 0, critical: critical || 0 });
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

  return (
    <div>
      <h1 style={st.h1}>error events</h1>

      {/* Stats bar */}
      <div style={st.statsBar}>
        <div style={st.stat}>
          <span style={st.statNum}>{stats.total}</span>
          <span style={st.statLabel}>total</span>
        </div>
        <div style={st.stat}>
          <span style={{ ...st.statNum, color: stats.unresolved > 0 ? '#ffaa00' : '#00e5ff' }}>{stats.unresolved}</span>
          <span style={st.statLabel}>nao resolvidos</span>
        </div>
        <div style={st.stat}>
          <span style={{ ...st.statNum, color: stats.critical > 0 ? '#ff4466' : '#00e5ff' }}>{stats.critical}</span>
          <span style={st.statLabel}>criticos</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={st.filters}>
        {['all', 'unresolved', 'critical'].map((f) => (
          <button key={f} style={{ ...st.filterBtn, ...(filter === f ? st.filterActive : {}) }} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Todos' : f === 'unresolved' ? 'Abertos' : 'Criticos'}
          </button>
        ))}
        <button style={st.refreshBtn} onClick={fetchErrors}>
          {loading ? '...' : 'Atualizar'}
        </button>
      </div>

      {/* Error list */}
      {errors && errors.length === 0 && (
        <div style={st.empty}>
          {filter === 'all' ? 'Nenhum erro registrado. Isso e bom!' : 'Nenhum erro neste filtro.'}
        </div>
      )}

      {errors && errors.map((e) => (
        <div key={e.id} style={{ ...st.card, ...(e.severity === 'critical' ? st.cardCritical : e.severity === 'error' ? st.cardError : st.cardWarn) }}>
          {/* Header */}
          <div style={st.cardHeader}>
            <span style={{
              ...st.severity,
              color: e.severity === 'critical' ? '#ff4466' : e.severity === 'error' ? '#ff8844' : '#ffaa00',
            }}>
              {e.severity?.toUpperCase() || 'ERROR'}
            </span>
            <span style={st.cardTime}>
              {e.captured_at ? new Date(e.captured_at).toLocaleString('pt-BR') : '---'}
            </span>
            {e.resolved_at && <span style={st.resolved}>RESOLVIDO</span>}
          </div>

          {/* Error name + message */}
          <div style={st.errorName}>{e.error_name || 'Unknown Error'}</div>
          <div style={st.errorMsg}>{e.error_message || '(sem mensagem)'}</div>

          {/* Stack trace (collapsible) */}
          {e.error_stack && (
            <details style={st.stackDetails}>
              <summary style={st.stackSummary}>Stack trace</summary>
              <pre style={st.stackPre}>{e.error_stack}</pre>
            </details>
          )}

          {/* Context */}
          <div style={st.context}>
            <CtxItem label="User" value={e.user_id?.slice(0, 12) || 'anon'} />
            <CtxItem label="Source" value={e.source || '---'} />
            <CtxItem label="URL" value={e.url || '---'} />
            <CtxItem label="UA" value={e.user_agent?.slice(0, 60) || '---'} />
            {e.fingerprint && <CtxItem label="Fingerprint" value={e.fingerprint.slice(0, 16)} />}
            {e.session_id && <CtxItem label="Session" value={e.session_id.slice(0, 12)} />}
          </div>

          {/* Actions */}
          {!e.resolved_at && (
            <div style={st.actions}>
              <button style={st.actionBtn} onClick={() => resolveError(e.id, 'manual-fix')}>Resolvido (fix)</button>
              <button style={st.actionBtn} onClick={() => resolveError(e.id, 'ignored')}>Ignorar</button>
              <button style={st.actionBtn} onClick={() => resolveError(e.id, 'duplicate')}>Duplicado</button>
            </div>
          )}
        </div>
      ))}
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
  h1: { margin: 0, marginBottom: 16, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },

  statsBar: { display: 'flex', gap: 16, marginBottom: 16 },
  stat: { display: 'flex', flexDirection: 'column', padding: '12px 20px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8, minWidth: 100 },
  statNum: { fontSize: '1.5rem', fontWeight: 700, color: '#00e5ff' },
  statLabel: { fontSize: '0.55rem', color: '#55556a', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 2 },

  filters: { display: 'flex', gap: 6, marginBottom: 20 },
  filterBtn: { padding: '8px 16px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 6, color: '#8888a0', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit' },
  filterActive: { background: '#1a1a30', color: '#e8e8f0', borderColor: '#2a2a40' },
  refreshBtn: { marginLeft: 'auto', padding: '8px 16px', background: 'transparent', border: '1px solid #1a1a30', borderRadius: 6, color: '#00e5ff', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit' },

  empty: { padding: 40, textAlign: 'center', color: '#55556a', background: '#0c0c1c', border: '1px dashed #1a1a30', borderRadius: 8, fontSize: '0.78rem' },

  card: { padding: 16, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 10, marginBottom: 10 },
  cardCritical: { borderColor: '#ff4466', borderLeft: '3px solid #ff4466' },
  cardError: { borderColor: '#ff8844', borderLeft: '3px solid #ff8844' },
  cardWarn: { borderColor: '#ffaa00', borderLeft: '3px solid #ffaa00' },

  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  severity: { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.15em' },
  cardTime: { fontSize: '0.6rem', color: '#55556a' },
  resolved: { fontSize: '0.5rem', fontWeight: 700, color: '#00e5ff', background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.1em', marginLeft: 'auto' },

  errorName: { fontSize: '0.85rem', fontWeight: 600, color: '#e8e8f0', marginBottom: 4 },
  errorMsg: { fontSize: '0.75rem', color: '#c8c8d0', lineHeight: 1.5, marginBottom: 10, wordBreak: 'break-word' },

  stackDetails: { marginBottom: 10 },
  stackSummary: { fontSize: '0.6rem', color: '#55556a', cursor: 'pointer', letterSpacing: '0.1em' },
  stackPre: { fontSize: '0.6rem', color: '#8888a0', background: '#05050f', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 150, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' },

  context: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '8px 0', borderTop: '1px solid #1a1a30', marginBottom: 8 },
  ctxRow: { display: 'flex', gap: 6 },
  ctxLabel: { fontSize: '0.55rem', color: '#55556a', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' },
  ctxValue: { fontSize: '0.6rem', color: '#8888a0', fontFamily: 'ui-monospace, monospace' },

  actions: { display: 'flex', gap: 6 },
  actionBtn: { padding: '6px 12px', background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 4, color: '#c8c8e0', fontSize: '0.6rem', cursor: 'pointer', fontFamily: 'inherit' },
};
