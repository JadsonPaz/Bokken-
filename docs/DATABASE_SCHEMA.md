# Modelo Relacional do PostgreSQL (Prisma ORM)

> Estado implementado: `QuizSessionQuestion` foi adicionado na migração `20261107000000_quiz_sessions_online`. A tabela mantém snapshot JSONB e posição para cada pergunta original da sessão. O DDL abaixo deve ser lido junto com `apps/backend/prisma/schema.prisma`, que é a fonte atual do modelo; não aplicar migrações sem backup e validação prévia.

Este documento especifica a modelagem do banco de dados relacional PostgreSQL do **Bokken Estudos**, as regras de integridade e os índices estratégicos para suportar consultas analíticas, sincronização resiliente e preservação absoluta do histórico.

---

## 1. Diagrama Entidade-Relacionamento (ERD)

```mermaid
erDiagram
    User ||--o{ Focus : "possui"
    User ||--o{ QuizSession : "executa"
    User ||--o{ QuestionAttempt : "realiza (histórico)"
    User ||--o{ QuestionSRSProgress : "acumula"
    User ||--o{ DailyStudyLog : "registra"

    Focus ||--o{ Subject : "contém"
    Subject ||--o{ Question : "contém"
    Question ||--o{ QuestionOption : "possui (se múltipla escolha)"
    Question ||--o{ QuizSessionQuestion : "incluída no manifesto"
    Question ||--o{ QuestionAttempt : "alvo de (onDelete: Restrict)"
    Question ||--o{ QuestionSRSProgress : "estado SRS"
    QuizSession ||--o{ QuestionAttempt : "agrupa (opcional)"
    QuizSession ||--|{ QuizSessionQuestion : "congela conjunto e ordem"

    User {
        uuid id PK
        string email UK
        string passwordHash
        string name
        string timezone "Ex: America/Sao_Paulo"
        datetime createdAt
        datetime updatedAt
    }

    Focus {
        uuid id PK
        uuid userId FK
        string name
        string description
        string color
        datetime createdAt
        datetime updatedAt
        datetime deletedAt "Soft delete"
    }

    Subject {
        uuid id PK
        uuid focusId FK
        string name
        string description
        datetime createdAt
        datetime updatedAt
        datetime deletedAt "Soft delete"
    }

    Question {
        uuid id PK
        uuid subjectId FK
        enum type "MULTIPLE_CHOICE | DISCURSIVE"
        text statement
        text explanation
        text expectedAnswer
        datetime createdAt
        datetime updatedAt
        datetime deletedAt "Soft delete"
    }

    QuestionOption {
        uuid id PK
        uuid questionId FK
        text text
        boolean isCorrect
        int orderIndex
        datetime retiredAt "Versão arquivada; alternativas históricas permanecem referenciáveis"
        datetime createdAt
        datetime updatedAt
    }

    QuestionSRSProgress {
        uuid id PK
        uuid userId FK
        uuid questionId FK
        int repetitions
        int consecutiveCorrect
        int totalAttempts
        int totalCorrect
        int totalIncorrect
        float priorityScore
        datetime lastAttemptAt
        datetime nextReviewAt
        datetime updatedAt
    }

    QuizSession {
        uuid id PK "UUID gerado no servidor"
        uuid userId FK
        enum mode "SUBJECT | FOCUS | GENERAL_ALL | GENERAL_CUSTOM"
        int totalQuestions
        int totalCorrect
        int totalIncorrect
        int durationSeconds
        datetime startedAt
        datetime finishedAt
        datetime createdAt
        datetime updatedAt
    }

    QuizSessionQuestion {
        uuid id PK
        uuid sessionId FK
        uuid questionId FK "onDelete: Restrict"
        json snapshot "Snapshot completo criado pelo servidor"
        int snapshotVersion "Versão do formato do snapshot"
        int position "Posição imutável"
        enum status "PENDING | ANSWERED | SKIPPED"
        datetime answeredAt
        datetime skippedAt
        UK sessionId_questionId
        UK sessionId_position
    }

    QuestionAttempt {
        uuid id PK "UUID gerado no servidor"
        uuid userId FK
        uuid questionId FK "onDelete: Restrict"
        uuid quizSessionId FK "onDelete: SetNull"
        uuid idempotencyKey "Única por usuário; anulável para legado"
        boolean isCorrect
        uuid selectedOptionId FK "onDelete: SetNull"
        enum discursiveAssessment "CORRECT | INCORRECT"
        int timeSpentSeconds
        string clientStudyDate "YYYY-MM-DD no fuso do aluno"
        json questionSnapshot "Copiado do snapshot da entrada do manifesto"
        datetime clientCreatedAt "Timestamp gravado pelo servidor"
        datetime syncedAt "Timestamp de gravação no servidor"
    }

    DailyStudyLog {
        uuid id PK
        uuid userId FK
        date studyDate UK "YYYY-MM-DD por usuário"
        int questionsAnswered
        int correctCount
        int incorrectCount
        datetime updatedAt
    }
```

---

## 2. Código do Esquema Prisma (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum QuestionType {
  MULTIPLE_CHOICE
  DISCURSIVE
}

enum DiscursiveAssessment {
  CORRECT
  INCORRECT
}

enum QuizQuestionStatus { PENDING ANSWERED SKIPPED }

enum QuizMode {
  SUBJECT
  FOCUS
  GENERAL_ALL
  GENERAL_CUSTOM
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String
  name         String
  timezone     String   @default("America/Sao_Paulo")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  foci             Focus[]
  quizSessions     QuizSession[]
  questionAttempts QuestionAttempt[]
  srsProgresses    QuestionSRSProgress[]
  dailyStudyLogs   DailyStudyLog[]

  @@map("users")
}

model Focus {
  id          String    @id @default(uuid()) @db.Uuid
  userId      String    @db.Uuid
  name        String
  description String?
  color       String?   @default("#1e3a8a")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  subjects Subject[]

  @@index([userId, deletedAt])
  @@index([userId, updatedAt])
  @@map("foci")
}

model Subject {
  id          String    @id @default(uuid()) @db.Uuid
  focusId     String    @db.Uuid
  name        String
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  focus     Focus      @relation(fields: [focusId], references: [id], onDelete: Restrict)
  questions Question[]

  @@index([focusId, deletedAt])
  @@index([focusId, updatedAt])
  @@map("subjects")
}

model Question {
  id             String       @id @default(uuid()) @db.Uuid
  subjectId      String       @db.Uuid
  type           QuestionType
  statement      String       @db.Text
  explanation    String?      @db.Text
  expectedAnswer String?      @db.Text
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?

  subject       Subject               @relation(fields: [subjectId], references: [id], onDelete: Restrict)
  options       QuestionOption[]
  attempts      QuestionAttempt[]
  sessionQuestions QuizSessionQuestion[]
  srsProgresses QuestionSRSProgress[]

  @@index([subjectId, deletedAt])
  @@index([subjectId, updatedAt])
  @@map("questions")
}

model QuestionOption {
  id         String   @id @default(uuid()) @db.Uuid
  questionId String   @db.Uuid
  text       String   @db.Text
  isCorrect  Boolean  @default(false)
  orderIndex Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  retiredAt  DateTime?

  question Question          @relation(fields: [questionId], references: [id], onDelete: Cascade)
  attempts QuestionAttempt[]

  @@index([questionId])
  @@map("question_options")
}

model QuestionSRSProgress {
  id                 String    @id @default(uuid()) @db.Uuid
  userId             String    @db.Uuid
  questionId         String    @db.Uuid
  repetitions        Int       @default(0)
  consecutiveCorrect Int       @default(0)
  totalAttempts      Int       @default(0)
  totalCorrect       Int       @default(0)
  totalIncorrect     Int       @default(0)
  priorityScore      Float     @default(1.0)
  lastAttemptAt      DateTime?
  nextReviewAt       DateTime?
  updatedAt          DateTime  @updatedAt

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([userId, questionId])
  @@index([userId, nextReviewAt])
  @@index([userId, priorityScore])
  @@map("question_srs_progress")
}

model QuizSession {
  id               String            @id @default(uuid()) @db.Uuid
  userId           String            @db.Uuid
  mode             QuizMode
  totalQuestions   Int               @default(0)
  totalCorrect     Int               @default(0)
  totalIncorrect   Int               @default(0)
  durationSeconds  Int               @default(0)
  startedAt        DateTime          @default(now())
  finishedAt       DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  user     User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  attempts QuestionAttempt[]
  questions QuizSessionQuestion[]

  @@index([userId, startedAt])
  @@map("quiz_sessions")
}

model QuestionAttempt {
  id                   String                @id @default(uuid()) @db.Uuid
  userId               String                @db.Uuid
  questionId           String                @db.Uuid
  quizSessionId        String?               @db.Uuid
  idempotencyKey       String?               @db.Uuid
  isCorrect            Boolean
  selectedOptionId     String?               @db.Uuid
  discursiveAssessment DiscursiveAssessment?
  timeSpentSeconds     Int                   @default(0)
  clientStudyDate      String                @db.VarChar(10) // "YYYY-MM-DD" no fuso civil do aluno
  clientTimezone       String?               @db.VarChar(50) // "America/Sao_Paulo"
  statementSnapshot    String?               @db.Text
  selectedOptionTextSnapshot String?         @db.Text
  expectedAnswerSnapshot String?             @db.Text
  questionSnapshot     Json?                  @db.JsonB
  clientCreatedAt      DateTime
  syncedAt             DateTime              @default(now())

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  question       Question        @relation(fields: [questionId], references: [id], onDelete: Restrict)
  quizSession    QuizSession?    @relation(fields: [quizSessionId], references: [id], onDelete: SetNull)
  selectedOption QuestionOption? @relation(fields: [selectedOptionId], references: [id], onDelete: SetNull)

  @@index([userId, clientCreatedAt])
  @@index([userId, clientStudyDate])
  @@index([questionId])
  @@index([quizSessionId])
  @@unique([userId, idempotencyKey])
  @@map("question_attempts")
}

model QuizSessionQuestion {
  id         String             @id @default(uuid()) @db.Uuid
  sessionId  String             @db.Uuid
  questionId String             @db.Uuid
  snapshot   Json               @db.JsonB
  snapshotVersion Int           @default(1)
  position   Int
  status     QuizQuestionStatus @default(PENDING)
  answeredAt DateTime?
  skippedAt  DateTime?
  createdAt  DateTime           @default(now())
  updatedAt  DateTime           @updatedAt

  session  QuizSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question Question    @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([sessionId, position])
  @@unique([sessionId, questionId])
  @@index([sessionId, status, position])
  @@map("quiz_session_questions")
}

model DailyStudyLog {
  id                String   @id @default(uuid()) @db.Uuid
  userId            String   @db.Uuid
  studyDate         DateTime @db.Date
  questionsAnswered Int      @default(0)
  correctCount      Int      @default(0)
  incorrectCount    Int      @default(0)
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, studyDate])
  @@index([userId, studyDate])
  @@map("daily_study_logs")
}
```

---

## 3. Decisões Arquiteturais e Justificativas de Modelagem

### 3.0. Manifesto imutável do quiz online (Etapa 4)
- `quiz_session_questions` contém uma linha por pergunta escolhida pelo servidor, com posição, snapshot completo e status (`PENDING`, `ANSWERED`, `SKIPPED`). Perguntas não respondidas continuam no manifesto e são marcadas como puladas quando a sessão é encerrada.
- A constraint única `(session_id, question_id)` impede repetição na mesma sessão; `(session_id, position)` mantém posições únicas.
- A referência à pergunta usa `ON DELETE RESTRICT`; a exclusão de conteúdo é lógica. O snapshot é suficiente para interpretar o contexto mesmo após edição, e a FK mantém o vínculo de auditoria.
- `question_attempts.idempotency_key` é anulável para compatibilidade com histórico anterior e tem unicidade por usuário. Respostas antigas não recebem chaves artificiais.
- Esta migração é aditiva: nova tabela, enum, coluna anulável e índice. Não altera linhas históricas existentes. Ainda precisa de validação em PostgreSQL descartável; nenhuma migração deve ser executada contra o banco de desenvolvimento nesta tarefa.

### 3.1. Preservação Absoluta do Histórico (`onDelete: Restrict`)
- **O Problema do Cascade:** Em sistemas de estudo, um erro clássico é definir `onDelete: Cascade` entre a Pergunta e a Tentativa. Se uma matéria ou foco for excluído, ou se uma pergunta for purgada acidentalmente, todo o histórico de resolução do estudante (tentativas, tempos e métricas) seria apagado.
- **A Solução:**
  - `QuestionAttempt.question` possui **`onDelete: Restrict`**. O motor relacional do PostgreSQL rejeitará categoricamente qualquer tentativa de exclusão física de perguntas que já possuam tentativas vinculadas.
  - O mesmo se aplica a `Question.subject` e `Subject.focus`, que utilizam `onDelete: Restrict`.
  - A exclusão de conteúdos é **100% lógica (Soft Delete via `deletedAt`)**. Ao excluir um Foco, Matéria ou Pergunta, apenas o campo `deletedAt` é preenchido.
  - As perguntas excluídas logicamente são excluídas das consultas de novos quizzes (`WHERE deletedAt IS NULL`), mas permanecem no banco para alimentar relatórios históricos, gráficos de aproveitamento acumulado e auditoria.
  - Cada tentativa nova carrega `questionSnapshot`, contendo tipo, enunciado, justificativa, resposta esperada e **todas** as alternativas apresentadas (texto, ordem e indicação da correta). No quiz online, o snapshot é criado pelo servidor quando abre a sessão e copiado para a tentativa. O cliente não recebe o gabarito da questão pendente. A autorização para responder offline será definida na Etapa 5.
  - Ao editar alternativas, as linhas antigas recebem `retiredAt`; seus IDs e relações com tentativas permanecem intactos. A migração `20261106010000_preserve_question_attempt_context` apenas adiciona colunas anuláveis. Tentativas antigas não recebem snapshots fabricados porque não há como reconstruir com segurança versões anteriores do conteúdo.
  - O único `onDelete: Cascade` permitido é no nível do `User`: se o estudante solicitar a exclusão de sua conta integral (em conformidade com a LGPD), todos os seus dados pessoais são purgados em cascata.

### 3.2. Fuso Horário e Integridade de Ofensiva (`clientStudyDate` e `User.timezone`)
- **O Problema:** Respostas dadas às 23:40 no horário de Brasília (`America/Sao_Paulo`, UTC-3) correspondem a 02:40 do dia seguinte em UTC. Se o servidor calcular o calendário diário usando a data UTC, a ofensiva do dia será quebrada e o mapa de contribuição marcará o dia incorreto.
- **A Solução:**
  - O perfil do usuário armazena `timezone` (ex: `"America/Sao_Paulo"`), detectado no frontend via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - A tentativa registra `clientCreatedAt` (timestamp UTC preciso) e **`clientStudyDate`** (string no formato `YYYY-MM-DD` representando o dia civil local do aluno quando a resposta foi submetida).
  - O `DailyStudyLog` utiliza `@db.Date`, consolidando o dia civil real de estudo sem distorções de fuso.

### 3.3. Identificadores de Sessões (`QuizSession`)
- **Fluxo online atual:** sessões, entradas do manifesto e tentativas recebem UUID no servidor. Uma chave de idempotência fornecida para a submissão impede duplicação por usuário.
- **Relacionamento histórico:** `QuestionAttempt.quizSessionId` usa `onDelete: SetNull`, preservando tentativas caso uma sessão seja removida. A retenção do manifesto e snapshots da sessão é independente das alterações posteriores de conteúdo.
