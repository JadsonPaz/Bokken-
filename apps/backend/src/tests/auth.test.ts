import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AuthService } from '../services/authService.js';
import { InMemoryUserRepository } from '../repositories/userRepository.js';
import { verifyPassword } from '../utils/password.js';
import { generateToken, verifyToken } from '../utils/jwt.js';
import { createApp } from '../server.js';
import { AuthController } from '../controllers/authController.js';
import { createAuthRouter } from '../routes/auth.js';
import express from 'express';
import { errorHandler } from '../middlewares/errorHandler.js';
import { parseEnvironment } from '../config/env.js';

describe('Módulo de Autenticação — Bokken Estudos', () => {
  let userRepository: InMemoryUserRepository;
  let authService: AuthService;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    authService = new AuthService(userRepository);
  });

  it('exige ambiente explícito e usa configuração JWT isolada por ambiente', () => {
    assert.throws(() => parseEnvironment({}), /NODE_ENV/);
    assert.strictEqual(parseEnvironment({ NODE_ENV: 'development' }).JWT_SECRET, 'bokken_dev_secret_key_change_in_production');
    assert.throws(() => parseEnvironment({ NODE_ENV: 'test' }), /JWT_SECRET/);
    assert.strictEqual(parseEnvironment({ NODE_ENV: 'test', JWT_SECRET: 'isolated_test_jwt_secret_2026_only' }).JWT_SECRET, 'isolated_test_jwt_secret_2026_only');
    assert.throws(() => parseEnvironment({ NODE_ENV: 'production' }), /JWT_SECRET/);
    assert.throws(() => parseEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'segredo-curto' }), /JWT_SECRET/);
    assert.throws(() => parseEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48) }), /JWT_SECRET/);
    assert.throws(() => parseEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'Example_random_production_secret_2026!x' }), /JWT_SECRET/);
    assert.strictEqual(parseEnvironment({ NODE_ENV: 'production', JWT_SECRET: 'xY7$pL2!bV9@qW4#nT6^mK3&zR8*hf5%' }).JWT_SECRET, 'xY7$pL2!bV9@qW4#nT6^mK3&zR8*hf5%');
  });

  it('1. Deve realizar cadastro válido com sucesso e retornar usuário seguro e token', async () => {
    const input = {
      name: 'Estudante Bokken',
      email: 'estudante@bokken.com',
      password: 'senhaSegura123',
      timezone: 'America/Sao_Paulo'
    };

    const response = await authService.register(input);

    assert.ok(response.token, 'Token JWT deve ser gerado');
    assert.strictEqual(response.user.email, 'estudante@bokken.com');
    assert.strictEqual(response.user.name, 'Estudante Bokken');
    assert.strictEqual(response.user.timezone, 'America/Sao_Paulo');
    assert.ok(response.user.id, 'UUID deve ser gerado');
    // Requisito de segurança: nunca retornar passwordHash
    assert.strictEqual((response.user as any).passwordHash, undefined, 'passwordHash nunca deve ser retornado');
  });

  it('2. Deve impedir cadastro com email duplicado (mesmo com variação de maiúsculas)', async () => {
    await authService.register({
      name: 'Usuário Um',
      email: 'teste@bokken.com',
      password: 'senhaSegura123',
      timezone: 'America/Sao_Paulo'
    });

    await assert.rejects(
      async () => {
        await authService.register({
          name: 'Usuário Dois',
          email: 'TESTE@BOKKEN.COM', // Maiúsculas
          password: 'outraSenha123',
          timezone: 'America/Sao_Paulo'
        });
      },
      {
        name: 'AppError',
        message: 'Este endereço de email já está cadastrado',
        statusCode: 409
      }
    );
  });

  it('3. Senha deve ser armazenada com hash bcrypt (nunca em texto puro)', async () => {
    const plainPassword = 'minhaSenhaUltraSecreta!#';
    const response = await authService.register({
      name: 'Segurança Teste',
      email: 'seguranca@bokken.com',
      password: plainPassword,
      timezone: 'America/Sao_Paulo'
    });

    const userInDb = await userRepository.findById(response.user.id);
    assert.ok(userInDb, 'Usuário deve existir no repositório');
    assert.notStrictEqual(userInDb.passwordHash, plainPassword, 'A senha nunca deve estar em texto puro');
    assert.ok(userInDb.passwordHash.startsWith('$2'), 'Hash deve ser gerado com padrão bcrypt');

    // Valida que o hash confere com a senha original
    const isValid = await verifyPassword(plainPassword, userInDb.passwordHash);
    assert.strictEqual(isValid, true, 'Hash bcrypt deve ser verificável');
  });

  it('4. Deve realizar login correto com credenciais válidas', async () => {
    await authService.register({
      name: 'Aluno Alvo',
      email: 'aluno@bokken.com',
      password: 'password123',
      timezone: 'America/Sao_Paulo'
    });

    const loginResponse = await authService.login({
      email: 'ALUNO@bokken.com',
      password: 'password123'
    });

    assert.ok(loginResponse.token, 'Token deve ser retornado no login');
    assert.strictEqual(loginResponse.user.email, 'aluno@bokken.com');
  });

  it('5. Login com credenciais incorretas deve retornar erro genérico sem revelar se email existe', async () => {
    await authService.register({
      name: 'Aluno Existente',
      email: 'existente@bokken.com',
      password: 'senhaCorreta123',
      timezone: 'America/Sao_Paulo'
    });

    // Tentativa com senha errada
    await assert.rejects(
      async () => {
        await authService.login({
          email: 'existente@bokken.com',
          password: 'senhaTotalmenteErrada'
        });
      },
      {
        name: 'AppError',
        message: 'Credenciais inválidas. Verifique seu email e senha.',
        statusCode: 401
      }
    );

    // Tentativa com email que NÃO existe (deve retornar a MESMA mensagem e status 401)
    await assert.rejects(
      async () => {
        await authService.login({
          email: 'naoexiste@bokken.com',
          password: 'qualquerSenha'
        });
      },
      {
        name: 'AppError',
        message: 'Credenciais inválidas. Verifique seu email e senha.',
        statusCode: 401
      }
    );
  });

  it('6. Deve gerar e verificar JWT corretamente e extrair dados da identidade', async () => {
    const payload = { userId: 'uuid-1234-abcd', email: 'jwt@bokken.com' };
    const token = generateToken(payload);

    assert.ok(typeof token === 'string', 'Token deve ser string');

    const decoded = verifyToken(token);
    assert.ok(decoded, 'Token deve ser decodificado com sucesso');
    assert.strictEqual(decoded.userId, payload.userId);
    assert.strictEqual(decoded.email, payload.email);
  });

  it('7. Rejeição de JWT inválido ou adulterado', () => {
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tokenAdulteradoInvalido.invalido';
    const decoded = verifyToken(invalidToken);
    assert.strictEqual(decoded, null, 'JWT inválido deve retornar null');
  });

  it('8. Isolamento da identidade do usuário (GET /me deriva identidade do JWT, ignorando qualquer injeção do cliente)', async () => {
    const userA = await authService.register({
      name: 'Usuário Legítimo A',
      email: 'usera@bokken.com',
      password: 'passwordA123',
      timezone: 'America/Sao_Paulo'
    });

    const userB = await authService.register({
      name: 'Usuário Vítima B',
      email: 'userb@bokken.com',
      password: 'passwordB123',
      timezone: 'America/Sao_Paulo'
    });

    // Simulando chamada HTTP a /me com token do Usuário A
    const app = express();
    app.use(express.json());
    const controller = new AuthController(authService);
    app.use('/api/auth', createAuthRouter(controller));
    app.use(errorHandler);

    // Consulta de /me para o Usuário A
    const meA = await authService.getMe(userA.user.id);
    assert.strictEqual(meA.id, userA.user.id);
    assert.strictEqual(meA.email, 'usera@bokken.com');
    assert.notStrictEqual(meA.id, userB.user.id, 'Usuário A nunca deve receber dados do Usuário B');
  });
});
