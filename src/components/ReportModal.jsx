import React, { useState } from 'react';
import { submitReport } from '../services/moderation';
import { haptic } from '../services/capsules';

const REASONS = [
  { value: 'harassment', label: 'Assedio / Bullying' },
  { value: 'hate_speech', label: 'Discurso de odio' },
  { value: 'doxxing', label: 'Exposicao de dados pessoais' },
  { value: 'threats', label: 'Ameacas' },
  { value: 'illegal_content', label: 'Conteudo ilegal' },
  { value: 'csam', label: 'Abuso de menores (CSAM)' },
  { value: 'misinformation', label: 'Panico falso / desinformacao' },
  { value: 'dangerous_location', label: 'Local perigoso' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Outro' },
];

export default function ReportModal({ targetType, targetId, reporterId, onClose }) {
  const [reason, setReason] = useState(null);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await submitReport({ reporterId, targetType, targetId, reason, description });
      haptic([50, 30, 50]);
      setDone(true);
    } catch (err) {
      console.error('[XPortl] Report failed:', err);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div style={s.backdrop} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={s.doneIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#00f0ff" strokeWidth="1.5" />
              <path d="M8 12l3 3 5-6" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h3 style={s.doneTitle}>Denuncia enviada</h3>
          <p style={s.doneText}>
            Nossa equipe vai analisar em ate 24 horas. Se houver 3+ denuncias, o conteudo sera ocultado automaticamente.
          </p>
          <button style={s.closeBtn} onClick={onClose}>Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={s.title}>REPORTAR CONTEUDO</h3>
        <p style={s.subtitle}>Selecione o motivo da denuncia</p>

        <div style={s.reasonList}>
          {REASONS.map((r) => (
            <button
              key={r.value}
              style={{
                ...s.reasonBtn,
                ...(reason === r.value ? s.reasonActive : {}),
                ...(r.value === 'csam' ? s.reasonCsam : {}),
              }}
              onClick={() => setReason(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {reason && (
          <textarea
            style={s.textarea}
            placeholder="Detalhes adicionais (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />
        )}

        <button
          style={{ ...s.submitBtn, opacity: reason ? 1 : 0.3 }}
          disabled={!reason || sending}
          onClick={handleSubmit}
        >
          {sending ? 'Enviando...' : 'Enviar denuncia'}
        </button>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 150, padding: 16, pointerEvents: 'auto',
  },
  modal: {
    background: 'rgba(12,12,18,0.95)', backdropFilter: 'blur(40px)',
    border: '1px solid rgba(255,51,102,0.15)', borderRadius: 20,
    padding: 24, maxWidth: 380, width: '100%', maxHeight: '85vh', overflowY: 'auto',
  },
  title: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--danger)', margin: 0 },
  subtitle: { fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 14 },
  reasonList: { display: 'flex', flexDirection: 'column', gap: 6 },
  reasonBtn: {
    padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)',
    fontSize: '0.7rem', fontWeight: 500, fontFamily: 'inherit', textAlign: 'left',
    transition: 'all 0.15s',
  },
  reasonActive: {
    background: 'rgba(255,51,102,0.08)', borderColor: 'rgba(255,51,102,0.2)', color: '#ff3366',
  },
  reasonCsam: { borderColor: 'rgba(255,51,102,0.15)' },
  textarea: {
    width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 10, resize: 'none',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    color: 'var(--text-primary)', fontSize: '0.7rem', fontFamily: 'inherit',
    outline: 'none',
  },
  submitBtn: {
    width: '100%', padding: '13px', borderRadius: 14, border: 'none', marginTop: 14,
    background: 'rgba(255,51,102,0.12)', color: '#ff3366',
    fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit',
    transition: 'opacity 0.3s',
  },
  doneIcon: { textAlign: 'center', marginBottom: 12 },
  doneTitle: { fontSize: '0.8rem', fontWeight: 700, color: '#00f0ff', textAlign: 'center', margin: 0 },
  doneText: { fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, marginTop: 8 },
  closeBtn: {
    width: '100%', padding: '12px', borderRadius: 14, border: 'none', marginTop: 16,
    background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)',
    fontSize: '0.72rem', fontFamily: 'inherit',
  },
};
