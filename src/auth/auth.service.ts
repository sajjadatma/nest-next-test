import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private rbac: RbacService) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email is already registered');
    const role = await this.rbac.defaultUserRole();
    const user = await this.prisma.user.create({ data: { email, name: dto.name?.trim() || null, passwordHash: await bcrypt.hash(dto.password, 12), roles: { create: { roleId: role.id } } } });
    return this.session(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    return this.session(user);
  }

  async me(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true, roles: { select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } } } });
    return { id: user.id, email: user.email, name: user.name, roles: user.roles.map(({ role }) => role.key), permissions: [...new Set(user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))] };
  }

  private session(user: { id: string; email: string; name: string | null }) {
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email }), user: { id: user.id, email: user.email, name: user.name } };
  }
}
