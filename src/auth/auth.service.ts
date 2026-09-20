import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RbacService } from '../rbac/rbac.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '../audit/audit.service';
import { PasswordResetNotificationService } from './password-reset-notification.service';

type UserSession = { id: string; email: string; name: string | null };
type Session = { accessToken: string; refreshToken: string; user: UserSession };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private rbac: RbacService,
    private audit: AuditService,
    private passwordResetNotifications: PasswordResetNotificationService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email is already registered');
    const role = await this.rbac.defaultUserRole();
    const user = await this.prisma.user.create({ data: { email, name: dto.name?.trim() || null, passwordHash: await bcrypt.hash(dto.password, 12), roles: { create: { roleId: role.id } } } });
    const session = await this.session(user);
    await this.audit.record('identity.registered', 'user', user.id, user.id);
    return session;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    const session = await this.session(user);
    await this.audit.record('identity.logged_in', 'user', user.id, user.id);
    return session;
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync<{ sub: string; email: string; type?: string }>(refreshToken);
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid refresh token');
    const tokenHash = this.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) throw new UnauthorizedException('Refresh token is expired or revoked');
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      const user = stored.user;
      const next = await this.session(user, tx);
      await tx.refreshToken.update({ where: { id: stored.id }, data: { replacedById: next.refreshTokenId } });
      return next;
    });
    await this.audit.record('identity.session_refreshed', 'user', stored.userId, stored.userId);
    return session;
  }

  async logout(refreshToken?: string) {
    if (refreshToken) await this.prisma.refreshToken.updateMany({ where: { tokenHash: this.hash(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true, emailVerifiedAt: true } });
    return { ...user, ...(await this.rbac.accessForUser(id)) };
  }

  loginAndSignupHistory(id: string) {
    return this.audit.loginAndSignupHistory(id);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({ where: { id }, data: { name: dto.name?.trim() || null } });
    await this.audit.record('identity.profile_updated', 'user', id, id);
    return this.me(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { passwordHash: true } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.record('identity.password_changed', 'user', id, id);
    return { message: 'Password updated successfully' };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) return { message: 'If the account exists, a reset link will be sent.' };
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: this.hash(token), expiresAt: new Date(now.getTime() + 60 * 60 * 1000) } });
    });
    await this.passwordResetNotifications.sendPasswordReset(user.email, token);
    await this.audit.record('identity.password_reset_requested', 'user', user.id, user.id);
    return { message: 'If the account exists, a reset link will be sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const now = new Date();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const reset = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { tokenHash: this.hash(token), usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('Reset token is invalid or expired');
      const usedToken = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: this.hash(token) }, select: { userId: true } });
      await tx.user.update({ where: { id: usedToken.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: usedToken.userId, revokedAt: null }, data: { revokedAt: now } });
      return usedToken;
    });
    await this.audit.record('identity.password_reset_completed', 'user', reset.userId, reset.userId);
    return { message: 'Password updated successfully' };
  }

  private async session(user: UserSession, client: Pick<PrismaService, 'refreshToken'> = this.prisma): Promise<Session & { refreshTokenId: string }> {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, type: 'access' }, { expiresIn: '15m' });
    const refreshToken = this.jwt.sign({ sub: user.id, email: user.email, type: 'refresh', jti: randomBytes(16).toString('hex') }, { expiresIn: '30d' });
    const record = await client.refreshToken.create({ data: { userId: user.id, tokenHash: this.hash(refreshToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return { accessToken, refreshToken, refreshTokenId: record.id, user };
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
