import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Sajjad Naserizadeh', maxLength: 80 })
  @IsOptional() @IsString() @MaxLength(80)
  name?: string;
}
