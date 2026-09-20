import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({ example: ['user'], type: [String] })
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsString({ each: true })
  roleKeys!: string[];
}
