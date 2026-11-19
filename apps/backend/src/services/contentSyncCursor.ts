import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface ContentSyncCursor {
  userId: string;
  after: string;
  through: string;
  complete: boolean;
}

const cursorPayloadSchema = z.object({
  version: z.literal(1),
  userId: z.string().uuid(),
  after: z.string().regex(/^(0|[1-9]\d{0,39})$/),
  through: z.string().regex(/^(0|[1-9]\d{0,39})$/),
  complete: z.boolean()
}).strict().superRefine((value, context) => {
  if (BigInt(value.after) > BigInt(value.through)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid sequence range.' });
  }
  if (value.complete && value.after !== value.through) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid completed cursor.' });
  }
});

const key = createHmac('sha256', env.JWT_SECRET)
  .update('bokken:content-sync-cursor:v1')
  .digest();
const aad = Buffer.from('bokken:content-sync-cursor:v1');

export function encodeContentSyncCursor(cursor: ContentSyncCursor): string {
  const payload = cursorPayloadSchema.parse({ version: 1, ...cursor });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
}

export function decodeContentSyncCursor(token: string, expectedUserId: string): ContentSyncCursor {
  try {
    if (token.length > 2048) throw new Error('cursor too long');
    const segments = token.split('.');
    if (segments.length !== 3 || !segments.every(segment => /^[A-Za-z0-9_-]+$/.test(segment))) throw new Error('invalid format');

    const [encodedIv, encodedCiphertext, encodedTag] = segments;
    const iv = Buffer.from(encodedIv, 'base64url');
    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
    const tag = Buffer.from(encodedTag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) throw new Error('invalid envelope');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = cursorPayloadSchema.parse(JSON.parse(plaintext));
    if (parsed.userId !== expectedUserId) throw new Error('different owner');
    return {
      userId: parsed.userId,
      after: parsed.after,
      through: parsed.through,
      complete: parsed.complete
    };
  } catch {
    throw new AppError('Cursor de sincronização inválido.', 400);
  }
}
