import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({ example: ['dashboard:read'], type: [String] })
  @IsArray() @ArrayUnique() @IsString({ each: true })
  permissionKeys!: string[];
}
