import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(val => parseInt(val, 10)),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/bokken_db?schema=public'),
  JWT_SECRET: z.string().default('bokken_dev_secret_key_change_in_production'),
  JWT_EXPIRES_IN: z.string().default('7d')
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Erro de validação das variáveis de ambiente:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
