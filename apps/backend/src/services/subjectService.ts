import { ISubjectRepository, PrismaSubjectRepository, CreateSubjectData, UpdateSubjectData } from '../repositories/subjectRepository.js';
import { createSubjectSchema, updateSubjectSchema, SubjectWithCount, Subject } from '@bokken/shared';
import { AppError } from '../utils/errors.js';

export class SubjectService {
  constructor(private subjectRepository: ISubjectRepository = new PrismaSubjectRepository()) {}

  async listSubjects(focusId: string, userId: string): Promise<SubjectWithCount[]> {
    if (!focusId) {
      throw new AppError('O parâmetro focusId é obrigatório', 400);
    }
    return this.subjectRepository.findAllByFocusId(focusId, userId);
  }

  async getSubject(id: string, userId: string): Promise<SubjectWithCount> {
    const subject = await this.subjectRepository.findById(id, userId);
    if (!subject) {
      throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }
    return subject;
  }

  async createSubject(userId: string, input: unknown): Promise<Subject> {
    const validated = createSubjectSchema.parse(input);
    const data: CreateSubjectData = {
      focusId: validated.focusId,
      name: validated.name.trim(),
      description: validated.description?.trim() || null
    };

    return this.subjectRepository.create(data, userId);
  }

  async updateSubject(id: string, userId: string, input: unknown): Promise<Subject> {
    const validated = updateSubjectSchema.parse(input);
    const data: UpdateSubjectData = {
      ...(validated.name !== undefined && { name: validated.name.trim() }),
      ...(validated.description !== undefined && { description: validated.description?.trim() || null })
    };

    const updated = await this.subjectRepository.update(id, userId, data);
    if (!updated) {
      throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }

    return updated;
  }

  async deleteSubject(id: string, userId: string): Promise<void> {
    const deleted = await this.subjectRepository.softDelete(id, userId);
    if (!deleted) {
      throw new AppError('Matéria não encontrada ou não pertence ao usuário', 404);
    }
  }
}
