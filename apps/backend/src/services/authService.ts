import { IUserRepository, PrismaUserRepository } from '../repositories/userRepository.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import { registerUserSchema, loginUserSchema, SafeUser, AuthResponse } from '@bokken/shared';
import { z } from 'zod';

export type RegisterInput = z.infer<typeof registerUserSchema>;
export type LoginInput = z.infer<typeof loginUserSchema>;

export class AuthService {
  constructor(private userRepository: IUserRepository = new PrismaUserRepository()) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const validated = registerUserSchema.parse(input);
    const normalizedEmail = validated.email.trim().toLowerCase();

    // Verifica unicidade de email
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError('Este endereço de email já está cadastrado', 409);
    }

    // Hash da senha com salt robusto
    const passwordHash = await hashPassword(validated.password);

    // Fallback de timezone garantido
    const timezone = validated.timezone?.trim() || 'America/Sao_Paulo';

    // Criação do usuário
    const createdUser = await this.userRepository.create({
      name: validated.name.trim(),
      email: normalizedEmail,
      passwordHash,
      timezone
    });

    const safeUser: SafeUser = {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      timezone: createdUser.timezone,
      createdAt: createdUser.createdAt.toISOString()
    };

    const token = generateToken({
      userId: safeUser.id,
      email: safeUser.email
    });

    return {
      user: safeUser,
      token
    };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const validated = loginUserSchema.parse(input);
    const normalizedEmail = validated.email.trim().toLowerCase();

    const user = await this.userRepository.findByEmail(normalizedEmail);

    // Proteção contra enumeração de emails: mesma mensagem para usuário inexistente ou senha incorreta
    if (!user) {
      throw new AppError('Credenciais inválidas. Verifique seu email e senha.', 401);
    }

    const isPasswordValid = await verifyPassword(validated.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Credenciais inválidas. Verifique seu email e senha.', 401);
    }

    // Nota de conformidade com os requisitos:
    // Não altera automaticamente a preferência de timezone do usuário em logins posteriores.

    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString()
    };

    const token = generateToken({
      userId: safeUser.id,
      email: safeUser.email
    });

    return {
      user: safeUser,
      token
    };
  }

  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString()
    };
  }
}
