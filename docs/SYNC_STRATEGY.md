# Estratégia de sincronização — Etapa 5

> Estado após a subetapa 5.3: a aplicação continua online-first para quizzes e envio de operações. O pull incremental de conteúdo foi implementado em `GET /api/sync/content`; alterações de foco, matéria e pergunta são registradas em uma trilha transacional e aplicadas ao Dexie por conta. A UI ainda não aciona o pull automaticamente. A outbox continua sem envio e não há sincronização de respostas offline.

## Contrato online existente

- `POST /api/quizzes/sessions` escolhe perguntas no servidor e persiste `QuizSessionQuestion` com posição e snapshot completo.
- `GET /api/quizzes/sessions/:id` devolve a sessão; itens pendentes têm gabarito, justificativa e resposta esperada ocultos.
- A resposta é enviada a `POST /api/quizzes/sessions/:id/questions/:questionId/answer`. O cliente envia discriminador, seleção ou autoavaliação discursiva, UUID `idempotencyKey` e duração. O backend deriva o usuário do JWT, verifica o item do manifesto e calcula `isCorrect` usando o snapshot persistido.
- A chave de resposta é única por usuário em `QuestionAttempt`; repetir a mesma operação é reconhecido e reutilização incompatível conflita.
- `POST /api/quizzes/sessions/:id/questions/:questionId/skip` atualmente não recebe nem armazena chave de idempotência. Uma repetição pode responder `409`, portanto pulo não pode entrar em uma fila offline antes de receber idempotência persistida no servidor.
- `POST /api/quizzes/sessions/:id/complete` é online e o servidor só conclui manifesto sem itens pendentes.
- `packages/shared/src/types/index.ts` ainda contém DTOs genéricos de sync legados (`SyncPushPayload`/`SyncQueueItem`) não usados pelas rotas. Eles aceitam objetos amplos como `QuestionAttempt`, que incluem identidade/resultado/snapshot. Não reutilizar esses tipos como payload de sincronização; substituí-los por schemas restritos antes de criar os endpoints.

## Auditoria do cliente

- `apps/frontend/src/db/index.ts` define `BokkenLocalDB` v2, mantendo sem mudança a tabela v1 `session` (`key`, `userId`) e acrescentando stores locais com chave composta por usuário/registro. `AuthContext` ainda é o único fluxo da aplicação que persiste dados; não há cache de conteúdo ou quiz populado.
- `apps/frontend/src/db/outbox.ts` injeta o proprietário a partir da sessão ativa, limita claim aos registros dessa conta, devolve o token emparelhado à mesma sessão e aplica transições explícitas da fila. Logout/troca de conta não remove outbox. Esses helpers preparam a persistência e o isolamento; não implementam envio/reconexão.
- `AuthContext` restaura a sessão local mesmo sem rede. A validação com `/auth/me` ocorre quando `navigator.onLine` informa online; esse sinal não garante que a API esteja acessível nem que o JWT continue válido.
- Logout remove apenas `active_session`. Ainda não há dados de conteúdo para isolar; quando forem adicionados, a troca de conta deve filtrar cada tabela por `userId`, preservar outbox pendente da conta anterior e impedir sua exibição ou envio sob outra conta.
- As telas carregam focos/matérias/perguntas por `contentApi` e sessões por `quizApi`; falha de rede vira `ApiError` status 0. A página de quiz guarda sessão e `answerKeys` em estado React/ref, que se perde ao fechar ou recarregar.
- O manifest e os ícones estão em `apps/frontend/public`; o build de produção gera e registra `sw.js`. O precache lista somente HTML, JS, CSS e assets estáticos necessários; navegações usam `/index.html` como fallback quando a rede falha. `index.html` não depende de Google Fonts. O registro é desativado em desenvolvimento.

## Arquitetura recomendada para o MVP

### Identidade e proteção dos dados locais

O primeiro login/bootstrap exige internet. O servidor continua derivando `userId` do JWT em todas as rotas. Cada registro Dexie (conteúdo, sessão, item, cursor e operação) carrega `userId`; leituras e gravações sempre filtram pela identidade local ativa. Cache/outbox não é apagado ao trocar de conta, mas fica inacessível na UI da outra conta e não é sincronizado até a conta proprietária autenticar novamente.

O JWT continua armazenado em IndexedDB sem criptografia e acessível ao JavaScript da origem. Isso não equivale a armazenamento seguro contra XSS. Há duas opções: (a) manter JWT persistido para conveniência, aceitando a exposição em repouso e reduzindo duração/escopo; (b) manter JWT de acesso somente em memória e, após autenticação online inicial, desbloquear cache local por credencial de dispositivo derivada com KDF e criptografia Web Crypto. A opção (b) é recomendada; exige fluxo explícito de desbloqueio offline e recuperação de conta, e não protege contra XSS enquanto o app está desbloqueado. Reautenticação online da mesma conta emite novo JWT apenas em memória para sincronizar. `401` mantém a outbox intacta; nunca reatribuir operações nem usar desbloqueio offline como autorização para API. Esta entrega não altera o fluxo de autenticação existente.

### App shell e PWA

**Implementado na subetapa 5.2:** Vite gera manifest, ícones e Service Worker. O precache inclui o HTML, bundles JS/CSS, manifest, favicon e ícones; navegações usam o HTML da SPA como fallback. A lista de arquivos é explícita e calculada para cada build. O worker não atende chamadas `/api/`, requisições com `Authorization` nem armazena respostas dinâmicas. Atualizações aguardam ação explícita do usuário; após ativar a nova versão, o controller muda e a página recarrega. O primeiro acesso requer rede. A estratégia não disponibiliza conteúdo nem quiz offline.

### Conteúdo e cursor incremental — implementado na subetapa 5.3

`GET /api/sync/content?cursor=<opaco>&limit=<n>` é autenticado. O usuário vem exclusivamente do JWT. Sem cursor, o servidor inicia o pull na primeira sequência registrada; com cursor, retorna mudanças posteriores ao marcador até o watermark fixado na primeira página. Cada evento tem sequência monotônica por usuário, atribuída atualizando `ContentSyncState` dentro da mesma transação que altera o conteúdo e grava `ContentSyncChange`. O lock da linha de estado serializa as sequências do mesmo usuário; commits ocorridos depois da captura do watermark entram na rodada seguinte.

O cursor é autenticado e cifrado com AES-256-GCM, contém `userId`, sequência posterior e watermark e é vinculado ao dono. Alteração, formato inválido ou uso por outra conta resulta em 400. Limite aceito: 1–200 (padrão 100). Cada página ordena por sequência; o cursor só avança ao final da página. Uma sincronização interrompida repete a página ainda não confirmada; páginas concluídas continuam a partir do watermark e capturam eventos novos.

Como a chave de cursor é derivada do `JWT_SECRET`, rotacionar esse segredo invalida cursores existentes; após receber 400 por cursor inválido, o cliente deve limpar apenas o cursor de conteúdo daquela conta e iniciar um bootstrap novo. O feed não é compactado nesta fase.

A migração aditiva `20261110000000_add_content_sync_feed` cria `content_sync_states` e `content_sync_changes` e faz backfill do estado atual dos focos, matérias e perguntas existentes, incluindo tombstones de registros já excluídos. Os serviços CRUD gravam UPSERTs e tombstones na transação de escrita. Exclusões em cascata são registradas pergunta→matéria→foco. Não há retenção/compactação do feed nesta subetapa; qualquer limpeza exigirá política de expiração de cursor e ressincronização integral.

Os DTOs de sincronização são próprios e estritos. Para múltipla escolha enviam texto/ordem/ID das alternativas necessárias à apresentação, sem `isCorrect`; não enviam `explanation` ou `expectedAnswer`. Para discursivas também não enviam resposta esperada. O cliente grava em transação Dexie somente stores de conteúdo e cursor da conta ativa. Valida novamente a sessão ativa e o cursor usado pela requisição antes de aplicar a página; tombstones apagam apenas a chave composta `[userId, id]`. Sessões, tentativas e outbox não são alteradas.

### Sessões, snapshots e estudo offline

Sessões continuam sendo criadas online em `POST /api/quizzes/sessions`, que persiste a lista completa e ordenada no manifesto. Depois, o cliente grava em Dexie a sessão, todos os itens (inclusive `PENDING`, `SKIPPED` e sem resposta) e o material de apresentação suficiente para retomar após fechar/atualizar a página.

Uma alternativa é adaptar `GET /api/quizzes/sessions/:id` para oferecer pacote persistível; outra é criar rota explícita de download offline do manifesto. Em ambos os casos o escopo é proprietário+JWT e `questionId`/ordem/snapshot vêm do servidor. O cliente pode enfileirar uma seleção, mas não envia snapshot, gabarito, `isCorrect`, `userId`, datas civis ou totais. O servidor recalcula escolhas múltiplas com `QuizSessionQuestion.snapshot`; discursivas permanecem autoavaliação. A interface pode mostrar resultado autoritativo ao reconectar.

**Política de gabarito (decisão adiada para a preparação de sessões):** (1) entregar ao dispositivo o snapshot completo, incluindo gabarito/resposta esperada, permite feedback e revisão imediatos sem rede, mas qualquer pessoa com acesso ao dispositivo pode inspecionar as respostas; assinatura/criptografia não impede o próprio cliente de ler após desbloqueio. (2) entregar somente o snapshot de apresentação, como os tipos locais atuais, evita expor o gabarito offline, mas adia correção objetiva e revelação de resposta discursiva até a reconexão. Não escolher nem armazenar gabaritos na subetapa 5.1. Em ambas as alternativas o servidor continua calculando `isCorrect` ao sincronizar.

### Outbox, idempotência e push

Na mesma transação Dexie, ao responder/pular, persistir mudança local, operação pendente, UUID de operação estável e ordem local antes de confirmar a interação. Recarregar a página deve reconstruir a fila e o manifesto sem gerar nova chave. A fila só marca operação como sincronizada depois da resposta do servidor.

Adicionar endpoint JWT-protegido, por exemplo `POST /api/sync/push`, que aceita lote limitado e devolve resultado individual por operação: aceita, replay idempotente ou conflito. Processar cada item transacionalmente para que um conflito não apague o sucesso dos demais. Para resposta, reaproveitar a chave idempotente existente e a validação atual. Para pulo, primeiro adaptar o endpoint existente para exigir UUID e persistir a chave no manifesto (ou em registro idempotente equivalente); retry com mesma chave/operação retorna replay, payload/chave incompatível conflita. Não sincronizar pulo enquanto esse contrato não estiver aplicado e testado no PostgreSQL.

Push mantém ordem por sessão: resposta/pulo antes de conclusão. O servidor não aceita `userId`, snapshot, correção ou contadores enviados pelo cliente. O JWT expirado resulta em `401`; o cliente mantém a fila e solicita reautenticação da mesma conta sem trocar seu dono.

### Conflitos e conteúdo alterado/excluído

Respostas vinculam `sessionId` e `sessionQuestionId` do manifesto persistido; alternativa deve existir no snapshot original. Alterações posteriores afetam apenas novos quizzes. O snapshot completo já guardado pela sessão preserva interpretação histórica; sincronização não deve reconsultar a pergunta corrente para avaliar tentativas. Conteúdo removido do catálogo gera tombstone no delta e deixa de aparecer em novos estudos, mas itens de sessão/outbox permanecem até resolução. Se a sessão foi revogada/encerrada ou a operação conflitar com resposta/pulo já confirmado, marcar conflito para revisão e não sobrescrever o servidor silenciosamente.

## Endpoints e estado

| Endpoint | Responsabilidade |
|---|---|
| `GET /api/sync/content?cursor&limit` | **Implementado:** pull incremental de conteúdo e tombstones do usuário autenticado |
| `GET /api/quizzes/sessions/:id` (adaptar) ou rota explícita de pacote offline | Disponibilizar o manifesto completo de uma sessão própria para persistência local |
| `POST /api/sync/push` | Processar operações idempotentes de resposta, pulo e, depois, conclusão; resposta individual por item |

Não criar ainda operação offline de CRUD de conteúdo, sessão criada sem servidor, Sync API para usuário não autenticado, nem qualquer endpoint que aceite `userId` ou resultado calculado pelo cliente.

## Subetapas e testes de aceitação

1. **Contrato/modelo local:** versionar Dexie; preservar tabela de sessão v1; definir stores de conteúdo, manifesto, outbox e cursor. Testes com IndexedDB fake para migração, atomicidade, restart e separação entre duas contas.
2. **PWA shell — implementada e validada:** manifest, ícones, Service Worker e políticas de cache. O build de produção verificou os arquivos do precache; o teste de navegador confirmou registro e carregamento de `/register` com o servidor indisponível após a instalação. Testes de contrato conferem o bypass de API/autorização, fallback, exclusão do cache anterior e atualização sob ação do usuário. Conteúdo privado não é incluído.
3. **Bootstrap/pull de conteúdo:** DTOs, rota, cursor e change log transacional. Testes de API para propriedade, paginação, cursores concorrentes, tombstones, retomada e cursor inválido/vencido; integração PostgreSQL.
4. **Sessão offline pré-carregada:** adaptação de leitura e persistência de manifesto/snapshot de apresentação. Testes após reload e conteúdo editado/excluído; garantir que o snapshot permanece imutável e gabarito não seja usado pelo cliente para avaliar.
5. **Idempotência de skip:** migração aditiva e adaptação de schema/controller/service/cliente. Testes de mesmo replay, chave reutilizada com payload diferente, concorrência answer-vs-skip e falha/retry PostgreSQL. É um bloqueador prévio à fila offline de pulos.
6. **Outbox/push:** fila transacional com chave estável e endpoint batch. Testes online/offline/reconexão, operação repetida, lote parcialmente conflitante, token expirado e validação de alternativa fora do snapshot.
7. **Experiência e regressão:** adaptar Context, `contentApi`, `quizApi`, páginas e indicadores de status; garantir fluxos online existentes. Testes React, IndexedDB, integração PostgreSQL e navegador para login inicial, reload offline e troca de conta.

A subetapa 5.1 implementou contratos e armazenamento local versionado, testes e helpers de fila vinculados à conta ativa. A subetapa 5.2 disponibiliza o app shell PWA depois do primeiro acesso online. A subetapa 5.3 grava conteúdo recebido no Dexie, mas não integrou o pull à UI. Sessões offline, push e processamento de outbox permanecem pendentes.
