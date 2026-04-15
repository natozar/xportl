# XPORTL — Contexto Completo do Projeto

**Atualizado:** 15 de abril de 2026
**Repo:** https://github.com/natozar/xportl
**Deploy:** https://xportl.vercel.app
**Godmode:** https://xportl.vercel.app/godmode
**Supabase:** https://fjwxqgupupblfxbwvhio.supabase.co
**Owner:** Renato Rodrigues (natozar)

---

## 1. VISAO DO PRODUTO

Primeira rede social em realidade aumentada ancorada em coordenadas GPS reais.
Usuarios plantam capsulas do tempo digitais (texto, foto, audio, video) em locais
fisicos. Outros usuarios caminham pelo mundo real e descobrem esses portais
atraves da camera do celular.

**Tagline:** Deixe rastros. Encontre portais.

**Diferencial:** Capsulas autodestrutivas (Ghost), trava temporal, deteccao
espacial indoor (WebXR), gamificacao com XP/badges/leaderboard, moderacao
automatica com IA client-side (NSFW filter).

---

## 2. ARQUITETURA

```
index.html (Landing Page)    app.html (React App)         godmode.html (Admin)
   HTML puro / SEO               React 19 + A-Frame          React isolado
   OAuth redirect catch          AR.js GPS + NearbyOverlay   Metricas + Errors
        |                             |                           |
        +------------ Vite Multi-Entry Build ----------+----------+
                                      |
                               Vercel (auto-deploy)
                                      |
                           Supabase (Sao Paulo)
                           - PostgreSQL 15 + PostGIS 3.3
                           - Auth (Google OAuth, Email, Phone/SMS)
                           - Storage (capsule-media bucket, public)
                           - Realtime (postgres_changes on capsules)
```

### Stack Completa

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, A-Frame 1.3, AR.js, Leaflet, TensorFlow.js |
| Build | Vite 6, vite-plugin-pwa, Workbox |
| Backend | Supabase (PostgreSQL 15 + PostGIS 3.3 + Auth + Storage + Realtime) |
| Deploy | Vercel (auto-deploy on push to main) |
| DNS | Namecheap (xportl.com) |
| Moderacao | NSFW.js client-side + regex pt-BR + reports + auto-ban |
| Gamificacao | XP system + 20 badges + leaderboard + streaks |

### Variaveis de Ambiente

```
VITE_SUPABASE_URL=https://fjwxqgupupblfxbwvhio.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...(anon key)
```

Apenas 2 variaveis. Configuradas tambem na Vercel (Settings > Environment Variables).

---

## 3. ESTRUTURA DE ARQUIVOS

```
src/
├── main.jsx                    # App entry: PWA registration, app shell fade
├── App.jsx                     # State machine: auth → ToS → GPS → AR
│
├── components/
│   ├── AuthGate.jsx            # Login (Google, email, phone SMS)
│   ├── TosModal.jsx            # Termos de uso (scroll-to-accept)
│   ├── LocationDisclaimer.jsx  # Disclaimer geolocalizado
│   ├── PermissionGate.jsx      # GPS + Camera permission request
│   ├── ARScene.jsx             # A-Frame: entidades 3D GPS-based
│   ├── NearbyOverlay.jsx       # Compass-based markers (SEMPRE visivel)
│   ├── MapView.jsx             # Mapa 2D (Leaflet dark tiles)
│   ├── IndoorScene.jsx         # WebXR plane detection (indoor AR)
│   ├── BottomNav.jsx           # 5 tabs: Explorar/Mapa/Indoor/Criar/Perfil
│   ├── Radar.jsx               # Mini-radar com contagem
│   ├── LeaveTraceButton.jsx    # Criacao de capsula (tipo + texto + midia)
│   ├── CameraModal.jsx         # Captura foto/video fullscreen
│   ├── CapsuleModal.jsx        # Visualizar capsula + ghost bar + audio
│   ├── VortexModal.jsx         # Timeline de cluster (3+ capsulas)
│   ├── VibePing.jsx            # Emoji efemero (15s)
│   ├── ReportModal.jsx         # Denuncia (10 categorias)
│   ├── InstallPrompt.jsx       # PWA install (iOS/Android dual-mode)
│   ├── ProfilePage.jsx         # Avatar, nome, XP, badges, stats
│   ├── SettingsPage.jsx        # Termos, LGPD, export, delete, logout
│   ├── Leaderboard.jsx         # Top 50 por XP
│   └── XPToast.jsx             # Notificacao de XP ganho
│
├── services/
│   ├── supabase.js             # Client init (PKCE auth flow)
│   ├── auth.js                 # OAuth, email, phone, profile, ToS
│   ├── capsules.js             # CRUD + proximity queries + realtime
│   ├── storage.js              # Upload/delete midia (capsule-media bucket)
│   ├── clustering.js           # Vortex detection (3+ em 5m)
│   ├── moderation.js           # Content filter, rate limit, geofence, reports
│   ├── nsfwFilter.js           # TF.js NSFW classification (lazy-loaded)
│   ├── gamification.js         # XP, levels, badges, streaks, leaderboard
│   ├── pings.js                # Emoji efemeros (INSERT + auto-DELETE 15s)
│   ├── share.js                # Links compartilhaveis (base64 token)
│   ├── lgpd.js                 # Data export + account deletion
│   └── spatialEngine.js        # WebXR plane detection + hit testing
│
├── hooks/
│   ├── useGeolocation.js       # GPS watchPosition (retorna Promise)
│   ├── useCamera.js            # Permission check only (libera stream imediatamente)
│   ├── useMediaCapture.js      # Photo/audio/video + NSFW scan
│   └── usePwaInstall.js        # beforeinstallprompt + iOS detection
│
├── aframe/
│   └── registerComponents.js   # capsule-data, vortex-data, glitch-glow, ping-rise
│
├── godmode/
│   ├── main.jsx / App.jsx      # Admin shell (hash routing, idle timeout)
│   └── pages/
│       ├── Overview.jsx        # Metricas reais + grafico de erros 24h
│       ├── Errors.jsx          # Error events + AI diagnosis + Claude prompts
│       ├── Flags.jsx           # Feature flags editor
│       ├── KillSwitch.jsx      # IA safety controls
│       └── Audit.jsx           # Log imutavel
│
└── styles/global.css           # Tema cyberpunk (violet + cyan + orange)
```

---

## 4. BANCO DE DADOS (12 tabelas, 17 funcoes, 5 triggers)

| Tabela | Proposito | Migration |
|--------|-----------|-----------|
| capsules | Capsulas + pings + conteudo geo (21 colunas) | schema.sql + migration_002-009 |
| user_profiles | Perfil legal + XP + badges + streak | migration_003 + 010 |
| access_logs | Logs Marco Civil Art. 15 | migration_003 |
| reports | Denuncias (10 categorias) | migration_003 |
| restricted_zones | Geofencing PostGIS (location GENERATED) | migration_003 |
| rate_limits | Limites por usuario/acao | migration_003 |
| admin_users | Roster de admins (owner/moderator/observer) | migration_004 |
| admin_credentials | WebAuthn passkeys (schema pronto, UI pendente) | migration_004 |
| audit_log | Append-only, imutavel (triggers bloqueiam UPDATE/DELETE) | migration_004 |
| error_events | Ingestao de erros client/server + AI classification | migration_004 |
| feature_flags | Kill switches + config runtime (6 flags default) | migration_004 |
| xp_events | Ledger de XP (append-only) | migration_010 |

### Storage Bucket
- **capsule-media** (Public, 10MB limit)
- Policies: INSERT/SELECT/DELETE para bucket_id = 'capsule-media'

### Extensions
- postgis 3.3.7
- uuid-ossp 1.1

---

## 5. FLUXO DO USUARIO

```
1. Landing page (index.html) → CTA "Abrir app" → /app
2. AuthGate → Google OAuth / Email+senha / Telefone+SMS
3. Email verification (so para signup por email)
4. TosModal → Scroll ate o final → aceitar v1.0.0
5. LocationDisclaimer → Aceitar responsabilidade
6. PermissionGate → Camera + GPS (1 clique, ambos em paralelo)
7. AR View → Camera ao vivo + NearbyOverlay + A-Frame 3D
8. BottomNav → Explorar / Mapa / Indoor / Criar / Perfil
9. Criar capsula → Tipo + mensagem + midia + trava temporal
10. Descobrir → NearbyOverlay markers / AR 3D / Mapa pins
11. Gamificacao → XP + badges + leaderboard
```

---

## 6. FEATURES COMPLETAS

### Core AR
- [x] Capsulas geolocalizadas (A-Frame + AR.js GPS)
- [x] NearbyOverlay: markers compass-based (sempre visiveis, independente do GPS)
- [x] Smart placement: 0.3m offset na direcao do compass
- [x] 3 tipos: Perpetua, Ghost (autodestroi), Privada
- [x] Trava temporal (unlock_date)
- [x] Clustering "Vortex" (3+ capsulas em 5m)
- [x] Pings efemeros (emoji 15s)
- [x] Indoor AR (WebXR plane detection — Chrome/ARCore, Safari/LiDAR)

### Midia
- [x] Captura de foto (rear + selfie, NSFW scan antes do upload)
- [x] Gravacao de video (15s max, 5MB cap)
- [x] Gravacao de audio (30s max)
- [x] Player customizado (audio waveform, video inline)
- [x] Audio espacial (A-Frame sound, distance-based)

### Navegacao
- [x] BottomNav: 5 tabs (Explorar / Mapa / Indoor / Criar / Perfil)
- [x] Mapa 2D (Leaflet, CartoDB dark tiles, markers SVG, raio 50m)
- [x] Perfil (avatar upload, nome editavel, XP bar, badges, stats)
- [x] Settings (Termos, Privacidade, LGPD export/delete, logout)
- [x] Compartilhamento de capsulas (native share + clipboard fallback)

### Gamificacao
- [x] XP: create=25, ghost=40, media=35, discover=15, view=5
- [x] 20 badges (milestones, especiais, streaks, social, niveis)
- [x] Niveis: formula sqrt(xp/50)+1 (Novato → Oraculo)
- [x] Streaks diarios (3d/7d/30d com badges + XP bonus)
- [x] Leaderboard top 50
- [x] XP toast animado + level-up celebration

### Auth & Compliance
- [x] Google OAuth + Email/senha + Telefone SMS
- [x] Termos de Uso v1.0.0 (scroll obrigatorio)
- [x] Disclaimer de localizacao
- [x] Vedacao ao anonimato (CF Art. 5, IV)
- [x] Logs de acesso (Marco Civil Art. 15)
- [x] Geofencing server-side (trigger BEFORE INSERT)
- [x] Rate limiting configuravel (feature_flags)
- [x] Auto-moderacao (3 flags→oculta, 5→remove, 3 removals→suspende, 5→bane)
- [x] NSFW filter client-side (TensorFlow.js MobileNet, lazy-loaded)
- [x] Filtro de texto expandido (racismo, homofobia, ameacas, assedio, PII)
- [x] Sistema de denuncias (10 categorias)
- [x] LGPD: export JSON + exclusao com retencao Marco Civil
- [x] Restricoes de menores (ECA): sem midia, sem ghost, max 5/dia
- [x] Email verification gate (so para signup por email)

### Admin (Godmode)
- [x] Overview: metricas reais (users, capsulas, erros, denuncias)
- [x] Grafico SVG: erros por hora (24h) + top errors por tipo
- [x] Errors page: diagnostico IA + prompts copiáveis para Claude Code
- [x] Feature flags editor
- [x] Kill switch (IA desligada por padrao)
- [x] Audit log (append-only, imutavel)
- [x] Session separada do app (godmode nunca faz signOut)
- [x] Idle timeout 15min (lock local, sem logout)

### PWA
- [x] Service Worker (Workbox, auto-update, skip-waiting)
- [x] Install prompt (Android nativo + iOS instrucional)
- [x] Manifest completo (standalone, portrait, categories)
- [x] Offline fallback (app.html)
- [x] CDN caching (A-Frame 30d, Supabase media 3d)

---

## 7. BUGS RESOLVIDOS (HISTORICO — APRENDER COM ELES)

### Bug: OAuth login loop
**Sintoma:** Login Google voltava pra tela de login infinitamente.
**Causa:** getSession() rodava antes do Supabase processar o #access_token hash.
**Fix:** Usar onAuthStateChange como unica fonte de verdade + poll getSession()
quando hash tokens detectados na URL.
**Licao:** NUNCA chamar getSession() e onAuthStateChange em paralelo.

### Bug: Duplo clique para abrir portal (RECORRENTE — 5 tentativas de fix)
**Sintoma:** Precisava clicar 2x no "Abrir Portal" para a camera abrir.
**Causa real (final):** useCamera mantinha stream vivo que auto-release causava
re-render → TOKEN_REFRESHED resetava profile → legalGatesCleared flickava →
AR desmontava e remontava.
**Fix definitivo:** (1) Camera para stream IMEDIATAMENTE apos checar permissao.
(2) Profile NUNCA e nulled quando ready=true. (3) PermissionGate chama
onComplete via ref estavel (nao inline function). (4) ready=true e permanente.
**Licao:** Qualquer setState apos a transicao para AR pode causar re-render que
desmonta a cena. Estados "pos-transicao" devem ser IMUTAVEIS.

### Bug: Capsulas nao aparecem no AR
**Sintoma:** Capsula criada com sucesso mas invisivel na camera.
**Causa:** AR.js GPS-based posiciona entidades com precisao do GPS (±5-20m em
areas urbanas). A capsula existia mas flutuava no terreno vizinho.
**Fix:** Criado NearbyOverlay (compass-based) que SEMPRE mostra markers
direcionais independente da precisao do GPS. Offset reduzido para 0.3m.
**Licao:** GPS nao e confiavel para posicionamento preciso. Sempre ter fallback
visual baseado em compass/bearing.

### Bug: Tela preta ao clicar na capsula (modal bloqueava retorno)
**Sintoma:** Usuario tocava na capsula, tela ficava preta, sem como voltar.
**Causa:** (1) createPortal renderizava no body mas falhava em Safari mobile.
(2) handleClose era async — se selfDestruct travasse, modal nunca fechava.
(3) NearbyOverlay markers (z:9998) ficavam abaixo do UI overlay (z:9999).
**Fix:** Reescreveu CapsuleModal do zero — sem createPortal, sem async,
close SEMPRE sincrono. Botao "Fechar e voltar" grande. z-index: 10002.
NearbyOverlay subido para z:10000.
**Licao:** Em mobile, NUNCA usar createPortal (pode falhar silenciosamente).
NUNCA usar async em handleClose. SEMPRE ter botao de fechar obvio e grande.

### Bug: Godmode mapa vazio (nao mostra capsulas)
**Sintoma:** Pagina "mapa capsulas" no godmode carregava mas sem pins.
**Causa:** (1) CSP do godmode.html bloqueava Leaflet CSS (unpkg.com) e tiles
(cartocdn.com). (2) RLS da tabela capsules nao tinha policy para admins —
query retornava 0 rows.
**Fix:** (1) CSP atualizado com unpkg.com + cartocdn.com + openstreetmap.org.
(2) migration_011 adiciona policy "Admins can read all capsules".
**Licao:** Cada HTML entry (app.html, godmode.html) tem seu PROPRIO CSP.
Ao adicionar features com recursos externos, atualizar TODOS os CSPs.
Admins precisam de policies de SELECT separadas para ver tudo.

### Bug: Clicar na capsula nao abre nada (modal invisivel)
**Sintoma:** Capsula aparecia no NearbyOverlay, usuario tocava, nada acontecia.
**Causa:** CapsuleModal tinha z-index:100. O overlay de UI (NearbyOverlay,
Radar, FAB) tinha z-index:9999. O modal renderizava mas ficava ATRAS de tudo.
**Fix:** Todos os modais (CapsuleModal, VortexModal, Leaderboard, ReportModal)
subidos para z-index:10000.
**Licao:** Ao subir z-index de overlays de UI, SEMPRE verificar se modais que
abrem por cima tambem foram atualizados. Manter hierarquia documentada:
  0 = AR canvas | 5 = scanlines | 9998 = NearbyOverlay | 9999 = UI overlay
  10000 = modais | 10001 = XP toast

### Bug: Botoes da camera nao funcionam no Android
**Sintoma:** Shutter, flip, mode buttons nao respondiam ao toque.
**Causa:** O elemento <video> (position:absolute inset:0) interceptava todos
os touch events antes dos botoes renderizados "em cima".
**Fix:** pointerEvents:'none' no video, pointerEvents:'auto' + touchAction:
'manipulation' em cada botao.
**Licao:** Em mobile, SEMPRE verificar que elementos fullscreen nao roubam
touch events. Video/canvas = pointerEvents:none.

### Bug: Mapa 2D quebrado (tela vazia)
**Sintoma:** Tab Mapa nao renderizava tiles nem markers.
**Causa:** CSP (Content Security Policy) bloqueava Leaflet CSS de unpkg.com e
tiles de basemaps.cartocdn.com.
**Fix:** Adicionado unpkg.com ao style-src e cartocdn.com/openstreetmap.org ao
img-src no CSP.
**Licao:** Ao adicionar dependencias que carregam recursos externos, SEMPRE
atualizar o CSP.

### Bug: Godmode carregava o app
**Sintoma:** /godmode mostrava "Abrir Portal" em vez do painel admin.
**Causa:** Service Worker navigateFallback='/app.html' interceptava /godmode.
**Fix:** Adicionado /^\/godmode/ ao navigateFallbackDenylist no workbox config.
**Licao:** Service Workers interceptam TODAS as rotas de navegacao. Rotas fora
do SPA principal DEVEM estar na denylist.

### Bug: "column rz.location does not exist"
**Sintoma:** INSERT em capsules falhava com erro de coluna.
**Causa:** A coluna location (GENERATED ALWAYS) na tabela restricted_zones nao
foi criada porque PostGIS nao estava ativo quando a migration rodou.
**Fix:** ALTER TABLE ADD COLUMN IF NOT EXISTS location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED.
**Licao:** Colunas GENERATED que dependem de extensoes (PostGIS) podem falhar
silenciosamente. Sempre verificar com SELECT column_name apos migration.

### Bug: Capsule creation freezing ("Ancorando..." infinito)
**Sintoma:** App travava em "Ancorando nas coordenadas..." sem feedback.
**Causa:** RPCs de compliance (checkRateLimit, checkRestrictedZone) podiam
travar se a funcao SQL nao existia ou a rede caia.
**Fix:** safeCheck() wrapper que races cada RPC contra timeout de 5s. Fail-open.
XP/badges/logAccess rodando com .catch(() => {}).
**Licao:** NUNCA depender de RPC para fluxo principal sem timeout. Fail-open
para checks nao-criticos.

---

## 8. PROXIMAS ETAPAS

### Pendente — Quality
- [ ] Passkey enrollment no Godmode (schema pronto, falta UI)
- [ ] Teste end-to-end no iPhone Safari (PWA + AR + camera)
- [ ] Teste offline mode (capsulas em queue local)

### Pendente — Growth
- [ ] Notificacoes push (alguem abriu sua capsula)
- [ ] Perfil publico (pagina com capsulas do usuario)
- [ ] Deep linking melhorado (compartilhar com preview OG)

### Pendente — Escala
- [ ] Edge Functions (validacoes server-side)
- [ ] CDN para midia (Cloudflare R2)
- [ ] Analytics (PostHog ou Mixpanel)
- [ ] Moderacao com LLM (classificar denuncias)
- [ ] i18n (ingles/espanhol)

### Pendente — Inovacao
- [ ] Melhorar Indoor AR com mesh rendering (Three.js)
- [ ] Audio espacial reativo (som muda com proximidade)
- [ ] Capsulas em grupo (escape rooms multiplayer)
- [ ] AR Cloud persistence (capsulas ancoradas em features visuais)

---

## 9. DECISOES TECNICAS IMPORTANTES

### Por que NearbyOverlay em vez de so AR.js?
AR.js GPS-based depende de precisao GPS (±5-20m em cidades). Em ambientes
indoor ou urbanos densos, as entidades 3D ficam invisiveis porque estao
posicionadas metros de onde deveriam. NearbyOverlay usa compass/bearing para
mostrar DIRECAO, nao posicao absoluta. Funciona em qualquer precisao de GPS.

### Por que camera permission check libera stream imediatamente?
Manter o stream vivo causava conflito com AR.js (ambos queriam o device lock
da camera traseira). No iOS, dois consumers na mesma camera = NotReadableError.
A solucao: pedir permissao, confirmar grant, PARAR o stream, deixar AR.js
criar o proprio.

### Por que ready=true e permanente?
TOKEN_REFRESHED do Supabase auth causa setSession() que re-triggera loadProfile()
que pode nullificar profile momentaneamente. Se ready dependesse de profile, o
AR desmontaria e remontaria (causando o bug "abre e fecha"). Solucao: ready=true
e um estado terminal — so SIGNED_OUT pode resetar.

### Por que TensorFlow.js lazy-loaded?
O chunk nsfw-ai tem 41MB. Se fosse carregado no boot, o app levaria 20s+ para
abrir. Com lazy-load, so carrega quando o usuario abre o painel de criacao e
tira uma foto. O boot fica em <2s.

### Por que Godmode nao faz signOut?
Godmode e app compartilham o mesmo Supabase client (mesmo localStorage).
Se godmode faz signOut, mata a sessao do app. Solucao: godmode so NAVEGA
para /app, nunca chama signOut. A sessao e compartilhada, o acesso e separado.

---

## 10. COMMITS (HISTORICO COMPLETO)

```
d81afba  Fix godmode map empty: RLS blocked admin from reading capsules
083da2a  Fix godmode map: CSP blocked Leaflet CSS and map tiles
258eb3d  Rewrite CapsuleModal from scratch — simple, always works
83830f4  Fix: modal close was async and could hang
f44c821  Fix capsule click + godmode back button
7529d29  Add Capsule Map to Godmode
dcbeb20  NUCLEAR FIX: sessionStorage ready + portal fixes
be3a515  Update PROJETO.md with modal z-index bug
1af5408  Fix capsule modal invisible on tap: z-index below UI overlay
7187a7a  Complete rewrite of PROJETO.md with full project memory
3880080  DEFINITIVE fix: single-click portal + exact GPS placement
aa2ee07  Add compass-based NearbyOverlay — capsules ALWAYS visible now
80404d6  Smart capsule placement + definitive single-click portal fix
d084e61  Fix 3 runtime bugs found by audit
462d8f0  Reduce capsule plant offset from 6m to 1.5m
49fde6b  Fix Indoor tab showing black screen on unsupported devices
2d55975  Fix map tab (CSP blocking tiles/CSS) + add scan logging
f571299  Rebuild Godmode: real metrics, error charts, AI fix suggestions
c180538  Fix godmode loading app instead of admin panel
133af65  Fix double-click: PermissionGate now calls onComplete directly
75a4ed6  Add Errors page to Godmode + rich error context logging
10b4c87  Fix capsule creation: fallback insert-only if select fails on RLS
b97eb1b  Separate godmode from app session lifecycle
cc6020b  Fix camera restart loop: stop releasing stream before AR mounts
f652846  Fix double-click to open: GPS now returns Promise, awaits both
8a73423  Fix capsule creation freezing: add timeouts + fail-safe to all RPCs
86b5d40  Add detailed error logging for capsule creation failures
c59a9e4  Fix 15 mobile QA issues (5 critical + 7 medium + 3 low)
2675ed2  Add gamification system (XP, levels, badges, leaderboard)
194e7df  Add Indoor Spatial AR mode (WebXR plane detection + hit testing)
a6d3c1d  Add 2D Map view with Leaflet
293efba  Fix CameraModal: all buttons unresponsive on Android/iOS
f8d7cb5  Add bottom navigation bar, profile page, and settings
20b82c8  Add capsule sharing + update roadmap status
49e1adf  Fix P0 bugs + P1 quality improvements (6 items)
332828f  Add PROJETO.md
ea85d19  Fix 4 critical mobile UX bugs
5f498a4  fix: AR overlay buttons + iOS home gesture zone
f4e6381  fix: AR scene readiness check
19ddbaf  polish: camera modal + panel pass
9393a4f  fix: camera robustness + brighter portal visual
b113b45  fix: CameraModal release/restore AR.js camera
66350d5  feat: fullscreen camera modal with live preview + 15s video
6321639  feat: text message input, selfie camera
0b832ae  fix: offset planted capsules + restore camera fallback
263db4f  chore: rewrite migration_006 for full schema gap
645d1ab  Add NSFW image filter (TensorFlow.js)
6022875  Add legal documents: Terms of Use and Privacy Policy
995017a  Update tagline: Deixe rastros. Encontre portais.
79acd06  Remove Apple Sign In (requires $99/yr)
839204b  Add PWA install prompt with iOS/Android dual-mode
3352945  Implement full compliance shield (LGPD + Marco Civil + CF/88 + ECA)
b1dd8a0  Rebranding to XPortl
9e86aac  Initial commit - Xplore Core MVP
```

---

## 11. DOCUMENTOS LEGAIS

| Documento | Arquivo | Versao |
|-----------|---------|--------|
| Termos de Uso | TERMOS_DE_USO.md | 1.0.0 |
| Politica de Privacidade | POLITICA_DE_PRIVACIDADE.md | 1.0.0 |

---

## 12. CONTATOS E ACESSOS

- **GitHub:** github.com/natozar/xportl (privado)
- **Vercel:** xportl.vercel.app (auto-deploy on push)
- **Supabase:** fjwxqgupupblfxbwvhio.supabase.co
- **Google OAuth:** configurado no Google Cloud Console
- **Supabase Auth Providers:** Google (ativo), Email (ativo), Phone (desativado — requer Twilio)

---

**XPortl — Deixe rastros. Encontre portais.**
