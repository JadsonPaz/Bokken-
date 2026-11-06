import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SafeUser, AuthResponse } from '@bokken/shared';
import { db } from '../db/index.js';
import { request, ApiError } from '../services/api.js';

interface AuthContextType {
  user: SafeUser | null;
  token: string | null;
  isLoading: boolean;
  isOnline: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { name: string; email: string; password: string; timezone?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Monitoramento do status de conectividade
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Inicialização da sessão com persistência segura no IndexedDB (Dexie)
  useEffect(() => {
    async function restoreSession() {
      try {
        const localSession = await db.session.get('active_session');

        if (localSession && localSession.token && localSession.user) {
          // Permite entrada imediata com dados locais (suporte 100% offline)
          setUser(localSession.user);
          setToken(localSession.token);

          // Se estiver online, valida/revalida com o servidor em segundo plano
          if (navigator.onLine) {
            try {
              const res = await request<{ user: SafeUser }>('/auth/me', { method: 'GET' }, localSession.token);
              setUser(res.user);
              // Atualiza cache local com os dados atualizados
              await db.session.put({
                ...localSession,
                user: res.user,
                savedAt: Date.now()
              });
            } catch (err: any) {
              if (err instanceof ApiError && err.status === 401) {
                // Token expirou ou foi invalidado no servidor
                await db.session.delete('active_session');
                setUser(null);
                setToken(null);
              }
              // Se foi erro de rede (status 0), mantém o estado offline sem deslogar!
            }
          }
        }
      } catch (err) {
        console.error('Falha ao restaurar sessão local:', err);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    const response = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });

    await db.session.put({
      key: 'active_session',
      userId: response.user.id,
      token: response.token,
      user: response.user,
      savedAt: Date.now()
    });

    setUser(response.user);
    setToken(response.token);
  };

  const register = async (data: { name: string; email: string; password: string; timezone?: string }) => {
    // Fallback de fuso horário
    const detectedTimezone = data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

    const response = await request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        timezone: detectedTimezone
      })
    });

    await db.session.put({
      key: 'active_session',
      userId: response.user.id,
      token: response.token,
      user: response.user,
      savedAt: Date.now()
    });

    setUser(response.user);
    setToken(response.token);
  };

  const logout = async () => {
    await db.session.delete('active_session');
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isOnline,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
