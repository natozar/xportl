import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

export default function Audit() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('audit_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (err) { setError(err.message); return; }
      setEntries(data || []);
    })();
  }, []);

  return (
    <div>
      <h1 style={st.h1}>audit log</h1>
      <p style={st.muted}>últimas 100 ações (append-only, imutável até mesmo via service_role)</p>

      {error && <div style={st.error}>{error}</div>}

      {entries && entries.length === 0 && (
        <div style={st.empty}>nenhuma ação registrada ainda. mexa numa flag pra testar.</div>
      )}

      {entries && entries.length > 0 && (
        <div style={st.table}>
          <div style={{ ...st.row, ...st.head }}>
            <div>quando</div>
            <div>ator</div>
            <div>ação</div>
            <div>alvo</div>
            <div>motivo</div>
          </div>
          {entries.map((e) => (
            <div key={e.id} style={st.row}>
              <div style={st.cell}>{new Date(e.occurred_at).toLocaleString('pt-BR')}</div>
              <div style={st.cell}>
                <span style={st.actorType}>{e.actor_type}</span>
                {e.actor_id && <div style={st.actorId}>{e.actor_id.slice(0, 8)}…</div>}
              </div>
              <div style={st.cell}><code style={st.code}>{e.action}</code></div>
              <div style={st.cell}>
                {e.target_type && <>{e.target_type}: <code style={st.code}>{e.target_id}</code></>}
                {e.changed_fields && <div style={st.fields}>campos: {e.changed_fields.join(', ')}</div>}
              </div>
              <div style={st.cell}>{e.reason || '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 4, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  muted: { color: '#55556a', fontSize: '0.7rem', marginBottom: 24 },
  error: { padding: 12, background: '#2a0a10', color: '#ff4466', border: '1px solid #ff4466', borderRadius: 6, fontSize: '0.75rem' },
  empty: { padding: 32, textAlign: 'center', color: '#55556a', background: '#0c0c1c', border: '1px dashed #1a1a30', borderRadius: 8, fontSize: '0.75rem' },
  table: { display: 'flex', flexDirection: 'column', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8, overflow: 'hidden' },
  row: { display: 'grid', gridTemplateColumns: '160px 120px 180px 1fr 200px', gap: 12, padding: '10px 14px', borderBottom: '1px solid #1a1a30', fontSize: '0.7rem' },
  head: { background: '#05050f', color: '#55556a', textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.55rem' },
  cell: { color: '#c8c8e0', overflow: 'hidden', textOverflow: 'ellipsis' },
  actorType: { color: '#00e5ff', textTransform: 'uppercase', fontSize: '0.55rem', letterSpacing: '0.15em' },
  actorId: { color: '#55556a', fontSize: '0.6rem' },
  code: { background: '#1a1a30', padding: '1px 5px', borderRadius: 3, color: '#e8e8f0', fontSize: '0.65rem' },
  fields: { color: '#55556a', fontSize: '0.6rem', marginTop: 2 },
};
