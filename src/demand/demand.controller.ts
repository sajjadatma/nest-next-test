import { BadRequestException, Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionKey } from '../rbac/rbac.constants';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { DemandAggregatesService, demandSummaryOutcomes, type DemandSummaryOutcome } from './demand-aggregates.service';

export class DemandSummaryQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsIn(demandSummaryOutcomes) outcome?: DemandSummaryOutcome;
}

@ApiTags('Demand')
@Controller('demand')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DemandController {
  constructor(private readonly aggregates: DemandAggregatesService) {}

  @Get('summary')
  @RequirePermissions(PermissionKey.DemandRead)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read merchant-scoped deterministic demand aggregates' })
  @ApiOkResponse()
  summary(
    @Headers('x-merchant-id') merchantHeader: string | string[] | undefined,
    @Query() query: DemandSummaryQueryDto,
    @CurrentUser() user: { id: string },
  ) {
    const merchantId = this.requiredHeader(merchantHeader, 'x-merchant-id');
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf()) || from > to) {
      throw new BadRequestException('demand summary dates must form a valid chronological range');
    }
    return this.aggregates.summary({ merchantId, from, to, outcome: query.outcome, actorId: user.id });
  }

  private requiredHeader(value: string | string[] | undefined, name: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${name} is required`);
    return value.trim();
  }
}
