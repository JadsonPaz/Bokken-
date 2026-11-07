import { CreateQuizSessionInput, QuizSessionDetail } from '@bokken/shared';
import { request } from './api.js';
export async function createQuiz(payload: CreateQuizSessionInput, token: string): Promise<QuizSessionDetail> { return (await request<{session: QuizSessionDetail}>('/quizzes/sessions', {method:'POST', body:JSON.stringify(payload)}, token)).session; }
export async function getQuiz(id: string, token: string): Promise<QuizSessionDetail> { return (await request<{session: QuizSessionDetail}>(`/quizzes/sessions/${id}`, {}, token)).session; }
export async function answerQuiz(id: string, questionId: string, payload: unknown, token: string) { return request<{attempt: any; alreadyRecorded: boolean}>(`/quizzes/sessions/${id}/questions/${questionId}/answer`, {method:'POST',body:JSON.stringify(payload)}, token); }
export async function skipQuiz(id: string, questionId: string, token: string) { return request(`/quizzes/sessions/${id}/questions/${questionId}/skip`, {method:'POST'}, token); }
export async function revealQuizAnswer(id: string, questionId: string, token: string): Promise<{expectedAnswer: string; explanation: string | null}> { return request(`/quizzes/sessions/${id}/questions/${questionId}/reveal`, {method:'POST'}, token); }
export async function completeQuiz(id: string, token: string): Promise<QuizSessionDetail> { return (await request<{session: QuizSessionDetail}>(`/quizzes/sessions/${id}/complete`, {method:'POST'}, token)).session; }
