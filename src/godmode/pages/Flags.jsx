import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../services/supabase';

export default function Flags({ session }) {
  const [flags, setFlags] = useState([]);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('feature_flags')
      .select('*')
      .order('key');
    if (err) { setError(err.message); return; }
    setFlags(data || []);
    setDraft(Object.fromEntries((data || []).map((f) => [f.key, JSON.stringify(f.value)])));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: if another admin edits, reflect immediately
  useEffect(() => {
    const ch = supabase
      .channel('flags-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const save = async (flag) => {
    setError(null);
    let parsed;
    try { parsed = JSON.parse(draft[flag.key]); }
    catch (e) { setError(`JSON inválido em ${flag.key}: ${e.message}`); return; }

    setSaving(flag.key);
    const before = flag.value;

    const { error: err1 } = await supabase
      .from('feature_flags')
      .update({ value: parsed, updated_at: new Date().toISOString(), updated_by: session.user.id })
      .eq('key', flag.key);

    if (err1) {
      setError(err1.message);
      setSaving(null);
      return;
    }

    // Best-effort audit entry. RLS allows authenticated INSERT.
    await supabase.from('audit_log').insert({
      actor_type: 'admin',
      actor_id: session.user.id,
      action: 'feature_flag.update',
      target_type: 'flag',
      target_id: flag.key,
      changed_fields: ['value'],
      before_state: { value: before },
      after_state: { value: parsed },
      reason: 'panel edit',
    });

    setSaving(null);
    await load();
  };

  return (
    <div>
      <h1 style={st.h1}>feature flags</h1>

      {error && <div style={st.error}>{error}</div>}

      <div style={st.list}>
        {flags.map((flag) => {
          const dirty = draft[flag.key] !== JSON.stringify(flag.value);
          return (
            <div key={flag.key} style={st.row}>
              <div style={st.meta}>
                <div style={st.key}>{flag.key}</div>
                <div style={st.desc}>{flag.description}</div>
                <div style={st.updated}>
                  atualizado {flag.updated_at ? new Date(flag.updated_at).toLocaleString('pt-BR') : '—'}
                </div>
              </div>
              <input
                style={st.input}
                value={draft[flag.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [flag.key]: e.target.value })}
                placeholder='valor JSON (ex: true, "texto", 42)'
              />
              <button
                style={{ ...st.btn, ...(dirty ? st.btnDirty : {}) }}
                onClick={() => save(flag)}
                disabled={!dirty || saving === flag.key}
              >
                {saving === flag.key ? '…' : 'salvar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 24, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  error: { padding: 12, background: '#2a0a10', color: '#ff4466', border: '1px solid #ff4466', borderRadius: 6, marginBottom: 16, fontSize: '0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  row: { display: 'grid', gridTemplateColumns: '1fr 240px 80px', gap: 12, padding: 16, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8, alignItems: 'center' },
  meta: { minWidth: 0 },
  key: { fontSize: '0.8rem', color: '#e8e8f0', fontWeight: 600 },
  desc: { fontSize: '0.65rem', color: '#55556a', marginTop: 2 },
  updated: { fontSize: '0.55rem', color: '#33334a', marginTop: 4 },
  input: { padding: '8px 10px', background: '#05050f', color: '#e8e8f0', border: '1px solid #1a1a30', borderRadius: 4, fontFamily: 'inherit', fontSize: '0.75rem' },
  btn: { padding: '8px 12px', background: '#12122a', color: '#55556a', border: '1px solid #1a1a30', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem' },
  btnDirty: { background: '#00e5ff', color: '#05050f', borderColor: '#00e5ff' },
};
