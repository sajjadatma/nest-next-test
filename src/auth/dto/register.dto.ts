import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail() email!: string;
  @ApiProperty({ example: 'secure-password', minLength: 8, format: 'password' })
  @IsString() @MinLength(8) password!: string;
  @ApiPropertyOptional({ example: 'Ada Lovelace', maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
