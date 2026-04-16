import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [
        { data: flags },
        { count: totalUsers },
        { count: totalCapsules },
        { count: totalErrors },
        { count: unresolvedErrors },
        { count: criticalErrors },
        { count: totalReports },
        { count: pendingReports },
        { data: recentErrors },
        { data: errorsByName },
        { count: activeUsers },
        { data: topErrorUsers },
      ] = await Promise.all([
        supabase.from('feature_flags').select('key, value'),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('capsules').select('*', { count: 'exact', head: true }),
        supabase.from('error_events').select('*', { count: 'exact', head: true }),
        supabase.from('error_events').select('*', { count: 'exact', head: true }).is('resolved_at', null),
        supabase.from('error_events').select('*', { count: 'exact', head: true }).eq('severity', 'critical'),
        supabase.from('reports').select('*', { count: 'exact', head: true }),
        supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('error_events').select('error_name, severity, captured_at').order('captured_at', { ascending: false }).limit(50),
        supabase.from('error_events').select('error_name').is('resolved_at', null),
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }).gt('total_xp', 0),
        supabase.from('error_events').select('user_id').is('resolved_at', null).not('user_id', 'is', null),
      ]);

      // Group errors by name for chart
      const errorGroups = {};
      (errorsByName || []).forEach((e) => {
        const name = e.error_name || 'UNKNOWN';
        errorGroups[name] = (errorGroups[name] || 0) + 1;
      });

      // Group errors by hour (last 24h)
      const hourBuckets = Array(24).fill(0);
      const now = Date.now();
      (recentErrors || []).forEach((e) => {
        const hoursAgo = Math.floor((now - new Date(e.captured_at).getTime()) / 3600000);
        if (hoursAgo < 24) hourBuckets[hoursAgo]++;
      });

      // Users affected
      const affectedUsers = new Set((topErrorUsers || []).map((e) => e.user_id)).size;

      const flagMap = Object.fromEntries((flags || []).map((f) => [f.key, f.value]));

      setData({
        flags: flagMap,
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalCapsules: totalCapsules || 0,
        totalErrors: totalErrors || 0,
        unresolvedErrors: unresolvedErrors || 0,
        criticalErrors: criticalErrors || 0,
        totalReports: totalReports || 0,
        pendingReports: pendingReports || 0,
        errorGroups,
        hourBuckets,
        affectedUsers,
      });
      setLoading(false);
    })();
  }, []);

  if (loading || !data) return <div style={st.loading}>carregando metricas...</div>;

  const { flags, hourBuckets, errorGroups } = data;
  const killed = flags.ai_kill_switch === true;
  const maintenance = flags.maintenance_mode === true;

  return (
    <div>
      <h1 style={st.h1}>overview</h1>

      {/* ── Health cards ── */}
      <div style={st.grid}>
        <Card title="Usuarios" value={data.totalUsers} sub={`${data.activeUsers} ativos`} tone="ok" />
        <Card title="Capsulas" value={data.totalCapsules} tone="ok" />
        <Card title="Erros abertos" value={data.unresolvedErrors} sub={`${data.criticalErrors} criticos`} tone={data.unresolvedErrors > 0 ? 'danger' : 'ok'} />
        <Card title="Users com bugs" value={data.affectedUsers} tone={data.affectedUsers > 0 ? 'warn' : 'ok'} />
        <Card title="Denuncias" value={data.totalReports} sub={`${data.pendingReports} pendentes`} tone={data.pendingReports > 0 ? 'warn' : 'ok'} />
        <Card title="IA" value={killed ? 'OFF' : 'ON'} sub={maintenance ? 'MANUTENCAO' : 'Normal'} tone={killed ? 'neutral' : 'ok'} />
      </div>

      {/* ── Error timeline (last 24h) ── */}
      <div style={st.section}>
        <h2 style={st.h2}>Erros por hora (ultimas 24h)</h2>
        <div style={st.chartContainer}>
          <svg width="100%" height="100" viewBox={`0 0 ${24 * 20} 100`} preserveAspectRatio="none">
            {hourBuckets.map((count, i) => {
              const maxH = Math.max(...hourBuckets, 1);
              const h = (count / maxH) * 80;
              const color = count === 0 ? '#1a1a30' : count > 3 ? '#ff4466' : count > 1 ? '#ffaa00' : '#00e5ff';
              return (
                <g key={i}>
                  <rect x={i * 20 + 2} y={90 - h} width={16} height={h} rx={3} fill={color} opacity={0.8} />
                  {count > 0 && (
                    <text x={i * 20 + 10} y={85 - h} textAnchor="middle" fill="#c8c8e0" fontSize="8" fontWeight="600">{count}</text>
                  )}
                </g>
              );
            })}
            {/* X axis labels */}
            {[0, 6, 12, 18, 23].map((i) => (
              <text key={i} x={i * 20 + 10} y={99} textAnchor="middle" fill="#55556a" fontSize="7">{i}h</text>
            ))}
          </svg>
        </div>
      </div>

      {/* ── Top errors ── */}
      {Object.keys(errorGroups).length > 0 && (
        <div style={st.section}>
          <h2 style={st.h2}>Erros por tipo (abertos)</h2>
          <div style={st.errorList}>
            {Object.entries(errorGroups).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => (
              <div key={name} style={st.errorRow}>
                <div style={st.errorBar}>
                  <div style={{ ...st.errorFill, width: `${(count / Math.max(...Object.values(errorGroups))) * 100}%` }} />
                </div>
                <code style={st.errorName}>{name}</code>
                <span style={st.errorCount}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, sub, tone }) {
  const colors = { ok: '#00e5ff', warn: '#ffaa00', danger: '#ff4466', neutral: '#8888a0' };
  return (
    <div style={st.card}>
      <div style={st.cardLabel}>{title}</div>
      <div style={{ ...st.cardValue, color: colors[tone] }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div style={st.cardSub}>{sub}</div>}
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 24, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  h2: { margin: 0, marginBottom: 12, fontSize: '0.7rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8888a0' },
  loading: { color: '#55556a', padding: 40, textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 28 },
  card: { padding: 16, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8 },
  cardLabel: { fontSize: '0.55rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#55556a', marginBottom: 6 },
  cardValue: { fontSize: '1.4rem', fontWeight: 700 },
  cardSub: { fontSize: '0.6rem', color: '#55556a', marginTop: 4 },
  section: { marginBottom: 28, padding: 18, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8 },
  chartContainer: { overflow: 'hidden' },
  errorList: { display: 'flex', flexDirection: 'column', gap: 6 },
  errorRow: { display: 'flex', alignItems: 'center', gap: 10 },
  errorBar: { flex: 1, height: 6, background: '#1a1a30', borderRadius: 3, overflow: 'hidden' },
  errorFill: { height: '100%', background: '#ff4466', borderRadius: 3 },
  errorName: { fontSize: '0.65rem', color: '#c8c8e0', background: '#1a1a30', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' },
  errorCount: { fontSize: '0.75rem', fontWeight: 700, color: '#ff4466', minWidth: 24, textAlign: 'right' },
};
