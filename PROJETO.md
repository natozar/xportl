# XPORTL — Documento de Contexto e Roadmap

**Ultima atualizacao:** 14 de abril de 2026
**Repo:** https://github.com/natozar/xportl
**Deploy:** https://xportl.vercel.app
**Supabase:** https://fjwxqgupupblfxbwvhio.supabase.co

---

## VISAO DO PRODUTO

Primeira rede social em realidade aumentada ancorada em coordenadas GPS reais.
Usuarios plantam capsulas do tempo digitais (texto, foto, audio, video) em locais
fisicos. Outros usuarios caminham pelo mundo real e descobrem esses portais
atraves da camera do celular.

**Tagline:** Deixe rastros. Encontre portais.

---

## ARQUITETURA ATUAL

```
Landing (index.html)         App (app.html)              Godmode (godmode.html)
   HTML puro                    React 19 + A-Frame           React (admin isolado)
   SEO / marketing              AR.js Location-Based         Feature flags
   OAuth redirect catch         Supabase Realtime            Kill switch / Audit
        |                            |                            |
        +------------ Vite Multi-Entry Build ---------+-----------+
                                     |
                              Vercel (deploy)
                                     |
                          Supabase (Sao Paulo)
                          - PostgreSQL + PostGIS
                          - Auth (Google, Email, Phone)
                          - Storage (capsule-media bucket)
                          - Realtime (postgres_changes)
```

### Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, A-Frame 1.3, AR.js, TensorFlow.js |
| Build | Vite 6, vite-plugin-pwa, Workbox |
| Backend | Supabase (PostgreSQL 15 + PostGIS + Auth + Storage) |
| Deploy | Vercel (auto-deploy on push) |
| DNS | Namecheap (xportl.com) |
| Moderacao | NSFW.js client-side + regex pt-BR + reports + auto-ban |

---

## FEATURES COMPLETAS (MVP)

### Core
- [x] Capsulas geolocalizadas em AR (A-Frame + GPS)
- [x] 3 tipos: Perpetua, Ghost (autodestroi), Privada
- [x] Trava temporal (unlock_date)
- [x] Midia: foto, audio, video (upload para Supabase Storage)
- [x] Clustering "Vortex" (3+ capsulas em 5m)
- [x] Pings efemeros (emoji 15s)
- [x] Realtime (postgres_changes + polling safety net)
- [x] PWA instalavel (iOS instrucional + Android nativo)

### Auth & Compliance
- [x] Google OAuth + Email/senha + Telefone SMS
- [x] Termos de Uso versionados (scroll-to-accept)
- [x] Disclaimer de localizacao
- [x] Vedacao ao anonimato (CF Art. 5, IV)
- [x] Log de acesso (Marco Civil Art. 15)
- [x] Geofencing de zonas restritas
- [x] Rate limiting por acao
- [x] Auto-moderacao (3 flags oculta, 5 remove, 3 removals suspende, 5 bane)
- [x] NSFW filter client-side (TensorFlow.js MobileNet)
- [x] Filtro de texto (palavroes, PII, ameacas)
- [x] Sistema de denuncias com 10 categorias
- [x] LGPD: export de dados + exclusao de conta

### Admin (Godmode)
- [x] Dashboard overview
- [x] Feature flags editor
- [x] Kill switch (IA desligada por padrao)
- [x] Audit log (append-only, imutavel)

---

## TABELAS DO BANCO

| Tabela | Proposito | Migration |
|--------|-----------|-----------|
| capsules | Capsulas + pings + todo conteudo geo | schema.sql |
| user_profiles | Perfil legal (extends auth.users) | migration_003 |
| access_logs | Logs Marco Civil Art. 15 | migration_003 |
| reports | Denuncias / flags | migration_003 |
| restricted_zones | Geofencing PostGIS | migration_003 |
| rate_limits | Limites por usuario/acao | migration_003 |
| admin_users | Roster de admins | migration_004 |
| admin_credentials | WebAuthn passkeys | migration_004 |
| audit_log | Log imutavel de acoes admin | migration_004 |
| error_events | Ingestao de erros client/server | migration_004 |
| feature_flags | Kill switches + config runtime | migration_004 |

---

## VARIAVEIS DE AMBIENTE

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Apenas 2 variaveis. Configurar tambem na Vercel (Environment Variables).

---

## FLUXO DO USUARIO

```
1. Landing page (index.html) → "Abrir app"
2. AuthGate → Google / Email / Telefone
3. TosModal → Aceitar termos (scroll obrigatorio)
4. LocationDisclaimer → Aceitar responsabilidade
5. PermissionGate → Camera + GPS
6. AR View → Camera ao vivo + capsulas 3D flutuando
7. Criar capsula → Tipo + mensagem + midia + trava temporal
8. Descobrir capsulas → Tocar no 3D → modal com conteudo
9. Denunciar → ReportModal → auto-moderacao
```

---

## PROXIMAS ETAPAS (PRIORIDADE)

### P0 — Bugs Criticos (fazer agora)

- [ ] **Shadowban nao aplicado na leitura**: `account_status = 'shadowbanned'`
  faz capsulas visiveis so para o autor, mas nao ha filtro no `getNearbyCapsules`.
  Solucao: Adicionar `WHERE created_by = current_user OR moderation_status = 'active'`
  no RPC ou filtrar client-side.

- [ ] **Email nao verificado permite criar conteudo**: Supabase envia link de
  confirmacao mas o app nao checa `email_confirmed_at`. Solucao: Verificar no
  profile load e mostrar tela "confirme seu e-mail" antes de prosseguir.

- [ ] **Geofence so no frontend**: O check de zona restrita roda apenas no
  client. Alguem com curl pode bypassar. Solucao: Adicionar validacao no
  insert trigger ou RPC do Supabase.

### P1 — Qualidade (proxima sprint)

- [ ] **Texto customizado na capsula**: O campo de mensagem existe no
  LeaveTraceButton mas o App.jsx ainda hardcoda 'Estive aqui!' em alguns paths.
  Unificar para sempre usar o texto digitado pelo usuario.

- [ ] **Restricoes de menores (ECA)**: `is_minor` existe na tabela mas nao e
  consultado no fluxo de criacao. Implementar: sem midia, sem ghost, max 5/dia.

- [ ] **Rate limits configuráveis**: Atualmente hardcoded em moderation.js.
  Mover para feature_flags para ajuste sem deploy.

- [ ] **Passkey enrollment no Godmode**: Schema de WebAuthn pronto, falta UI
  para registrar credenciais e verificar no login do admin.

### P2 — Growth (futuro proximo)

- [ ] **Compartilhamento de capsulas privadas**: Gerar link/QR code com
  coordenadas criptografadas. Quem recebe o link ve a capsula no mapa.

- [ ] **Perfil publico**: Pagina com capsulas do usuario, stats, badge de nivel.

- [ ] **Notificacoes push**: Quando alguem abre sua capsula ou quando uma
  capsula ghost esta prestes a expirar.

- [ ] **Gamificacao**: XP por criar/descobrir capsulas, niveis, badges,
  leaderboard por regiao.

- [ ] **Mapa 2D**: Visao alternativa (tipo Google Maps) mostrando capsulas
  como pins. Util para planejar rotas antes de sair.

### P3 — Escala (medio prazo)

- [ ] **Edge Functions**: Mover validacoes criticas (geofence, rate limit,
  content filter) para Supabase Edge Functions (server-side).

- [ ] **CDN para midia**: Cloudflare R2 ou similar para servir fotos/videos
  com cache global.

- [ ] **Analytics**: Mixpanel ou PostHog para metricas de retencao,
  capsulas criadas/abertas por dia, DAU/MAU.

- [ ] **Moderacao com IA**: Usar LLM para classificar denuncias automaticamente.
  Infraestrutura de kill switch ja esta pronta (feature_flags).

- [ ] **Internacionalizacao (i18n)**: App em portugues hardcoded. Preparar
  para ingles/espanhol.

---

## DOCUMENTOS LEGAIS

| Documento | Arquivo | Versao |
|-----------|---------|--------|
| Termos de Uso | TERMOS_DE_USO.md | 1.0.0 |
| Politica de Privacidade | POLITICA_DE_PRIVACIDADE.md | 1.0.0 |

Ambos referenciados no TosModal (aceite obrigatorio).

---

## COMMITS RECENTES

```
ea85d19  Fix 4 critical mobile UX bugs: camera, clicks, speed, z-index
5f498a4  (varios commits do outro computador - LP, godmode, video, realtime)
5a7e007  Fix OAuth loop: poll for session when hash tokens present
832dc05  Fix OAuth redirect: fully dynamic URL
76dca07  Fix Google OAuth login loop (4 bugs)
43683d2  Add email+password and phone+SMS auth options
645d1ab  Add NSFW image filter (TensorFlow.js)
6022875  Add legal documents: Terms of Use and Privacy Policy
995017a  Update tagline
839204b  Add PWA install prompt with iOS/Android dual-mode
3352945  Implement full compliance shield
b1dd8a0  Rebranding to XPortl
9e86aac  Initial commit - Xplore Core MVP
```

---

**XPortl — Deixe rastros. Encontre portais.**
