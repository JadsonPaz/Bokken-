import { contentSyncPageSchema, type ContentSyncPage } from '@bokken/shared';
import { applyContentSyncPageForActiveAccount } from '../db/contentSync.js';
import { db, type BokkenDatabase } from '../db/index.js';

export type ContentSyncPageFetcher = (token: string, cursor: string | null, limit: number) => Promise<unknown>;

async function fetchContentPage(token: string, cursor: string | null, limit: number): Promise<unknown> {
  const { request } = await import('./api.js');
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return request<unknown>(`/sync/content?${params.toString()}`, { method: 'GET' }, token);
}

/** Fetches and commits one page. Repeating it after a network interruption resumes from the stored cursor. */
export async function pullNextContentPageForActiveAccount(
  fetchPage: ContentSyncPageFetcher = fetchContentPage,
  database: BokkenDatabase = db,
  limit = 100
): Promise<ContentSyncPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError('O limite da página deve estar entre 1 e 200.');

  const auth = await database.transaction('r', database.session, database.syncCursors, async () => {
    const activeSession = await database.session.get('active_session');
    if (!activeSession?.userId || !activeSession.token) throw new Error('É necessário ter uma sessão autenticada local ativa para sincronizar conteúdo.');
    const cursor = await database.syncCursors.get([activeSession.userId, 'content']);
    return { userId: activeSession.userId, token: activeSession.token, cursor: cursor?.cursor ?? null };
  });

  const page = contentSyncPageSchema.parse(await fetchPage(auth.token, auth.cursor, limit));
  return applyContentSyncPageForActiveAccount(auth.userId, auth.cursor, page, database);
}
