# Segurança de dependências — Etapa 5.2.1

Estado registrado após a remediação técnica de 2026-11-09. As versões e contagens abaixo foram conferidas no lockfile e com `npm audit` / `npm audit --omit=dev`.

## Remediações aplicadas

| Grupo | Antes | Depois | Resultado verificado |
|---|---|---|---|
| `bcrypt` | 5.1.1, transitivamente `@mapbox/node-pre-gyp` e `tar` 6.2.1 | `bcrypt` 6.0.0 | A cadeia `@mapbox/node-pre-gyp`/`tar` foi removida. Cadastro, criação de hash e verificação de hash legado `$2b$` passaram em testes. Instalação e hash foram verificados no Windows e em Linux Node 22. |
| Zod | 3.x em backend e shared | 4.6.7 em backend e shared | Tipos compartilhados recompilados; validações e testes passaram. Payloads têm limites de coleções e corpo JSON explícitos. |
| React Router | `react-router-dom` 6.x | `react-router-dom` 7.18.5 e `react-router` 7.18.5 | Mantido o modo Declarative com `BrowserRouter`. Destinos de retorno do login usam allowlist de rotas internas. |

Os limites para novas alternativas de múltipla escolha são de 2 a 10. A API limita o parser JSON a 100 KB; focos selecionados permanecem limitados a 50 e os contratos futuros de push limitam lotes a 100 sessões e 100 tentativas. Snapshots históricos persistidos são analisados sem um limite novo para preservar registros antigos; o schema de entrada de snapshots é limitado a 10 alternativas.

O formulário não envia a coleção de alternativas quando elas não foram alteradas. Isso permite atualizar outros campos em perguntas históricas com mais de 10 alternativas sem apagar nem reescrever conteúdo; ao editar as alternativas, a coleção recebida deve respeitar o teto atual.

## Auditoria restante

Em 2026-11-09, tanto `npm audit --json` quanto `npm audit --omit=dev --json` reportaram 3 nós de pacote com gravidade alta e nenhum outro nível:

- `deepmerge-ts` 7.1.5, transitivo por `prisma@6.19.3 -> @prisma/config@6.19.3`; GHSA [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), stack exhaustion ao mesclar grafos recursivos, corrigido em 8.0.0.
- `@prisma/config` 6.19.3 e `prisma` 6.19.3 são nós afetados pela mesma cadeia/advisory. O CLI é também dependência de desenvolvimento, mas a análise `--omit=dev` continua reportando a cadeia devido ao peer opcional do Prisma Client. O código da API não aceita grafos arbitrários para mesclagem de configuração; a exposição durante a execução da API é reduzida, mas o advisory continua aberto e não é suprimido.

Prisma permanece em 6.19.3 nesta entrega. A correção disponível cruza a major para Prisma 7 e requer um plano separado, cobrindo:

1. Conversão de configuração e imports para ESM conforme os requisitos do Prisma 7.
2. Novo formato/configuração de geração do Prisma Client.
3. Driver adapter PostgreSQL (`@prisma/adapter-pg`) e configuração do pool.
4. `prisma.config.ts` e mudança da configuração de conexão/URL.
5. Regressão das queries, geração do Client, migrações e testes de integração PostgreSQL.

Não foi usado `npm audit fix`, `--force` nem `overrides`. Não foram alterados schema Prisma, migrações ou bancos de dados.

## Segurança no login

O estado de `location.state.from` é tratado como entrada não confiável. O retorno é aceito apenas para as rotas protegidas reconhecidas do aplicativo; destinos externos, esquemas, `//`, barras invertidas e barras codificadas são descartados. Destinos inválidos retornam ao painel.

## Verificações

- `npm test`: aprovado; 63 testes backend e 17 testes frontend passaram. A suíte PostgreSQL apareceu como `SKIP` porque `QUIZ_TEST_DATABASE_URL` não estava configurada; nenhum banco foi usado ou alterado.
- `npm run typecheck`, `npm run build`, `npx prisma validate --schema=apps/backend/prisma/schema.prisma` e `git diff --check`: aprovados.
- `npm audit --json` e `npm audit --omit=dev --json`: ambos saem com código 1 pelos três nós Prisma/deepmerge-ts descritos acima; bcrypt/tar, Zod e React Router não aparecem nos resultados.
- Instalação do bcrypt 6 e geração de hash: aprovadas em Windows e em container Linux Node 22. Comparação de hash `$2b$` gerado com bcrypt 5.1.1: aprovada em ambos.
- O build passou com dois avisos do Rollup sobre comentários `@__PURE__` dentro dos módulos publicados do Zod 4; o Rollup remove esses comentários e conclui o bundle sem falha.

Não foram aplicadas migrações, alterados schemas/bancos ou iniciada a subetapa 5.3.
