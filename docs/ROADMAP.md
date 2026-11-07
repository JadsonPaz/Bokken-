# Roteiro de Implementação — Bokken Estudos

Este roadmap registra o estado confirmado no código. A execução segue por incrementos; funcionalidades planejadas para etapas futuras não devem ser tratadas como já entregues.

## Estado geral

| Etapa | Escopo | Estado |
|---|---|---|
| 1 | Fundação do monorepo | Concluída |
| 2 | Autenticação e isolamento por usuário | Concluída |
| 3 | Gestão de focos, matérias e perguntas | Implementada; revisão/auditoria realizada |
| 3.1 | Correções finais de contratos, snapshots e configuração | Implementadas; validação de migração PostgreSQL descartável pendente |
| 4 | Quiz online e registro de tentativas | Em implementação |
| 5 | Modo offline, PWA e sincronização | Não iniciada |
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
- Typecheck, build e testes automatizados passam; validação de PostgreSQL deve ser executada quando houver banco descartável disponível.

## Etapa 5 — Modo offline, PWA e sincronização

Service worker/App Shell, armazenamento Dexie, cópia local de conteúdo, fila de sync, endpoints pull/push e reconciliação segura de sessões/tentativas. O MVP deverá tratar o servidor como autoridade de identidade e validar manifestos e resultados offline assinados ou previamente autorizados. Esta etapa não está implementada.

## Etapa 6 — SRS e flashcards

Flashcards e algoritmo de repetição espaçada priorizando conteúdo atrasado e histórico de erros. Não iniciado.

## Etapa 7 — Estatísticas e calendário

Agregações por período, foco e matéria, com definição consistente de fuso horário e reconciliação online/offline. Não iniciado.

## Etapa 8 — Refinamento e auditoria

Testes críticos, acessibilidade, responsividade, segurança, desempenho e revisão visual. Planejada.

## Fora do escopo atual

Não implementar em Etapa 4: sincronização, operação offline, PWA, SRS, flashcards, estatísticas ou calendário. A migração `20261107000000_quiz_sessions_online` é aditiva e ainda precisa ser aplicada/validada em PostgreSQL descartável antes de uso em banco compartilhado.
