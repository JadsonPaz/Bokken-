# Bokken Estudos

> Plataforma pessoal de estudos baseada em perguntas e respostas, com foco em flashcards, quizzes, repetição espaçada inteligente e acompanhamento de desempenho com arquitetura offline-first.

---

## 📚 Visão do Produto

O **Bokken Estudos** foi concebido para proporcionar sessões de estudo confortáveis, focadas e ininterruptas, permitindo que estudantes organizem seus conteúdos na hierarquia **Usuário → Focos → Matérias → Perguntas**, respondam quizzes personalizados e acompanhem sua evolução sem depender de conectividade contínua com a internet.

---

## 🛠️ Stack Tecnológica

### Frontend
- **Framework:** React + Vite + TypeScript
- **Estilização:** Tailwind CSS (tema focado em concentração: azul-marinho, verde-escuro e toques sutis)
- **Roteamento:** React Router
- **Persistência Local (Offline-First):** Dexie.js (IndexedDB)
- **PWA:** Vite PWA + Workbox (instalável e com cache do App Shell)

### Backend
- **Runtime & Servidor:** Node.js + Express + TypeScript
- **ORM & Banco de Dados:** Prisma ORM + PostgreSQL
- **Segurança & Autenticação:** JWT (JSON Web Tokens) + bcrypt

### Pacote Compartilhado (`shared`)
- Interfaces de domínio e DTOs TypeScript compartilhados de ponta a ponta
- Schemas de validação Zod reutilizados no cliente e servidor

---

## 📁 Documentação Arquitetural e Planejamento

Consulte os documentos detalhados na pasta `docs/`:

- [docs/ARCHITECTURE.md](file:///c:/Users/thera/OneDrive/Documentos/GitHub%20e%20Projetos/Antigravity%20Projects/Bokken!/docs/ARCHITECTURE.md): Proposta arquitetural completa, separação de camadas e estrutura do monorepo.
- [docs/DATABASE_SCHEMA.md](file:///c:/Users/thera/OneDrive/Documentos/GitHub%20e%20Projetos/Antigravity%20Projects/Bokken!/docs/DATABASE_SCHEMA.md): Modelo relacional PostgreSQL, diagrama ERD e esquema Prisma ORM.
- [docs/SYNC_STRATEGY.md](file:///c:/Users/thera/OneDrive/Documentos/GitHub%20e%20Projetos/Antigravity%20Projects/Bokken!/docs/SYNC_STRATEGY.md): Mecanismo de sincronização bidirecional Dexie.js ↔ PostgreSQL, idempotência e tratamento de conflitos.
- [docs/ROADMAP.md](file:///c:/Users/thera/OneDrive/Documentos/GitHub%20e%20Projetos/Antigravity%20Projects/Bokken!/docs/ROADMAP.md): Plano de implementação em 7 etapas incrementais com critérios de aceite.

---

## 🚀 Estado do Desenvolvimento

As Etapas 1 e 2 foram concluídas. A Etapa 3 (Gestão de Conteúdos) está implementada e em revisão, incluindo CRUD de focos, matérias e perguntas, isolamento por usuário e snapshots de contexto para tentativas futuras. A Etapa 4 ainda não foi iniciada.

Consulte o [roadmap](docs/ROADMAP.md) para os critérios e escopo das próximas etapas.
