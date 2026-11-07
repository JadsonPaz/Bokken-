# Arquitetura do Bokken Estudos

Este documento descreve a arquitetura implementada e identifica claramente as partes ainda planejadas. Hoje o uso de quiz é online-first; IndexedDB, PWA e sincronização continuam no roadmap da Etapa 5.

---

## 1. Visão Geral da Arquitetura

O Bokken Estudos é um monorepo React/Express. Na Etapa 4, o PostgreSQL é a autoridade para sessões, manifestos e tentativas; o cliente envia somente a resposta e uma chave de idempotência. A arquitetura offline-first é uma evolução planejada, não uma capacidade atual.

```mermaid
flowchart LR
    UI["React UI"] --> Client["API client / JSON"]
    Client <-->|"HTTP + JWT"| API["Express REST API"]
    API --> Auth["Auth middleware"] --> Controller["Controllers + Zod"] --> Service["Quiz/content services"] --> Prisma["Prisma"] --> DB[("PostgreSQL")]
    Future["Dexie / PWA / sync\nEtapa 5 planejada"] -. futuro .-> Client
```

### Princípios Norteadores:
1. **Autoridade no servidor:** sessão, manifesto e snapshot são criados pelo backend; a identidade vem do JWT.
2. **Idempotência de resposta:** cada tentativa tem chave UUID de idempotência por usuário, garantida por índice único.
3. **Preservação histórica:** snapshots carregam enunciado, justificativa, resposta esperada e todas as alternativas apresentadas.
4. **Isolamento multitenant:** consultas de quiz são limitadas ao usuário autenticado e a seus conteúdos ativos.

---

## 2. Estrutura do Repositório (Monorepo)

O projeto é organizado no formato monorepo utilizando workspaces do `npm` ou `pnpm`, permitindo o compartilhamento seguro de contratos e tipos entre cliente e servidor sem duplicação de código.

> A árvore abaixo é uma visão lógica do destino do monorepo e inclui diretórios planejados; confira a árvore do repositório para os arquivos realmente existentes.

```
bokken/
├── apps/
│   ├── frontend/                 # Aplicação React + Vite PWA
│   │   ├── public/               # Ícones, manifest.json, assets estáticos
│   │   ├── src/
│   │   │   ├── assets/           # Imagens, vetores SVG, estilos globais
│   │   │   ├── components/       # Componentes visuais
│   │   │   │   ├── common/       # Button, Card, Modal, Input, Badge
│   │   │   │   ├── flashcard/    # CardFlip3D, FrontSide, BackSide
│   │   │   │   ├── quiz/         # QuizRunner, QuestionNavigation, AnswerFeedback
│   │   │   │   ├── stats/        # ContributionCalendar, PerformanceChart
│   │   │   │   └── layout/       # Header, Sidebar, Container, SyncStatusPill
│   │   │   ├── context/          # AuthContext, SyncContext, ThemeContext
│   │   │   ├── db/               # Dexie.js (banco local)
│   │   │   │   ├── index.ts      # Instância do BokkenDexieDB
│   │   │   │   └── schema.ts     # Tabelas e índices do IndexedDB
│   │   │   ├── hooks/            # useQuiz, useSync, useOfflineStats, useCardFlip
│   │   │   ├── pages/            # Home, QuizPage, FocusManager, StatsPage, Login
│   │   │   ├── services/         # Lógica de domínio e comunicação
│   │   │   │   ├── api.ts        # Cliente HTTP (Axios ou Fetch wrapper)
│   │   │   │   ├── sync/         # SyncEngine, SyncQueue, NetworkStatus
│   │   │   │   ├── srs/          # Algoritmo de repetição espaçada no cliente
│   │   │   │   └── stats/        # Agregação de estatísticas offline
│   │   │   ├── styles/           # Tailwind CSS e animações customizadas 3D
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── package.json
│   │
│   └── backend/                  # API REST Node.js + Express
│       ├── prisma/
│       │   ├── schema.prisma     # Modelagem de dados PostgreSQL
│       │   ├── migrations/       # Histórico de migrações do banco
│       │   └── seed.ts           # Carga inicial para desenvolvimento
│       ├── src/
│       │   ├── config/           # Variáveis de ambiente, constantes
│       │   ├── controllers/      # AuthController, FocusController, QuestionController, SyncController
│       │   ├── middlewares/      # authMiddleware, validateRequest, errorHandler, rateLimiter
│       │   ├── repositories/     # Camada de abstração Prisma (PrismaUserRepository, etc.)
│       │   ├── routes/           # Rotas Express modularizadas
│       │   ├── services/         # Regras de negócio (AuthService, SyncService, StatsService)
│       │   ├── utils/            # Hash (bcrypt), tokens (jwt), formatters
│       │   └── server.ts         # Inicialização do Express
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   └── shared/                   # Código e tipos compartilhados
│       ├── src/
│       │   ├── types/            # DTOs, Enums, Interfaces de domínio
│       │   ├── schemas/          # Schemas de validação Zod compartilhados
│       │   └── constants/        # Configurações globais (regras de repetição, tempos)
│       ├── tsconfig.json
│       └── package.json
│
├── docs/                         # Documentação técnica e planejamento
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── SYNC_STRATEGY.md
│   └── ROADMAP.md
├── package.json                  # Root package.json (workspaces)
└── README.md
```

---

## 3. Segurança e Propriedade dos Dados (Multitenancy Seguro)

Para prevenir vulnerabilidades do tipo **BOLA/IDOR (Broken Object Level Authorization)**, o backend implementa quatro camadas de isolamento rigoroso:

### 3.1. Autenticação e Extração Segura de Identidade
- Toda requisição privada exige o header `Authorization: Bearer <JWT>`.
- O `authMiddleware` valida criptograficamente a assinatura e injeta `req.user = { id: string, email: string }`.
- O `userId` proveniente do payload HTTP (JSON do body ou query params) é **completamente ignorado** para fins de segurança; apenas o identificador autenticado `req.user.id` é utilizado na persistência.

### 3.2. Scoping Obrigatório em Consultas do Prisma
Nenhuma consulta de busca, atualização ou exclusão de entidades do usuário pode ser realizada unicamente por `id`. O escopo de posse deve ser explicitamente aplicado:

```typescript
// Exemplo Seguro no FocusService:
const focus = await prisma.focus.findFirst({
  where: {
    id: focusId,
    userId: req.user.id, // Escopo de posse direto
    deletedAt: null
  }
});

// Exemplo Seguro no QuestionService:
const question = await prisma.question.findFirst({
  where: {
    id: questionId,
    subject: {
      focus: {
        userId: req.user.id // Escopo de posse pela hierarquia
      }
    },
    deletedAt: null
  }
});
```

### 3.3. Validação Hierárquica na Criação de Conteúdos
Ao criar um elemento filho (ex: Pergunta vinculada a uma Matéria), o backend valida antes da inserção se a entidade pai realmente pertence ao usuário autenticado:
1. `POST /api/subjects`: valida se `focusId` pertence a `req.user.id`.
2. `POST /api/questions`: valida se `subjectId` pertence a um Foco de `req.user.id`.
Se a validação falhar, a API retorna `404 Not Found` (em vez de `403 Forbidden`) para não confirmar a existência de identificadores alheios a atacantes.

### 3.4. Contrato de quiz online atual
- `POST /api/quizzes/sessions` seleciona perguntas ativas de conteúdo pertencente ao usuário autenticado e grava snapshot completo + posição no manifesto.
- `GET` e as rotas de resposta consultam a sessão dentro do escopo do proprietário. O cliente não fornece `userId`.
- Para responder, a API carrega o snapshot armazenado, valida o tipo e verifica que a alternativa enviada faz parte dele. `isCorrect` é calculado no servidor.
- A resposta discursiva recebe uma autoavaliação enumerada; o servidor deriva `isCorrect` dela. Chaves UUID idempotentes têm unicidade por usuário.
- `clientStudyDate` e `clientTimezone` são derivados pelo servidor do relógio de gravação e do fuso cadastrado no usuário; não vêm no payload.
- Snapshots pendentes não revelam alternativa correta, justificativa ou resposta esperada; esse conteúdo aparece depois do registro da resposta.

### 3.5. Sincronização futura
Não existe endpoint `POST /api/sync/push` nesta etapa. Na Etapa 5, identidade deverá continuar sendo derivada do JWT. O manifesto original do servidor deverá ser usado para validar todas as respostas offline; tickets por sessão/questão, idempotência e resolução de replay serão definidos antes da implementação.
