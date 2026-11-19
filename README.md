# Bokken Estudos

> Plataforma pessoal de estudos baseada em perguntas e respostas. Quizzes online estão concluídos; o app shell PWA já pode ser instalado e aberto offline após o primeiro carregamento online. Conteúdo offline e sincronização continuam planejados na Etapa 5.

---

## 📚 Visão do Produto

O **Bokken Estudos** foi concebido para proporcionar sessões de estudo confortáveis, focadas e ininterruptas, permitindo que estudantes organizem seus conteúdos na hierarquia **Usuário → Focos → Matérias → Perguntas**, respondam quizzes personalizados e acompanhem sua evolução sem depender de conectividade contínua com a internet.

---

## 🛠️ Stack Tecnológica

### Frontend
- **Framework:** React + Vite + TypeScript
- **Estilização:** Tailwind CSS (tema focado em concentração: azul-marinho, verde-escuro e toques sutis)
- **Roteamento:** React Router
- **PWA:** Manifest, ícones e app shell estático em cache; o Service Worker não armazena respostas da API
- **Cache de conteúdo offline:** Planejado para subetapas futuras; Dexie define os contratos, ainda sem preenchimento de conteúdo pela UI

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
- [docs/SYNC_STRATEGY.md](docs/SYNC_STRATEGY.md): Contrato online atual e proposta futura de sincronização Dexie.js ↔ PostgreSQL.
- [docs/ROADMAP.md](file:///c:/Users/thera/OneDrive/Documentos/GitHub%20e%20Projetos/Antigravity%20Projects/Bokken!/docs/ROADMAP.md): Plano de implementação em 7 etapas incrementais com critérios de aceite.

---

## 🚀 Estado do Desenvolvimento

As Etapas 1, 2, 3, 3.1 e 4 estão concluídas. A Etapa 3 oferece CRUD de focos, matérias e perguntas, isolamento por usuário e preservação de snapshots históricos. A Etapa 4 oferece quiz online com manifesto e snapshots por sessão; testes automatizados, integração PostgreSQL e fluxos manuais foram validados pelo proprietário. Na Etapa 5, as subetapas 5.1 (contratos e armazenamento local) e 5.2 (PWA e app shell) foram implementadas e validadas. O shell estático pode ser reaberto offline após o primeiro carregamento online; conteúdo privado, sessões offline e sincronização ainda não estão disponíveis. O primeiro acesso e a sincronização inicial exigirão conexão à internet.

Consulte o [roadmap](docs/ROADMAP.md) para os critérios e escopo das próximas etapas.
