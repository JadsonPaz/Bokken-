# Roteiro de Implementação por Etapas (Roadmap)

Este roteiro estabelece o plano de desenvolvimento em etapas incrementais e testáveis para o **Bokken Estudos**, garantindo estabilidade, foco na arquitetura sustentável e evolução segura sem retrabalho.

---

## Visão Geral das Etapas

| Etapa | Foco Principal | Entregáveis Chave |
|---|---|---|
| **Etapa 1** | Fundação e Setup do Monorepo | Monorepo pnpm/npm, TypeScript, ESLint, Tailwind, Prisma setup, Dexie base. |
| **Etapa 2** | Autenticação e Multitenancy | Endpoints de Auth (JWT/bcrypt), Contexto de Auth no React, isolamento por usuário. |
| **Etapa 3** | Gerenciamento de Conteúdos | CRUD de Focos, Matérias e Perguntas (Múltipla Escolha e Discursivas), validações Zod. |
| **Etapa 4** | Motor de Sincronização & PWA | Service Worker (Vite PWA), Dexie.js integrado, fila de sync, testes de modo avião. |
| **Etapa 5** | Quizzes, Flashcards 3D & SRS | Animação Flip Card 3D, modos de quiz, algoritmo de repetição inteligente balanceado. |
| **Etapa 6** | Estatísticas & Calendário de Ofensiva | Calendário estilo GitHub Contributions offline/online, métricas por matéria e foco. |
| **Etapa 7** | Refinamento, Testes & Auditoria PWA | Testes automatizados (Vitest/Jest), auditoria Lighthouse PWA, polimento visual e UX. |

---

## Detalhamento de Cada Etapa

### Etapa 1: Fundação e Setup da Infraestrutura
- **Objetivo:** Estabelecer a base do monorepo, padronização de tipos e tooling.
- **Tarefas:**
  1. Configuração do workspace (`apps/frontend`, `apps/backend`, `packages/shared`).
  2. Setup do TypeScript compartilhado com `strict: true`.
  3. Configuração do Vite + React + Tailwind CSS com a paleta do Bokken (azul-marinho, verde-escuro, tons suaves).
  4. Configuração do Node.js + Express + Prisma com Docker compose para PostgreSQL de desenvolvimento.
  5. Estruturação do pacote `shared` para DTOs e esquemas Zod.
- **Critério de Aceite:** Build limpo de frontend, backend e shared; banco PostgreSQL rodando e conectado ao Prisma.

---

### Etapa 2: Autenticação, Usuários e Segurança
- **Objetivo:** Permitir cadastro, login e isolamento total dos dados de cada estudante.
- **Tarefas:**
  1. Criação das rotas de cadastro (`/api/auth/register`) e login (`/api/auth/login`).
  2. Implementação do hash de senhas com `bcrypt` e emissão de tokens JWT seguros.
  3. Middleware de proteção `authMiddleware` para validação em todas as rotas privadas.
  4. Contexto de autenticação no React (`AuthContext`) com persistência de sessão e redirecionamento de rotas.
- **Critério de Aceite:** Usuário registra, efetua login, recebe token JWT e acessa rota protegida. Tentativas inválidas rejeitadas com status HTTP correto.

---

### Etapa 3: Gestão de Conteúdos (Focos, Matérias e Perguntas)
- **Objetivo:** Estruturar a hierarquia Usuário → Focos → Matérias → Perguntas.
- **Tarefas:**
  1. API REST para CRUD de Focos e Matérias.
  2. API REST para criação de perguntas com suporte aos dois tipos:
     - **Múltipla Escolha:** alternativas com apenas uma correta e justificativa opcional.
     - **Discursiva:** enunciado, resposta esperada/justificativa obrigatória.
  3. Validação estrita de entradas com Zod no backend e no frontend.
  4. Telas de listagem e criação de Focos e Matérias no frontend.
  5. Formulários acessíveis para inserção de perguntas.
- **Critério de Aceite:** Usuário consegue cadastrar seus Focos (ex: Concurso BB, ADS), vincular matérias e adicionar perguntas de ambos os tipos com feedback visual.

---

### Etapa 4: Motor de Sincronização e PWA Offline-First
- **Objetivo:** Garantir que o aplicativo funcione sem conexão de internet para consulta e respostas.
- **Tarefas:**
  1. Setup do Vite PWA com manifesto e service worker (Workbox) para cache do App Shell.
  2. Inicialização do schema Dexie.js no frontend com tabelas indexadas.
  3. Implementação dos endpoints de sincronização no backend (`/api/sync/pull` e `/api/sync/push`).
  4. Criação do `SyncEngine` com fila local (`syncQueue`), retry exponencial e detecção de conectividade (`navigator.onLine`).
  5. Cópia local de conteúdos: após autenticar, Focos e Perguntas são espelhados no IndexedDB.
- **Critério de Aceite:** Desconectar a internet no navegador e continuar abrindo o app, visualizando matérias e gerando IDs de tentativas localmente.

---

### Etapa 5: Módulo de Quizzes, Flashcard 3D e Algoritmo SRS
- **Objetivo:** Proporcionar uma experiência de estudo imersiva, fluida e com revisão espaçada inteligente.
- **Tarefas:**
  1. Componente de Flashcard 3D (`CardFlip3D`) com CSS transform (`rotateY(180deg)`), suave e sem travamento.
  2. Configuração de sessão de Quiz:
     - Por matéria específica.
     - Aleatório de um Foco.
     - Geral misturando todos os Focos.
     - Filtros por tipo (múltipla escolha, discursiva ou ambos), tempo e limite de questões.
  3. Implementação da avaliação manual discursiva (botões "Acertei" e "Errei").
  4. Algoritmo de Repetição Espaçada balanceado:
     - Prioriza perguntas com maior taxa de erro e revisões atrasadas.
     - Mistura perguntas novas e de manutenção.
     - Bloqueio de repetições imediatas na mesma sessão (`excludeQuestionIds`).
- **Critério de Aceite:** O usuário responde perguntas em qualquer modo configurado, assiste à animação de flip 3D ao submeter e nota que questões erradas voltam a aparecer com maior prioridade em sessões futuras.

---

### Etapa 6: Estatísticas, Dashboard e Calendário de Ofensiva (Streak)
- **Objetivo:** Fornecer feedback motivacional e acompanhamento do rendimento escolar/concurso.
- **Tarefas:**
  1. Componente visual de calendário de atividade (estilo GitHub Contributions com níveis de cor verde).
  2. Cálculo de dias consecutivos de ofensiva (Streak), operando 100% offline a partir das tentativas registradas no IndexedDB.
  3. Estatísticas agregadas: total respondido, índice de acertos geral e por matéria.
  4. Consolidação das métricas no backend durante o processo de sincronização.
- **Critério de Aceite:** Ao responder uma pergunta offline, o dia atual no calendário é marcado como ativo imediatamente; ao sincronizar, os dados no backend refletem o mesmo histórico.

---

### Etapa 7: Refinamento, Testes e Polimento Final
- **Objetivo:** Garantir qualidade de produção, robustez e conformidade com as regras de design.
- **Tarefas:**
  1. Testes unitários para o algoritmo de repetição inteligente (SRS) e o motor de fila de sincronização.
  2. Testes de integração para as rotas de sincronização e autenticação no backend.
  3. Auditoria de acessibilidade, contraste de cores e performance com Google Lighthouse (PWA Score 95+).
  4. Revisão visual completa: paleta de cores (azul-marinho, verde-escuro, verde suave e vermelho discreto), responsividade mobile e desktop.
- **Critério de Aceite:** Cobertura de testes nos módulos críticos de negócio, PWA instalável no celular e computador com inicialização instantânea e sem erros de console.
