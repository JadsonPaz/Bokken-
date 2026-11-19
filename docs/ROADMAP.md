# Roteiro de Implementação — Bokken Estudos

Este roadmap registra o estado confirmado no código. A execução segue por incrementos; funcionalidades planejadas para etapas futuras não devem ser tratadas como já entregues.

## Estado geral

| Etapa | Escopo | Estado |
|---|---|---|
| 1 | Fundação do monorepo | Concluída |
| 2 | Autenticação e isolamento por usuário | Concluída |
| 3 | Gestão de focos, matérias e perguntas | Implementada; revisão/auditoria realizada |
| 3.1 | Correções finais de contratos, snapshots e configuração | Implementadas; migrações validadas no PostgreSQL local |
| 4 | Quiz online e registro de tentativas | Concluída; testes automatizados, integração PostgreSQL e fluxos manuais validados pelo proprietário |
| 5 | Modo offline, PWA e sincronização | Iniciada; subetapas 5.1, 5.2, 5.2.1 e 5.3 implementadas e validadas; sessão offline e push ainda pendentes |
| 6 | SRS e flashcards | Não iniciada |
| 7 | Estatísticas e calendário de atividade | Não iniciada |
| 8 | Refinamento, acessibilidade e auditoria | Planejada |

## Etapa 4 — Quiz online e registro de tentativas

### Escopo
- Configurar sessões por matéria, foco, todos os focos ou focos selecionados.
- Filtrar por tipo de pergunta e selecionar quantidade fixa ou todas as perguntas elegíveis.
- Fixar no servidor a lista ordenada de perguntas, snapshots e estados `PENDING`, `ANSWERED` e `SKIPPED`.
- Evitar repetição dentro da sessão e preservar questões puladas/não respondidas.
- Validar respostas contra o snapshot imutável. O servidor deriva `isCorrect`; respostas discursivas usam `DiscursiveAssessment`.
- Aplicar autenticação, propriedade da sessão e idempotência às respostas.
- Criar interface para configurar, responder, pular e ver resultados.

### Critérios de aceite
- Tentativas não aceitam `userId`, snapshot ou `isCorrect` controlados pelo cliente.
- Alternativas selecionadas pertencem ao snapshot da sessão.
- Edições/exclusões posteriores do conteúdo não alteram a pergunta apresentada na sessão.
- Reenvios idempotentes não criam tentativas duplicadas.
- Sessão final mantém a lista completa e identifica perguntas respondidas e puladas.
- Typecheck, build, testes automatizados, integração PostgreSQL e comparação entre schema Prisma e banco passam no ambiente local validado.
- Foram aprovados 66 testes de backend e 2 de frontend; os 9 testes de integração PostgreSQL foram executados (nenhum ignorado).
- O proprietário validou manualmente cadastro, autenticação, CRUD de focos e questões, quizzes, respostas corretas/incorretas, questões discursivas e puladas, conclusão e revisão de sessões.

## Etapa 5 — Modo offline, PWA e sincronização

Objetivo: permitir estudar offline conteúdo e sessões sincronizados previamente, mantendo PostgreSQL como autoridade para identidade, snapshots e avaliação. O primeiro acesso e a sincronização inicial exigem conexão. O app shell já está disponível após o primeiro acesso; cache de conteúdo, quizzes offline e sincronização ainda não estão implementados.

### Plano técnico incremental

1. **Contratos e segurança local — implementada:** esquema Dexie v2 preserva a tabela `session` v1 e define stores tipadas por usuário para conteúdo, sessões/manifestos, cursores e outbox. Helpers locais mantêm fila após logout/troca de conta, reclamam operações somente com a sessão proprietária e controlam transições. Testes: migração IndexedDB, isolamento de contas, reload, fila após logout/troca e transições.
2. **App shell PWA — concluída:** manifest e ícones locais; Service Worker só em produção; precache versionado de HTML, bundles e recursos estáticos; fallback para navegação SPA; atualização explícita com limpeza de cache antigo. Google Fonts removido como dependência de renderização. Sem cache de API, autorização ou resposta privada. Validado por teste de build e por navegação offline para uma rota interna em preview de produção.
2.1. **Remediação de dependências e segurança — concluída:** `bcrypt` 6.0.0 removeu a cadeia vulnerável `node-pre-gyp`/`tar`; Zod 4.6.7 e React Router 7.18.5 foram aplicados; limites de payload e destinos de login foram endurecidos. Testes confirmaram hashes bcrypt anteriores e instalação em Windows/Linux. `npm audit` ainda aponta a cadeia Prisma 6/deepmerge-ts, documentada para migração major futura.
3. **Pull incremental de conteúdo — implementado e validado:** `GET /api/sync/content` autenticado, change log por usuário com sequência atribuída na mesma transação do CRUD, cursor cifrado e vinculado ao usuário, watermark fixo entre páginas, DTOs sem gabarito e aplicação atômica no Dexie. A migração aditiva faz backfill do conteúdo existente e cria tombstones para registros já excluídos. Integração PostgreSQL validada no banco descartável `bokken_quiz_test`; testes cobrem paginação, eventos criados entre páginas, propriedade, cursor adulterado/de outra conta, tombstones, exclusão em cascata, privacidade e retomada local.
4. **Sessões preparadas online:** continuar criando sessão e manifesto no servidor; persistir localmente sessão, posições e snapshots de apresentação. Testes: recarga/fechamento com quiz aberto, snapshots de pergunta e gabarito não usado para avaliação local.
5. **Fila local durável e skip idempotente:** gravar resposta/pulo e operação na mesma transação Dexie, com UUID estável antes de confirmar a ação na UI. Antes de enfileirar pulos, adaptar o contrato/API e persistir sua chave idempotente no servidor. Testes: retry/replay de answer e skip, crash/reload e operações concorrentes.
6. **Push de operações:** endpoint JWT-protegido, identidade derivada do token, processamento isolado por operação e resposta por item (aceita, replay ou conflito). Servidor recalcula múltipla escolha pelo snapshot; cliente nunca envia `isCorrect` ou snapshot. Testes: replays, payload divergente, token expirado, alternativa fora do snapshot e concorrência.
7. **Reconciliação de sessões e respostas após sincronização — planejada:** enriquecer pull com estado de sessão e definir conflitos entre conteúdo removido/alterado e operações locais. Não faz parte da subetapa 5.3.
8. **Integração de interface e regressão:** integrar cache, outbox, sinalização de conectividade e sincronização em primeiro plano ao exposto/retorno da rede; preservar o fluxo online existente. Testes unitários, IndexedDB, API/PostgreSQL e navegador offline/online.

### Decisões e riscos do planejamento

- Recomendação inicial: criar sessões somente online e usar o manifesto já persistido no servidor; isso evita confiar em snapshots ou resultados montados pelo dispositivo.
- Usar change log/cursor por usuário transacionalmente ordenado, em vez de apenas `updatedAt`, para não perder alterações concorrentes nem tombstones.
- A chave atual de idempotência cobre respostas em `QuestionAttempt`; pular não é idempotente hoje e é bloqueador para sincronização confiável dessa operação.
- Token expirado impede push; a outbox deve permanecer intacta até reautenticação da mesma conta. Dados locais devem permanecer segregados por conta e nunca ser reenviados sob outra identidade.
- Mudanças prováveis de banco: controle de versão/cursor e change log de sincronização, mais chave de idempotência persistida para pulo. Fechar o desenho e gerar migrações aditivas antes de implementação; não usar reset ou `db push`.
- A política de JWT offline e o acesso a gabaritos permanecem decisões das subetapas futuras; nesta subetapa o fluxo de autenticação online não foi alterado e os tipos locais não contêm chaves de resposta.
- O app shell PWA não significa que os dados pessoais ou quizzes estejam disponíveis sem rede; essa capacidade depende de sincronização local futura.
- O pull de conteúdo da 5.3 já grava focos, matérias, perguntas, alternativas de apresentação e cursor no Dexie, mas ainda não foi ligado às telas nem executado automaticamente. A aplicação mantém o fluxo online validado; quizzes offline e envio da outbox continuam pendentes.
- A migração `20261110000000_add_content_sync_feed` foi aplicada e testada somente em `bokken_quiz_test` nesta subetapa. O banco de desenvolvimento `bokken_db` não foi acessado ou alterado.

## Etapa 6 — SRS e flashcards

Flashcards e algoritmo de repetição espaçada priorizando conteúdo atrasado e histórico de erros. Não iniciado.

## Etapa 7 — Estatísticas e calendário

Agregações por período, foco e matéria, com definição consistente de fuso horário e reconciliação online/offline. Não iniciado.

## Etapa 8 — Refinamento e auditoria

Testes críticos, acessibilidade, responsividade, segurança, desempenho e revisão visual. Planejada.

## Fora do escopo da Etapa 4

Sincronização, operação offline e PWA passaram ao escopo iniciado da Etapa 5; SRS, flashcards, estatísticas e calendário permanecem em etapas posteriores. As quatro migrações da Etapa 4 foram aplicadas ao banco local `bokken_db` e ao banco isolado `bokken_quiz_test`; o schema Prisma foi comparado ao banco local sem diferenças. Ambientes compartilhados ainda precisam receber as migrações versionadas no processo de implantação.
