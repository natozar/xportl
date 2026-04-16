
export default function LocationDisclaimer({ onAccept }) {
  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        <div style={s.iconWrap}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 22h20L12 2z" stroke="#ffaa00" strokeWidth="1.5" fill="rgba(255,170,0,0.08)" />
            <line x1="12" y1="9" x2="12" y2="14" stroke="#ffaa00" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1" fill="#ffaa00" />
          </svg>
        </div>

        <h2 style={s.title}>AVISO DE SEGURANCA</h2>

        <div style={s.content}>
          <p style={s.text}>Ao criar uma Capsula no XPortl, voce declara que:</p>
          <ul style={s.list}>
            <li>Esta em <strong>local publico e seguro</strong>, de acesso livre</li>
            <li>Nao esta em <strong>propriedade privada</strong> sem autorizacao</li>
            <li>O conteudo <strong>nao coloca ninguem em risco</strong> fisico</li>
            <li>Assume <strong>total responsabilidade civil e criminal</strong> pelo conteudo postado e pela escolha do local</li>
          </ul>
          <p style={s.textSmall}>
            O XPortl NAO se responsabiliza por danos decorrentes do deslocamento de terceiros ate coordenadas onde capsulas foram colocadas por outros usuarios.
          </p>
        </div>

        <button style={s.acceptBtn} onClick={onAccept}>
          Concordo e continuo
        </button>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 16, pointerEvents: 'auto',
  },
  modal: {
    background: 'rgba(12,12,18,0.95)', backdropFilter: 'blur(40px)',
    border: '1px solid rgba(255,170,0,0.15)', borderRadius: 20,
    padding: 24, maxWidth: 380, width: '100%', textAlign: 'center',
  },
  iconWrap: { marginBottom: 12 },
  title: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', color: '#ffaa00', margin: '0 0 16px' },
  content: { textAlign: 'left' },
  text: { fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 12 },
  list: {
    fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.8,
    paddingLeft: 20, marginBottom: 14,
  },
  textSmall: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 },
  acceptBtn: {
    width: '100%', padding: '14px', borderRadius: 14, border: 'none', marginTop: 18,
    background: 'rgba(255,170,0,0.15)', color: '#ffaa00',
    fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
  },
};
