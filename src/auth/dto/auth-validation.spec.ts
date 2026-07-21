import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { UpdateProfileDto } from './update-profile.dto';

describe('Authentication DTO validation', () => {
  it.each([
    [RegisterDto, { email: 'invalid', password: 'short' }],
    [LoginDto, { email: 'missing-at-sign', password: '' }],
    [ChangePasswordDto, { currentPassword: 'short', newPassword: 'short' }],
    [UpdateProfileDto, { name: 'x'.repeat(81) }],
  ])('rejects invalid %p input', async (Dto, value) => {
    expect(await validate(plainToInstance(Dto, value))).not.toHaveLength(0);
  });
});
