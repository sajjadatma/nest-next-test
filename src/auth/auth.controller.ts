import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post('register')
  @ApiOperation({ summary: 'Create an account' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

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
}
