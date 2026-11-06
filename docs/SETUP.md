# Guia de Configuração e Execução do Bokken Estudos

Este guia orienta a instalação de dependências, configuração do banco de dados e a execução em desenvolvimento do monorepo **Bokken Estudos**.

---

## 1. Pré-requisitos

- **Node.js:** Versão 20+ (recomendado Node 22+)
- **NPM:** Versão 10+
- **PostgreSQL:** Instância local ou container Docker (necessário para a sincronização centralizada)

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

Copie o arquivo de exemplo para os ambientes correspondentes:

```bash
cp .env.example .env
cp .env.example apps/backend/.env
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
   *(A migração inicial `20261105000000_init` criará todas as tabelas, tipos ENUM, índices e restrições de chave estrangeira).*

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

**Terminal 2 — Frontend (Vite + React PWA):**
```bash
npm run dev:frontend
```
*Disponível em: `http://localhost:5173`*

---

## 7. Comandos de Testes e Verificação

| Comando | Finalidade |
|---|---|
| `npm test` | Executa a suíte de testes automatizados do módulo de autenticação e segurança |
| `npm run typecheck` | Executa a verificação estrita do TypeScript em todos os workspaces |
| `npm run build` | Compila o pacote shared, o backend e o bundle de produção do frontend |
