import { request } from './api.js';
import { FocusWithCount, SubjectWithCount, Question, PaginatedResponse } from '@bokken/shared';

// ---- Tipos de resposta ----
interface FocusResponse { focus: FocusWithCount }
interface FociResponse { foci: FocusWithCount[] }
interface SubjectResponse { subject: SubjectWithCount }
interface SubjectsResponse { subjects: SubjectWithCount[] }
interface QuestionResponse { question: Question }
interface DeleteResponse { message: string }

// ---- Focos ----
export async function listFoci(token: string): Promise<FocusWithCount[]> {
  const data = await request<FociResponse>('/foci', {}, token);
  return data.foci;
}

export async function getFocus(id: string, token: string): Promise<FocusWithCount> {
  const data = await request<FocusResponse>(`/foci/${id}`, {}, token);
  return data.focus;
}

export async function createFocus(
  payload: { name: string; description?: string; color?: string },
  token: string
): Promise<FocusWithCount> {
  const data = await request<FocusResponse>('/foci', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, token);
  return data.focus;
}

export async function updateFocus(
  id: string,
  payload: { name?: string; description?: string | null; color?: string | null },
  token: string
): Promise<FocusWithCount> {
  const data = await request<FocusResponse>(`/foci/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }, token);
  return data.focus;
}

export async function deleteFocus(id: string, token: string): Promise<void> {
  await request<DeleteResponse>(`/foci/${id}`, { method: 'DELETE' }, token);
}

// ---- Matérias ----
export async function listSubjects(focusId: string, token: string): Promise<SubjectWithCount[]> {
  const data = await request<SubjectsResponse>(`/subjects?focusId=${encodeURIComponent(focusId)}`, {}, token);
  return data.subjects;
}

export async function getSubject(id: string, token: string): Promise<SubjectWithCount> {
  const data = await request<SubjectResponse>(`/subjects/${id}`, {}, token);
  return data.subject;
}

export async function createSubject(
  payload: { focusId: string; name: string; description?: string },
  token: string
): Promise<SubjectWithCount> {
  const data = await request<SubjectResponse>('/subjects', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, token);
  return data.subject;
}

export async function updateSubject(
  id: string,
  payload: { name?: string; description?: string | null },
  token: string
): Promise<SubjectWithCount> {
  const data = await request<SubjectResponse>(`/subjects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }, token);
  return data.subject;
}

export async function deleteSubject(id: string, token: string): Promise<void> {
  await request<DeleteResponse>(`/subjects/${id}`, { method: 'DELETE' }, token);
}

// ---- Perguntas ----
export async function listQuestions(
  subjectId: string,
  params: { search?: string; page?: number; limit?: number },
  token: string
): Promise<PaginatedResponse<Question>> {
  const qs = new URLSearchParams({ subjectId });
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  return request<PaginatedResponse<Question>>(`/questions?${qs.toString()}`, {}, token);
}

export async function getQuestion(id: string, token: string): Promise<Question> {
  const data = await request<QuestionResponse>(`/questions/${id}`, {}, token);
  return data.question;
}

export async function createQuestion(payload: unknown, token: string): Promise<Question> {
  const data = await request<QuestionResponse>('/questions', {
    method: 'POST',
    body: JSON.stringify(payload)
  }, token);
  return data.question;
}

export async function updateQuestion(id: string, payload: unknown, token: string): Promise<Question> {
  const data = await request<QuestionResponse>(`/questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  }, token);
  return data.question;
}

export async function deleteQuestion(id: string, token: string): Promise<void> {
  await request<DeleteResponse>(`/questions/${id}`, { method: 'DELETE' }, token);
}
