import { Body, Controller, Get, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags, ApiTooManyRequestsResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create an account' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  @ApiTooManyRequestsResponse({ description: 'Too many authentication attempts' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) { return this.respondWithSession(await this.auth.register(dto), response); }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiTooManyRequestsResponse({ description: 'Too many authentication attempts' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) { return this.respondWithSession(await this.auth.login(dto), response); }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.refresh_token as string | undefined;
    if (!token) return { message: 'No active session' };
    return this.respondWithSession(await this.auth.refresh(token), response);
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) { await this.auth.logout(request.cookies?.refresh_token as string | undefined); response.clearCookie('refresh_token', { path: '/api/auth' }); return { message: 'Logged out successfully' }; }

  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) { return this.auth.requestPasswordReset(dto.email); }

  @Post('password-reset/confirm')
  resetPassword(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto.token, dto.newPassword); }

  @UseGuards(JwtAuthGuard) @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async me(@CurrentUser() user: { id: string; email: string }) {
    return this.auth.me(user.id);
  }

  @UseGuards(JwtAuthGuard) @Patch('me')
  @ApiBearerAuth() @ApiOperation({ summary: 'Update the authenticated user profile' }) @ApiOkResponse({ type: AuthUserDto })
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) { return this.auth.updateProfile(user.id, dto); }

  @UseGuards(JwtAuthGuard) @Patch('me/password')
  @ApiBearerAuth() @ApiOperation({ summary: 'Change the authenticated user password' })
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(user.id, dto); }

  private respondWithSession(session: Awaited<ReturnType<AuthService['login']>>, response: Response) {
    response.cookie('refresh_token', session.refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth', maxAge: 30 * 24 * 60 * 60 * 1000 });
    return { accessToken: session.accessToken, user: session.user };
  }
}
