import React, { useState } from 'react';

export default function TosModal({ onAccept }) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 40) setScrolledToEnd(true);
  };

  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        <h2 style={s.title}>TERMOS DE USO</h2>
        <p style={s.version}>Versao 1.0.0 — Abril 2026</p>

        <div style={s.scroll} onScroll={handleScroll}>
          <Section title="1. ACEITACAO">
            Ao utilizar o XPortl, voce concorda integralmente com estes Termos de Uso e com a Politica de Privacidade. O uso do app constitui aceite automatico.
          </Section>

          <Section title="2. VEDACAO AO ANONIMATO">
            Em conformidade com o Art. 5, inciso IV da Constituicao Federal Brasileira, NENHUM conteudo no XPortl e anonimo. Sua identidade autenticada (Google/Apple/Telefone) fica vinculada de forma inviolavel a cada capsula criada, mesmo que publicamente voce utilize um pseudonimo. Esta vinculacao podera ser revelada mediante ordem judicial.
          </Section>

          <Section title="3. CONTEUDO PROIBIDO">
            E expressamente proibido usar o XPortl para:{'\n'}
            a) Ameacas, assedio, bullying ou discurso de odio{'\n'}
            b) Doxxing (exposicao de dados pessoais de terceiros){'\n'}
            c) Material de abuso sexual infantil (CSAM){'\n'}
            d) Incitacao a panico, violencia ou terrorismo{'\n'}
            e) Spam, flooding ou abuso sistematico{'\n'}
            f) Conteudo que viole direitos autorais{'\n'}
            g) Qualquer atividade ilegal sob a legislacao brasileira
          </Section>

          <Section title="4. RESPONSABILIDADE DO USUARIO">
            O usuario e INTEGRALMENTE responsavel pelo conteudo que cria e pelo local fisico onde ancora suas capsulas. O XPortl nao se responsabiliza por danos decorrentes do deslocamento de terceiros ate coordenadas de capsulas criadas por usuarios.
          </Section>

          <Section title="5. MODERACAO E REMOCAO">
            O XPortl reserva-se o direito de remover qualquer conteudo e suspender ou banir contas que violem estes termos, com ou sem aviso previo. Capsulas com 3+ denuncias sao automaticamente ocultadas para revisao. Capsulas com 5+ denuncias sao removidas. Contas com 5+ capsulas removidas sao banidas permanentemente.
          </Section>

          <Section title="6. MARCO CIVIL DA INTERNET">
            Em conformidade com o Art. 15 da Lei 12.965/2014, o XPortl mantem registros de acesso (IP, data/hora, identificacao) por no minimo 6 meses, podendo ser estendido por ordem judicial.
          </Section>

          <Section title="7. LGPD">
            Seus dados sao tratados conforme a Lei 13.709/2018 (LGPD). Voce tem direito a acessar, corrigir, exportar e solicitar exclusao dos seus dados a qualquer momento atraves das configuracoes do app. Prazo de resposta: 15 dias uteis.
          </Section>

          <Section title="8. MENORES DE IDADE (ECA)">
            Usuarios menores de 18 anos possuem restricoes automaticas: nao podem enviar midia, criar capsulas Ghost, e possuem limite diario de 5 capsulas, conforme o Estatuto da Crianca e do Adolescente (Lei 8.069/1990).
          </Section>

          <Section title="9. FORO">
            Fica eleito o foro da comarca da sede da empresa para dirimir quaisquer controversias oriundas destes Termos.
          </Section>
        </div>

        <button
          style={{ ...s.acceptBtn, opacity: scrolledToEnd ? 1 : 0.3 }}
          disabled={!scrolledToEnd}
          onClick={onAccept}
        >
          Li e aceito os Termos de Uso
        </button>
        {!scrolledToEnd && <p style={s.hint}>Role ate o final para aceitar</p>}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--neon-cyan)', letterSpacing: '0.1em', marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{children}</p>
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
    border: '1px solid rgba(0,240,255,0.12)', borderRadius: 20,
    padding: 24, maxWidth: 420, width: '100%', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
  },
  title: { fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--text-primary)', margin: 0 },
  version: { fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 16 },
  scroll: {
    flex: 1, overflowY: 'auto', paddingRight: 8,
    maxHeight: '55vh', marginBottom: 16,
  },
  acceptBtn: {
    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
    background: 'var(--neon-cyan)', color: 'var(--bg-void)',
    fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
    letterSpacing: '0.05em', transition: 'opacity 0.3s',
  },
  hint: { fontSize: '0.55rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 },
};
