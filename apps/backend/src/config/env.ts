import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEVELOPMENT_JWT_SECRET = 'bokken_dev_secret_key_change_in_production';
const PREDICTABLE_SECRET_PARTS = ['password', 'secret', 'example', 'change_me', 'changeme', 'bokken', 'qwerty', 'test_only'];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().default('3001').transform(val => parseInt(val, 10)),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgrespassword@localhost:5432/bokken_db?schema=public'),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('7d')
});

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const parsed = envSchema.parse(input);
  let jwtSecret = parsed.JWT_SECRET;

  if (parsed.NODE_ENV === 'development') {
    if (!jwtSecret?.trim()) jwtSecret = DEVELOPMENT_JWT_SECRET;
  } else if (!jwtSecret) {
    throw new Error('JWT_SECRET é obrigatório fora do ambiente de desenvolvimento.');
  }

  if (parsed.NODE_ENV === 'production' && jwtSecret) {
    const normalizedSecret = jwtSecret.toLowerCase();
    const entropy = calculateShannonEntropy(jwtSecret);
    const predictable = PREDICTABLE_SECRET_PARTS.some(part => normalizedSecret.includes(part)) ||
      /abcdefghijklmnopqrstuvwxyz|0123456789|qwerty/i.test(jwtSecret);

    if (jwtSecret === DEVELOPMENT_JWT_SECRET || jwtSecret.trim() !== jwtSecret || jwtSecret.length < 32 || new Set(jwtSecret).size < 12 || entropy < 4 || predictable) {
      throw new Error('JWT_SECRET de produção precisa ser aleatório, ter pelo menos 32 caracteres e não conter padrões previsíveis.');
    }
  }

  return { ...parsed, JWT_SECRET: jwtSecret };
}

function calculateShannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

const _env = (() => {
  try {
    return { success: true as const, data: parseEnvironment(process.env) };
  } catch (error) {
    return { success: false as const, error };
  }
})();

if (!_env.success) {
  console.error('❌ Configuração de ambiente inválida. Defina NODE_ENV e revise as variáveis obrigatórias.');
  process.exit(1);
}

export const env = _env.data;
