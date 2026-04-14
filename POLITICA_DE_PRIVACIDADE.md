# POLITICA DE PRIVACIDADE — XPORTL

**Versao:** 1.0.0
**Data de vigencia:** 13 de abril de 2026
**Ultima atualizacao:** 13 de abril de 2026
**Legislacao aplicavel:** Lei n. 13.709/2018 (LGPD), Lei n. 12.965/2014 (Marco Civil da Internet)

---

## 1. INTRODUCAO

### 1.1. Compromisso com a privacidade

A XPortl ("nos", "nosso" ou "Plataforma") tem compromisso firme com a protecao dos dados pessoais de seus Usuarios. Esta Politica de Privacidade descreve, de forma transparente, quais dados coletamos, por que coletamos, como os utilizamos, com quem os compartilhamos e quais direitos voce possui sobre eles.

### 1.2. Controlador de dados

Para fins da LGPD, a XPortl atua como CONTROLADORA dos dados pessoais tratados por meio do Aplicativo.

### 1.3. Encarregado de protecao de dados (DPO)

Duvidas, solicitacoes ou reclamacoes relativas ao tratamento de dados pessoais podem ser direcionadas ao nosso Encarregado de Dados pelo canal: privacidade@xportl.com

---

## 2. DADOS QUE COLETAMOS

### 2.1. Dados de autenticacao

| Dado | Origem | Finalidade | Base legal (LGPD) |
|------|--------|------------|-------------------|
| Nome completo | Google OAuth | Identificacao do Usuario | Art. 7, V — Execucao de contrato |
| Endereco de e-mail | Google OAuth | Comunicacoes e recuperacao de conta | Art. 7, V — Execucao de contrato |
| Foto de perfil | Google OAuth | Exibicao no perfil (opcional) | Art. 7, I — Consentimento |
| Identificador unico (User ID) | Gerado internamente | Vinculacao de autoria | Art. 7, V — Execucao de contrato |

### 2.2. Dados de geolocalizacao

| Dado | Quando e coletado | Finalidade | Base legal (LGPD) |
|------|-------------------|------------|-------------------|
| Latitude e longitude (GPS) | Enquanto o Aplicativo esta aberto e ativo em primeiro plano | Posicionamento de Capsulas no mapa e busca por proximidade | Art. 7, I — Consentimento explicito |
| Altitude (quando disponivel) | Durante a criacao de Capsulas | Ancoragem vertical de conteudo AR | Art. 7, I — Consentimento explicito |
| Precisao do sinal GPS | Durante o uso ativo | Controle de qualidade do posicionamento | Art. 7, IX — Legitimo interesse |

**IMPORTANTE — COMO FUNCIONA A COLETA DE GPS:**

a) O Aplicativo solicita permissao de acesso a geolocalizacao **apenas uma vez**, no primeiro uso, por meio de pop-up nativo do navegador.

b) A coleta de coordenadas ocorre **exclusivamente enquanto o Aplicativo esta aberto e visivel na tela** (primeiro plano). NAO coletamos localizacao em segundo plano.

c) As coordenadas sao utilizadas **em tempo real** para duas finalidades especificas: (i) ancorar Capsulas criadas pelo Usuario nas coordenadas exatas do momento da criacao; e (ii) buscar Capsulas proximas ao Usuario em um raio predefinido.

d) As coordenadas do Usuario em transito **NAO sao armazenadas em nossos servidores** como historico de deslocamento. Apenas as coordenadas das Capsulas criadas sao persistidas.

e) O Usuario pode revogar a permissao de geolocalizacao a qualquer momento nas configuracoes do navegador ou sistema operacional. A revogacao impedira o funcionamento das funcionalidades principais do Aplicativo.

### 2.3. Dados da camera

| Dado | Tratamento | Armazenamento |
|------|------------|---------------|
| Feed da camera (video em tempo real) | Processado localmente no dispositivo para renderizacao de realidade aumentada | **NUNCA e enviado aos nossos servidores** |
| Fotos capturadas para Capsulas | Enviadas ao servidor apenas quando o Usuario escolhe deliberadamente anexar uma foto a uma Capsula | Armazenado no Supabase Storage enquanto a Capsula existir |

**DECLARACAO SOBRE A CAMERA:**

O acesso a camera traseira do dispositivo e utilizado **exclusivamente** para renderizar o ambiente fisico do Usuario em tempo real, sobrepondo elementos de realidade aumentada (as Capsulas 3D). O fluxo de video da camera:

a) E processado **integralmente no dispositivo** do Usuario (client-side);

b) **NAO e gravado, capturado, transmitido ou armazenado** pela XPortl em nenhum momento;

c) **NAO e utilizado** para reconhecimento facial, rastreamento visual ou qualquer forma de vigilancia;

d) E descartado instantaneamente apos a renderizacao de cada quadro (frame).

A UNICA excecao e quando o proprio Usuario, por ato voluntario, escolhe capturar uma foto para anexar a uma Capsula. Neste caso, uma unica imagem estatica e capturada, convertida para formato WebP e enviada ao nosso armazenamento. O Usuario pode excluir esta imagem a qualquer momento ao deletar a Capsula correspondente.

### 2.4. Dados de acesso e registros de conexao

| Dado | Finalidade | Retencao | Base legal (LGPD) |
|------|------------|----------|-------------------|
| Endereco IP | Rastreabilidade legal (Marco Civil, Art. 15) | 6 meses (minimo legal), ate 12 meses | Art. 7, II — Obrigacao legal |
| User-Agent (navegador/dispositivo) | Rastreabilidade e compatibilidade tecnica | 6 a 12 meses | Art. 7, II — Obrigacao legal |
| Data e hora de acesso | Registros de conexao | 6 a 12 meses | Art. 7, II — Obrigacao legal |
| Acoes realizadas (criar, visualizar, denunciar) | Auditoria de seguranca e moderacao | 6 a 12 meses | Art. 7, II — Obrigacao legal |

**FUNDAMENTACAO:**

A coleta e guarda destes registros e uma OBRIGACAO LEGAL imposta pelo artigo 15 da Lei n. 12.965/2014 (Marco Civil da Internet), que determina que provedores de aplicacao mantenham registros de acesso a aplicacoes de internet, sob sigilo, pelo prazo de 6 (seis) meses. O descumprimento desta obrigacao sujeita a empresa a sancoes legais.

### 2.5. Dados que NAO coletamos

Para total transparencia, a XPortl declara que **NAO** coleta:

- Historico de deslocamento ou rotas do Usuario;
- Contatos da agenda telefonica;
- Mensagens SMS ou de outros aplicativos;
- Dados biometricos (facial, digital, iris);
- Dados financeiros ou de cartao de credito;
- Conteudo de outras aplicacoes instaladas no dispositivo;
- Localizacao em segundo plano (background).

---

## 3. COMO UTILIZAMOS SEUS DADOS

### 3.1. Finalidades especificas

| Finalidade | Dados utilizados | Base legal |
|------------|-----------------|------------|
| Autenticacao e manutencao de sessao | E-mail, User ID | Execucao de contrato |
| Criacao e exibicao de Capsulas | Coordenadas GPS, conteudo do Usuario | Consentimento |
| Busca por Capsulas proximas | Coordenadas GPS em tempo real | Consentimento |
| Moderacao de conteudo | Conteudo, metadados, denuncias | Legitimo interesse |
| Cumprimento de obrigacoes legais | IP, User-Agent, logs de acesso | Obrigacao legal |
| Resposta a ordens judiciais | Vinculacao User ID ↔ conteudo + logs | Obrigacao legal |
| Melhoria do servico | Dados agregados e anonimizados | Legitimo interesse |

### 3.2. Principio da minimizacao

Coletamos apenas os dados estritamente necessarios para cada finalidade descrita acima, em conformidade com o principio da necessidade (Art. 6, III, LGPD).

---

## 4. COMPARTILHAMENTO DE DADOS

### 4.1. Regra geral

A XPortl NAO vende, aluga ou comercializa dados pessoais de seus Usuarios em nenhuma circunstancia.

### 4.2. Compartilhamento limitado

Seus dados poderao ser compartilhados exclusivamente nas seguintes hipoteses:

| Destinatario | Dados compartilhados | Motivo | Base legal |
|--------------|---------------------|--------|------------|
| Supabase (infraestrutura) | Dados armazenados (criptografados) | Hospedagem de banco de dados e armazenamento | Execucao de contrato |
| Vercel (hospedagem) | Logs de acesso web | Hospedagem da aplicacao | Execucao de contrato |
| Autoridades publicas | Registros de acesso e identificacao | Ordem judicial especifica | Art. 7, II — Obrigacao legal |
| SaferNet Brasil / Policia Federal | Dados completos do Usuario infrator | Conteudo envolvendo CSAM ou terrorismo | Art. 7, II — Obrigacao legal |

### 4.3. Transferencia internacional

Nossos provedores de infraestrutura (Supabase, Vercel) podem processar dados em servidores localizados fora do Brasil. Nestes casos, asseguramos que os provedores adotam niveis de protecao de dados compativeis com a LGPD, conforme artigo 33.

---

## 5. ARMAZENAMENTO E SEGURANCA

### 5.1. Medidas de seguranca

A XPortl adota as seguintes medidas tecnicas e organizacionais para protecao dos dados:

a) Criptografia em transito (TLS/HTTPS) para todas as comunicacoes;

b) Criptografia em repouso para dados sensiveis (hashes de CPF, telefone);

c) Controle de acesso baseado em funcoes (Row Level Security) no banco de dados;

d) Isolamento logico dos dados por Usuario;

e) Monitoramento de acessos anomalos e tentativas de intrusao;

f) Backups automatizados com retencao controlada.

### 5.2. Periodos de retencao

| Tipo de dado | Periodo de retencao | Fundamentacao |
|--------------|--------------------|----|
| Dados de perfil | Enquanto a conta estiver ativa | Execucao de contrato |
| Conteudo de Capsulas | Ate exclusao pelo Usuario ou autodestruicao programada | Execucao de contrato |
| Midias (fotos, audios) | Ate exclusao da Capsula associada | Execucao de contrato |
| Registros de acesso (IP, logs) | 6 a 12 meses apos a coleta | Marco Civil, Art. 15 |
| Dados pos-exclusao de conta | 6 meses (retencao legal segregada) | Marco Civil, Art. 15 |

---

## 6. SEUS DIREITOS (LGPD, Art. 18)

### 6.1. Direitos garantidos

Como titular de dados pessoais, voce possui os seguintes direitos:

a) **Confirmacao e acesso:** Confirmar a existencia de tratamento e acessar seus dados;

b) **Correcao:** Solicitar a correcao de dados incompletos, inexatos ou desatualizados;

c) **Anonimizacao, bloqueio ou eliminacao:** Solicitar a anonimizacao, bloqueio ou eliminacao de dados desnecessarios ou excessivos;

d) **Portabilidade:** Solicitar a exportacao de seus dados em formato legivel por maquina (JSON);

e) **Eliminacao:** Solicitar a eliminacao dos dados pessoais tratados com base em consentimento;

f) **Informacao sobre compartilhamento:** Saber com quais entidades seus dados foram compartilhados;

g) **Revogacao de consentimento:** Revogar o consentimento a qualquer momento, sem prejuizo da legalidade do tratamento realizado anteriormente.

### 6.2. Como exercer seus direitos

Os direitos descritos acima podem ser exercidos:

a) Diretamente pelo Aplicativo, na secao "Meus Dados";

b) Por e-mail ao Encarregado de Dados: privacidade@xportl.com;

c) Prazo de resposta: ate 15 (quinze) dias uteis, conforme Art. 18, paragrafo 5, da LGPD.

### 6.3. Exportacao de dados

O Usuario pode exportar todos os seus dados (perfil, Capsulas criadas, denuncias realizadas e logs de atividade) em formato JSON por meio da funcionalidade "Exportar Meus Dados" disponivel nas configuracoes do Aplicativo.

### 6.4. Exclusao de conta

O Usuario pode solicitar a exclusao de sua conta a qualquer momento. Ao faze-lo:

a) O nome de exibicao sera substituido por "[Conta removida]" em todos os conteudos publicos;

b) Dados pessoais identificaveis (nome, e-mail, foto) serao apagados;

c) **Excecao legal:** Os registros de acesso (IP, datas, acoes) serao RETIDOS pelo prazo de 6 (seis) meses conforme obrigacao imposta pelo artigo 15 da Lei n. 12.965/2014 (Marco Civil da Internet). Durante este periodo, os dados serao mantidos de forma segregada, criptografada e acessiveis exclusivamente para cumprimento de ordens judiciais;

d) A vinculacao interna entre a identidade do Usuario e o conteudo criado sera mantida durante o periodo de retencao legal e permanentemente eliminada ao termino deste prazo, salvo determinacao judicial em contrario;

e) Midias (fotos e audios) associadas as Capsulas do Usuario serao permanentemente excluidas do armazenamento.

---

## 7. COOKIES E TECNOLOGIAS DE RASTREAMENTO

### 7.1. Uso minimo

O Aplicativo utiliza cookies e armazenamento local (localStorage) exclusivamente para:

a) Manutencao da sessao de autenticacao;

b) Armazenamento de preferencias locais do Usuario (ex.: status de instalacao do PWA);

c) Funcionamento do Service Worker para acesso offline (cache de recursos estaticos).

### 7.2. Ausencia de rastreamento publicitario

A XPortl NAO utiliza cookies de terceiros para fins publicitarios, NAO implementa pixels de rastreamento e NAO compartilha dados de navegacao com redes de publicidade.

---

## 8. MENORES DE IDADE

### 8.1. Idade minima

O Aplicativo e destinado a Usuarios com idade minima de 13 (treze) anos, em conformidade com praticas internacionais de protecao a menores no ambiente digital.

### 8.2. Consentimento parental

Usuarios entre 13 (treze) e 18 (dezoito) anos devem utilizar o Aplicativo com consentimento de seus responsaveis legais.

### 8.3. Restricoes para menores

Usuarios identificados como menores de 18 (dezoito) anos estao sujeitos a restricoes automaticas, incluindo impossibilidade de envio de midia, criacao de Capsulas fantasma e limites diarios de criacao, conforme previsto no Estatuto da Crianca e do Adolescente (Lei n. 8.069/1990).

---

## 9. ALTERACOES NESTA POLITICA

### 9.1. Atualizacoes

Esta Politica de Privacidade podera ser atualizada periodicamente para refletir mudancas em nossas praticas, na legislacao aplicavel ou nas funcionalidades do Aplicativo.

### 9.2. Notificacao

Alteracoes substanciais serao comunicadas por meio de notificacao no Aplicativo, com destaque para as modificacoes realizadas.

### 9.3. Historico

O historico de versoes desta Politica sera mantido e disponibilizado publicamente para consulta.

---

## 10. CONTATO

Para exercer seus direitos, esclarecer duvidas ou registrar reclamacoes sobre o tratamento de seus dados pessoais:

**Encarregado de Protecao de Dados (DPO)**
E-mail: privacidade@xportl.com

**Autoridade Nacional de Protecao de Dados (ANPD)**
Caso entenda que o tratamento de seus dados viola a LGPD, voce tem direito de peticionar a ANPD: https://www.gov.br/anpd

---

**XPortl — Deixe rastros. Encontre portais.**
