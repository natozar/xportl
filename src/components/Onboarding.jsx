import { useState } from 'react';

const STEPS = [
  {
    icon: '🌀',
    title: 'Portais escondidos',
    desc: 'O mundo real esta cheio de portais invisiveis. Aponte a camera e descubra capsulas deixadas por outros.',
    color: '#00f0ff',
  },
  {
    icon: '📍',
    title: 'Mire e esconda',
    desc: 'Crie um portal e mire o celular no local exato onde quer esconde-lo. So quem apontar na mesma direcao vai encontrar.',
    color: '#00ff88',
  },
  {
    icon: '💎',
    title: 'Raridade importa',
    desc: 'Capsulas Raras, Lendarias e Miticas brilham mais e sao limitadas por dia. Suba de nivel para desbloquear.',
    color: '#f59e0b',
  },
  {
    icon: '🔗',
    title: '6 tipos de capsula',
    desc: 'Eco se espalha. Corrente exige troca. Desafio tem missao. Collab e um mural. Leilao custa XP. Cada tipo muda o jogo.',
    color: '#b44aff',
  },
  {
    icon: '🔔',
    title: 'Fique atento',
    desc: 'Quando alguem comentar nos seus portais, voce recebe uma notificacao. O radar mostra portais proximos.',
    color: '#ff3366',
  },
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      localStorage.setItem('xportl_onboarding', '1');
      onComplete();
    } else {
      setStep(step + 1);
    }
  };

  const skip = () => {
    localStorage.setItem('xportl_onboarding', '1');
    onComplete();
  };

  return (
    <div style={st.overlay}>
      <div style={st.content}>
        {/* Skip */}
        <button style={st.skip} onClick={skip}>Pular</button>

        {/* Icon */}
        <div style={{ ...st.iconWrap, boxShadow: `0 0 60px ${current.color}30` }}>
          <span style={st.icon}>{current.icon}</span>
        </div>

        {/* Text */}
        <h2 style={{ ...st.title, color: current.color }}>{current.title}</h2>
        <p style={st.desc}>{current.desc}</p>

        {/* Dots */}
        <div style={st.dots}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                ...st.dot,
                ...(i === step ? { background: current.color, width: 20 } : {}),
              }}
            />
          ))}
        </div>

        {/* Next / Start */}
        <button
          style={{ ...st.nextBtn, background: `linear-gradient(135deg, ${current.color}, ${current.color}cc)` }}
          onClick={next}
        >
          {isLast ? 'Comecar' : 'Proximo'}
          {!isLast && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 10005,
    background: '#0a0814',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  content: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', maxWidth: 340, width: '100%',
  },
  skip: {
    alignSelf: 'flex-end', marginBottom: 40,
    background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', fontWeight: 600,
    fontFamily: 'inherit', letterSpacing: '0.06em',
    touchAction: 'manipulation',
  },
  iconWrap: {
    width: 100, height: 100, borderRadius: '50%',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 32,
  },
  icon: { fontSize: '2.8rem' },
  title: {
    fontSize: '1.3rem', fontWeight: 700, letterSpacing: '0.02em',
    margin: '0 0 12px',
  },
  desc: {
    fontSize: '0.85rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7,
    margin: '0 0 40px',
  },
  dots: {
    display: 'flex', gap: 6, marginBottom: 32,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    background: 'rgba(255,255,255,0.1)',
    transition: 'all 0.3s',
  },
  nextBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '14px 40px', borderRadius: 14, border: 'none',
    color: '#0a0814', fontSize: '0.9rem', fontWeight: 700,
    fontFamily: 'inherit', width: '100%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
};
