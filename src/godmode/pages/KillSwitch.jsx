import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

const SWITCHES = [
  {
    key: 'ai_kill_switch',
    label: 'pausar IA autônoma',
    desc: 'Desliga classifier, patch-author, auto-apply. Equivale a tier 0.',
    dangerValue: true,
    normalValue: false,
    confirmText: 'pausar ia',
  },
  {
    key: 'maintenance_mode',
    label: 'modo manutenção',
    desc: 'Usuários não-admin verão tela de manutenção no app.',
    dangerValue: true,
    normalValue: false,
    confirmText: 'manutencao',
  },
  {
    key: 'signup_enabled',
    label: 'desligar signups',
    desc: 'Bloqueia novos cadastros. Logins existentes continuam funcionando.',
    dangerValue: false,
    normalValue: true,
    confirmText: 'sem signup',
  },
];

export default function KillSwitch({ session }) {
  const [flags, setFlags] = useState({});
  const [confirming, setConfirming] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    const { data } = await supabase.from('feature_flags').select('key, value');
    setFlags(Object.fromEntries((data || []).map((f) => [f.key, f.value])));
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('killswitch-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_flags' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const trigger = async (sw) => {
    setError(null);
    const target = flags[sw.key] === sw.dangerValue ? sw.normalValue : sw.dangerValue;
    const before = flags[sw.key];

    const { error: err } = await supabase
      .from('feature_flags')
      .update({ value: target, updated_at: new Date().toISOString(), updated_by: session.user.id })
      .eq('key', sw.key);

    if (err) { setError(err.message); return; }

    await supabase.from('audit_log').insert({
      actor_type: 'admin',
      actor_id: session.user.id,
      action: 'kill_switch.trigger',
      target_type: 'flag',
      target_id: sw.key,
      changed_fields: ['value'],
      before_state: { value: before },
      after_state: { value: target },
      reason: `kill switch: ${sw.label}`,
    });

    setConfirming(null);
    setConfirmInput('');
  };

  return (
    <div>
      <h1 style={st.h1}>kill switch</h1>
      <p style={st.warn}>
        Ações aqui têm efeito imediato em produção. Cada toggle gera entrada no audit log.
      </p>

      {error && <div style={st.error}>{error}</div>}

      <div style={st.list}>
        {SWITCHES.map((sw) => {
          const active = flags[sw.key] === sw.dangerValue;
          const isConfirming = confirming === sw.key;
          return (
            <div key={sw.key} style={{ ...st.card, ...(active ? st.cardActive : {}) }}>
              <div style={st.cardTop}>
                <div>
                  <div style={st.label}>{sw.label}</div>
                  <div style={st.desc}>{sw.desc}</div>
                </div>
                <div style={{ ...st.status, color: active ? '#ff4466' : '#8888a0' }}>
                  {active ? 'ATIVO' : 'off'}
                </div>
              </div>

              {isConfirming ? (
                <div style={st.confirmBox}>
                  <div style={st.confirmLabel}>
                    digite <code style={st.code}>{sw.confirmText}</code> para confirmar:
                  </div>
                  <input
                    autoFocus
                    style={st.input}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                  />
                  <div style={st.btnRow}>
                    <button
                      style={st.btnDanger}
                      disabled={confirmInput !== sw.confirmText}
                      onClick={() => trigger(sw)}
                    >
                      confirmar
                    </button>
                    <button
                      style={st.btnGhost}
                      onClick={() => { setConfirming(null); setConfirmInput(''); }}
                    >
                      cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  style={active ? st.btnRevert : st.btnTrigger}
                  onClick={() => setConfirming(sw.key)}
                >
                  {active ? 'reverter' : 'disparar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 8, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#ff4466' },
  warn: { color: '#8888a0', fontSize: '0.75rem', marginBottom: 24 },
  error: { padding: 12, background: '#2a0a10', color: '#ff4466', border: '1px solid #ff4466', borderRadius: 6, marginBottom: 16, fontSize: '0.75rem' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { padding: 20, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 8 },
  cardActive: { borderColor: '#ff4466', boxShadow: '0 0 20px rgba(255,68,102,0.15)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  label: { fontSize: '0.85rem', color: '#e8e8f0', fontWeight: 600, marginBottom: 4 },
  desc: { fontSize: '0.7rem', color: '#55556a', lineHeight: 1.5, maxWidth: 480 },
  status: { fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase' },
  btnTrigger: { padding: '10px 16px', background: 'transparent', color: '#ff4466', border: '1px solid #ff4466', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' },
  btnRevert: { padding: '10px 16px', background: 'transparent', color: '#00e5ff', border: '1px solid #00e5ff', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' },
  confirmBox: { display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: '#05050f', borderRadius: 6, border: '1px solid #1a1a30' },
  confirmLabel: { fontSize: '0.7rem', color: '#8888a0' },
  code: { background: '#1a1a30', padding: '2px 6px', borderRadius: 3, color: '#ff4466' },
  input: { padding: '8px 10px', background: '#05050f', color: '#e8e8f0', border: '1px solid #2a2a40', borderRadius: 4, fontFamily: 'inherit', fontSize: '0.8rem' },
  btnRow: { display: 'flex', gap: 8 },
  btnDanger: { flex: 1, padding: '8px 12px', background: '#ff4466', color: '#05050f', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600 },
  btnGhost: { padding: '8px 12px', background: 'transparent', color: '#55556a', border: '1px solid #1a1a30', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem' },
};
