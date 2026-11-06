import Dexie, { Table } from 'dexie';
import { SafeUser } from '@bokken/shared';

export interface LocalSession {
  key: 'active_session';
  userId: string;
  token: string;
  user: SafeUser;
  savedAt: number;
}

export class BokkenDatabase extends Dexie {
  session!: Table<LocalSession, string>;

  constructor() {
    super('BokkenLocalDB');
    this.version(1).stores({
      session: 'key, userId'
    });
  }
}

export const db = new BokkenDatabase();
