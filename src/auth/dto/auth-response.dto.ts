import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty({ example: 'cm123abc' }) id!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiPropertyOptional({ example: 'Ada Lovelace', nullable: true }) name!: string | null;
  @ApiPropertyOptional({ example: ['user'], type: [String], description: 'Assigned role keys; included by the current-user endpoint.' }) roles?: string[];
  @ApiPropertyOptional({ example: ['dashboard:read'], type: [String], description: 'Effective permission keys; included by the current-user endpoint.' }) permissions?: string[];
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT bearer token' }) accessToken!: string;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}
