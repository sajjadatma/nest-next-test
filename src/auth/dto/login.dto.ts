import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail() email!: string;
  @ApiProperty({ example: 'secure-password', minLength: 8, format: 'password' })
  @IsString() @MinLength(8) password!: string;
}
