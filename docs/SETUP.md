# Guia de Configuração e Execução do Bokken Estudos

Este guia orienta a instalação de dependências, configuração do banco de dados e a execução em desenvolvimento do monorepo **Bokken Estudos**.

---

## 1. Pré-requisitos

- **Node.js:** Versão 20+ (recomendado Node 22+)
- **NPM:** Versão 10+
- **PostgreSQL:** Instância local ou container Docker (necessário para a API e testes de integração do Quiz)

---

## 2. Instalação das Dependências

Na raiz do projeto, instale todas as dependências dos workspaces simultaneamente:

```bash
npm install
```

O comando linka localmente os pacotes:
- `@bokken/shared` (em `packages/shared`)
- `@bokken/backend` (em `apps/backend`)
- `@bokken/frontend` (em `apps/frontend`)

---

## 3. Banco de Dados PostgreSQL (Local ou Docker)

### Opção A: Subir PostgreSQL via Docker Compose (Recomendado)
Se você possui o Docker instalado, execute na raiz do projeto:

```bash
docker compose up -d
```
*Isto inicializará um container PostgreSQL 16 com o banco `bokken_db` na porta 5432.*

Para verificar se o container está saudável:
```bash
docker compose ps
```

### Opção B: PostgreSQL Instalado Localmente
Se você já possui o PostgreSQL instalado na máquina:
1. Crie o banco de dados `bokken_db`:
   ```sql
   CREATE DATABASE bokken_db;
   ```
2. Configure o usuário e senha correspondentes no arquivo `.env`.

---

## 4. Configuração de Variáveis de Ambiente

Se os arquivos ainda não existirem, copie o exemplo para os ambientes correspondentes; não sobrescreva arquivos `.env` já configurados:

```bash
test -f .env || cp .env.example .env
test -f apps/backend/.env || cp .env.example apps/backend/.env
```

Edite o arquivo `apps/backend/.env` ajustando a string `DATABASE_URL` se o usuário ou senha do seu PostgreSQL local forem diferentes de `postgres:postgrespassword`.

---

## 5. Compilação, Migrações e Geração do Prisma Client

1. Compile o pacote compartilhado para gerar os tipos TypeScript:
   ```bash
   npm run build:shared
   ```

2. Gere os artefatos do Prisma Client:
   ```bash
   npm run prisma:generate --workspace=@bokken/backend
   ```

3. Aplique as migrações no banco de dados PostgreSQL:
   ```bash
   npm run prisma:migrate --workspace=@bokken/backend
   ```
   *(A sequência adiciona o manifesto do Quiz em `20261107000000_quiz_sessions_online`. Em ambiente com dados, valide as migrações e faça backup antes de aplicá-las.)*

---

## 6. Execução em Modo de Desenvolvimento

Execute o frontend e o backend em terminais separados:

**Terminal 1 — Backend (API Express):**
```bash
npm run dev:backend
```
*Disponível em: `http://localhost:3001`*
- *Health check: `http://localhost:3001/api/health`*
- *Rotas Auth: `http://localhost:3001/api/auth/register`, `/login`, `/me`*

**Terminal 2 — Frontend (Vite + React):**
```bash
npm run dev:frontend
```
*Disponível em: `http://localhost:5173`*
*O modo de desenvolvimento não registra Service Worker. Para validar o app shell PWA, use build e preview de produção:*

```bash
npm run build
npm run verify:pwa --workspace=@bokken/frontend
cd apps/frontend
npx vite preview --host 127.0.0.1 --port 4173
```

Abra `http://127.0.0.1:4173`, aguarde o aviso de que o aplicativo está pronto para abrir offline, e então teste uma rota interna com a rede indisponível. O precache é apenas para o app shell; chamadas privadas da API não são armazenadas.

---

## 7. Comandos de Testes e Verificação

| Comando | Finalidade |
|---|---|
| `npm test` | Executa testes unitários/contratuais de autenticação, conteúdo, snapshots e Quiz; executa testes PostgreSQL somente com banco descartável configurado |
| `npm run typecheck` | Executa a verificação estrita do TypeScript em todos os workspaces |
| `npm run build` | Compila o pacote shared, o backend e o bundle de produção do frontend |
| `npm run verify:pwa --workspace=@bokken/frontend` | Confere manifest, ícones e arquivos presentes no precache do build |
| `npx prisma validate --schema apps/backend/prisma/schema.prisma` | Valida a sintaxe e consistência interna do schema Prisma (não valida SQL contra PostgreSQL) |

### Testes de integração PostgreSQL do Quiz e da sincronização de conteúdo

Os testes de integração são opt-in e não aplicam migrações. Use uma instância descartável já migrada, com nome contendo `test` ou `disposable` (e nunca `bokken_db`), e configure `QUIZ_TEST_DATABASE_URL`. A partir da subetapa 5.3, a instância precisa incluir também a migração `20261110000000_add_content_sync_feed`. `DATABASE_URL` deve apontar para o mesmo banco descartável, pois os serviços Prisma usados nos testes leem essa variável.

Exemplo (ajuste host/credenciais localmente sem gravá-los em documentação ou Git):

```bash
export QUIZ_TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/bokken_quiz_test?schema=public'
export DATABASE_URL="$QUIZ_TEST_DATABASE_URL"
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
npm test
```

Antes, crie o banco descartável e aplique nele a sequência via `DATABASE_URL` temporária apontada exclusivamente para esse banco. Não use `docker compose down -v` nem reutilize volumes de outros projetos. Sem `QUIZ_TEST_DATABASE_URL`, as suítes PostgreSQL informam os testes como ignorados; isso não equivale a validar a migração ou concorrência no banco.
