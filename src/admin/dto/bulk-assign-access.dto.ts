import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsString, ValidateNested } from 'class-validator';
import { AssignPermissionsDto } from './assign-permissions.dto';
import { AssignRolesDto } from './assign-roles.dto';

class AccessAssignmentDto extends AssignRolesDto {
  @ApiProperty({ example: 'cmrv3ygb20008rm26kdybjdwv' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: ['dashboard:read'], type: [String] })
  @IsArray() @ArrayUnique() @IsString({ each: true })
  declare permissionKeys: AssignPermissionsDto['permissionKeys'];
}

export class BulkAssignAccessDto {
  @ApiProperty({ type: [AccessAssignmentDto] })
  @IsArray() @ArrayNotEmpty() @ArrayUnique((assignment: AccessAssignmentDto) => assignment.userId)
  @ValidateNested({ each: true }) @Type(() => AccessAssignmentDto)
  assignments!: AccessAssignmentDto[];
}
