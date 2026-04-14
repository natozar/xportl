import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

export default function Overview() {
  const [flags, setFlags] = useState(null);
  const [counts, setCounts] = useState({ errors: null, audit: null });

  useEffect(() => {
    (async () => {
      const [{ data: f }, { count: errCount }, { count: auditCount }] = await Promise.all([
        supabase.from('feature_flags').select('key, value'),
        supabase.from('error_events').select('*', { count: 'exact', head: true }).is('resolved_at', null),
        supabase.from('audit_log').select('*', { count: 'exact', head: true }),
      ]);
      setFlags(f || []);
      setCounts({ errors: errCount, audit: auditCount });
    })();
  }, []);

  const flagMap = Object.fromEntries((flags || []).map((f) => [f.key, f.value]));
  const killed = flagMap.ai_kill_switch === true;
  const tier = flagMap.ai_autonomy_tier ?? '—';
  const maintenance = flagMap.maintenance_mode === true;
  const signups = flagMap.signup_enabled !== false;
  const budget = flagMap.llm_monthly_budget_usd ?? 0;
  const spent = flagMap.llm_monthly_spent_usd ?? 0;
  const budgetPct = budget > 0 ? Math.round((Number(spent) / Number(budget)) * 100) : 0;

  return (
    <div>
      <h1 style={st.h1}>overview</h1>

      <div style={st.grid}>
        <Card title="IA autonomy" value={killed ? 'OFF' : `tier ${tier}`} tone={killed ? 'danger' : 'ok'} />
        <Card title="maintenance" value={maintenance ? 'ATIVO' : 'OFF'} tone={maintenance ? 'warn' : 'ok'} />
        <Card title="signups" value={signups ? 'OPEN' : 'CLOSED'} tone={signups ? 'ok' : 'warn'} />
        <Card title="LLM budget" value={`$${spent} / $${budget}`} tone={budgetPct > 80 ? 'danger' : 'ok'} sub={`${budgetPct}% usado`} />
        <Card title="erros abertos" value={counts.errors ?? '—'} tone={counts.errors > 0 ? 'warn' : 'ok'} />
        <Card title="audit entries" value={counts.audit ?? '—'} tone="neutral" />
      </div>

      <div style={st.note}>
        <strong>Fase 9 MVP.</strong> Este painel roda contra as tabelas criadas em{' '}
        <code>migration_004</code> + <code>migration_005</code>. Fases 5–8 (error
        ingest, IA classifier, auto-patch, rollback) ainda não estão ligadas —
        cards de erro mostram só o schema. O kill switch já é real: mexer em{' '}
        <code>feature flags</code> → <code>ai_kill_switch</code> trava qualquer IA
        futura antes mesmo dela existir.
      </div>
    </div>
  );
}

function Card({ title, value, tone, sub }) {
  const toneColor = {
    ok: '#00e5ff',
    warn: '#ffaa00',
    danger: '#ff4466',
    neutral: '#8888a0',
  }[tone] || '#8888a0';
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{title}</div>
      <div style={{ ...st.cardValue, color: toneColor }}>{value}</div>
      {sub && <div style={st.cardSub}>{sub}</div>}
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 24, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 32 },
  card: { padding: 18, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8 },
  cardLabel: { fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#55556a', marginBottom: 8 },
  cardValue: { fontSize: '1.3rem', fontWeight: 600, letterSpacing: '0.02em' },
  cardSub: { fontSize: '0.65rem', color: '#55556a', marginTop: 4 },
  note: { padding: 16, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8, fontSize: '0.75rem', color: '#8888a0', lineHeight: 1.7 },
};
