export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: any;

  constructor(message: string, status = 400, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
  } catch (err: any) {
    // Erro de rede (offline ou servidor fora do ar)
    throw new ApiError('Sem conexão com o servidor. Verifique sua conexão com a internet.', 0);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage = data?.error || 'Ocorreu um erro ao processar a requisição.';
    throw new ApiError(errorMessage, response.status, data?.details);
  }

  return data as T;
}
