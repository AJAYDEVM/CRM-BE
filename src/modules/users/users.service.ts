import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { AuditAction } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, userId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { password, ...rest } = dto;

    const user = await this.prisma.user.create({
      data: { ...rest, passwordHash },
      select: this.userSelect,
    });

    await this.audit.log({
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.CREATE,
      userId,
      changes: { email: dto.email, firstName: dto.firstName, lastName: dto.lastName, role: dto.role },
    });

    return user;
  }

  findAll() {
    return this.prisma.user.findMany({ select: this.userSelect, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: this.userSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      delete data.password;
    }
    const user = await this.prisma.user.update({ where: { id }, data, select: this.userSelect });

    const changes = { ...dto };
    if (changes.password) {
      changes.password = '[redacted]';
    }

    await this.audit.log({
      entityType: 'User',
      entityId: id,
      action: AuditAction.UPDATE,
      userId: actorId,
      changes: changes as unknown as Record<string, unknown>,
    });

    return user;
  }

  async deactivate(id: string, actorId: string) {
    return this.update(id, { isActive: false }, actorId);
  }

  async activate(id: string, actorId: string) {
    return this.update(id, { isActive: true }, actorId);
  }

  private userSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  };
}
