import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardMetricDto {
  @ApiProperty({ example: 'Registered users' }) label!: string;
  @ApiProperty({ example: 3, oneOf: [{ type: 'number' }, { type: 'string' }] }) value!: string | number;
}

export class RecentUserDto {
  @ApiProperty({ example: 'cm123abc' }) id!: string;
  @ApiProperty({ example: 'ada@example.com' }) email!: string;
  @ApiPropertyOptional({ example: 'Ada Lovelace', nullable: true }) name!: string | null;
  @ApiProperty({ example: '2026-07-21T16:46:38.962Z', format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ example: ['user'], type: [String] }) roles!: { role: { key: string } }[];
}

export class DashboardResponseDto {
  @ApiProperty({ type: [DashboardMetricDto] }) metrics!: DashboardMetricDto[];
  @ApiProperty({ type: [RecentUserDto] }) recentUsers!: RecentUserDto[];
}
