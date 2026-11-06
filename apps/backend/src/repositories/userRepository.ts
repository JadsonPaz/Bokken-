import { prisma } from '../db/prisma.js';
import { User } from '@prisma/client';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  timezone: string;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  deleteAll?(): Promise<void>;
}

export class PrismaUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id }
    });
  }

  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        timezone: data.timezone
      }
    });
  }

  async deleteAll(): Promise<void> {
    await prisma.user.deleteMany();
  }
}

export class InMemoryUserRepository implements IUserRepository {
  private users: User[] = [];

  async findByEmail(email: string): Promise<User | null> {
    const user = this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  }

  async findById(id: string): Promise<User | null> {
    const user = this.users.find(u => u.id === id);
    return user || null;
  }

  async create(data: CreateUserData): Promise<User> {
    const user: User = {
      id: crypto.randomUUID(),
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      timezone: data.timezone,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.users.push(user);
    return user;
  }

  async deleteAll(): Promise<void> {
    this.users = [];
  }
}
