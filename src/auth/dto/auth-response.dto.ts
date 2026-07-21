import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 'cm123abc' }) id!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiPropertyOptional({ example: 'Ada Lovelace', nullable: true }) name!: string | null;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT bearer token' }) accessToken!: string;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}
