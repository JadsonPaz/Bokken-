import Dexie from 'dexie';
import { db, type BokkenDatabase } from './index.js';
import type { ActiveOutboxBatch, LocalOutboxOperation, LocalOutboxStatus, NewLocalOutboxOperation } from './types.js';

const ALLOWED_TRANSITIONS: Record<LocalOutboxStatus, readonly LocalOutboxStatus[]> = {
  PENDING_SYNC: ['PROCESSING'],
  PROCESSING: ['PENDING_SYNC', 'SYNCED', 'CONFLICT'],
  SYNCED: [],
  CONFLICT: []
};

export function createOperationId(): string {
  return crypto.randomUUID();
}

/** Adds an operation under the owner of the current persisted session; callers cannot set userId. */
export async function enqueueForActiveAccount(
  operation: NewLocalOutboxOperation,
  database: BokkenDatabase = db
): Promise<LocalOutboxOperation> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.id) || operation.id !== operation.idempotencyKey) {
    throw new TypeError('A operação deve usar o mesmo UUID v4 estável como identificador e chave de idempotência.');
  }

  return database.transaction('rw', database.session, database.outbox, async () => {
    const activeSession = await database.session.get('active_session');
    if (!activeSession?.userId || !activeSession.token) throw new Error('É necessário ter uma sessão autenticada local ativa para enfileirar a operação.');

    const now = Date.now();
    const row = {
      ...operation,
      userId: activeSession.userId,
      status: 'PENDING_SYNC' as const,
      createdAt: now,
      updatedAt: now,
      attemptCount: 0,
      lastError: null,
      syncedAt: null
    } as LocalOutboxOperation;

    await database.outbox.add(row);
    return row;
  });
}

/** Claims only the active account's rows and returns the token stored with that same session. */
export async function claimPendingForActiveAccount(limit = 50, database: BokkenDatabase = db): Promise<ActiveOutboxBatch | null> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError('O limite de operações deve estar entre 1 e 200.');

  return database.transaction('rw', database.session, database.outbox, async () => {
    const activeSession = await database.session.get('active_session');
    if (!activeSession?.userId || !activeSession.token) return null;

    const pending = await database.outbox
      .where('[userId+status]')
      .equals([activeSession.userId, 'PENDING_SYNC'])
      .sortBy('createdAt');
    const claimed: LocalOutboxOperation[] = [];
    const now = Date.now();

    for (const operation of pending.slice(0, limit)) {
      const key: [string, string] = [activeSession.userId, operation.id];
      const current = await database.outbox.get(key);
      if (!current || current.status !== 'PENDING_SYNC') continue;
      const updated = { ...current, status: 'PROCESSING' as const, attemptCount: current.attemptCount + 1, updatedAt: now };
      await database.outbox.put(updated);
      claimed.push(updated);
    }

    return { userId: activeSession.userId, token: activeSession.token, operations: claimed };
  });
}

/** Updates a row only while its owner is still the active persisted account. */
export async function transitionForActiveAccount(
  operationId: string,
  expected: LocalOutboxStatus,
  next: LocalOutboxStatus,
  details: { error?: string | null } = {},
  database: BokkenDatabase = db
): Promise<boolean> {
  if (!ALLOWED_TRANSITIONS[expected].includes(next)) {
    throw new Error(`Transição inválida da outbox: ${expected} -> ${next}.`);
  }

  return database.transaction('rw', database.session, database.outbox, async () => {
    const activeSession = await database.session.get('active_session');
    if (!activeSession?.userId) return false;

    const key: [string, string] = [activeSession.userId, operationId];
    const current = await database.outbox.get(key);
    if (!current || current.status !== expected) return false;

    const now = Date.now();
    const updated: LocalOutboxOperation = {
      ...current,
      status: next,
      updatedAt: now,
      lastError: next === 'PENDING_SYNC' || next === 'CONFLICT' ? (details.error ?? null)?.slice(0, 500) ?? null : null,
      syncedAt: next === 'SYNCED' ? now : current.syncedAt
    };
    await database.outbox.put(updated);
    return true;
  });
}

/** Recovers processing leases left by a closed tab/reload; server idempotency makes retry safe. */
export async function recoverStaleProcessingForActiveAccount(staleBefore = Date.now() - 60_000, database: BokkenDatabase = db): Promise<number> {
  return database.transaction('rw', database.session, database.outbox, async () => {
    const activeSession = await database.session.get('active_session');
    if (!activeSession?.userId) return 0;

    const stale = await database.outbox
      .where('[userId+status+updatedAt]')
      .between([activeSession.userId, 'PROCESSING', Dexie.minKey], [activeSession.userId, 'PROCESSING', staleBefore], true, true)
      .toArray();
    const now = Date.now();
    for (const operation of stale) {
      await database.outbox.put({ ...operation, status: 'PENDING_SYNC', updatedAt: now, lastError: 'Envio interrompido; operação pronta para nova tentativa.' });
    }
    return stale.length;
  });
}
