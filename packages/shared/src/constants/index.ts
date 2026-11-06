export const APP_NAME = 'Bokken Estudos';
export const APP_VERSION = '0.1.0';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const SRS_CONFIG = {
  // Pesos para o cálculo probabilístico da prioridade
  ERROR_WEIGHT: 2.5,
  NEW_QUESTION_PRIORITY: 3.0,
  DAYS_INACTIVE_WEIGHT: 0.5,
  MAX_PRIORITY_SCORE: 10.0,
  MIN_PRIORITY_SCORE: 0.5,
  // Limites de intervalos recomendados (em dias)
  INTERVAL_STEPS_DAYS: [1, 3, 7, 14, 30, 60]
};

export const QUIZ_LIMITS = {
  DEFAULT_QUESTION_COUNT: 10,
  MIN_QUESTION_COUNT: 1,
  MAX_QUESTION_COUNT: 100,
  DEFAULT_TIME_LIMIT_SECONDS: 600 // 10 minutos
};
