import { IFocusRepository, PrismaFocusRepository, CreateFocusData, UpdateFocusData } from '../repositories/focusRepository.js';
import { createFocusSchema, updateFocusSchema, FocusWithCount, Focus } from '@bokken/shared';
import { AppError } from '../utils/errors.js';

export class FocusService {
  constructor(private focusRepository: IFocusRepository = new PrismaFocusRepository()) {}

  async listFoci(userId: string): Promise<FocusWithCount[]> {
    return this.focusRepository.findAllByUserId(userId);
  }

  async getFocus(id: string, userId: string): Promise<Focus> {
    const focus = await this.focusRepository.findById(id, userId);
    if (!focus) {
      throw new AppError('Foco não encontrado', 404);
    }
    return focus as unknown as Focus;
  }

  async createFocus(userId: string, input: unknown): Promise<Focus> {
    const validated = createFocusSchema.parse(input);
    const data: CreateFocusData = {
      userId,
      name: validated.name.trim(),
      description: validated.description?.trim() || null,
      color: validated.color || '#1e3a8a'
    };

    return this.focusRepository.create(data);
  }

  async updateFocus(id: string, userId: string, input: unknown): Promise<Focus> {
    const validated = updateFocusSchema.parse(input);
    const data: UpdateFocusData = {
      ...(validated.name !== undefined && { name: validated.name.trim() }),
      ...(validated.description !== undefined && { description: validated.description?.trim() || null }),
      ...(validated.color !== undefined && { color: validated.color })
    };

    const updated = await this.focusRepository.update(id, userId, data);
    if (!updated) {
      throw new AppError('Foco não encontrado ou não pertence ao usuário', 404);
    }

    return updated;
  }

  async deleteFocus(id: string, userId: string): Promise<void> {
    const deleted = await this.focusRepository.softDelete(id, userId);
    if (!deleted) {
      throw new AppError('Foco não encontrado ou não pertence ao usuário', 404);
    }
  }
}
