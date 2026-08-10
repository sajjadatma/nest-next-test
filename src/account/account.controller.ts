import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccountService } from './account.service';
import { AccountOrdersQueryDto, RecordConsentDto, RequestDeletionDto, SaveAddressDto, UpdateAccountProfileDto, UpdatePreferencesDto } from './dto/account.dto';

@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}
  @Get('profile') profile(@CurrentUser() user: { id: string }) { return this.account.profile(user.id); }
  @Patch('profile') updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateAccountProfileDto) { return this.account.updateProfile(user.id, dto); }
  @Get('addresses') addresses(@CurrentUser() user: { id: string }) { return this.account.addresses(user.id); }
  @Post('addresses') createAddress(@CurrentUser() user: { id: string }, @Body() dto: SaveAddressDto) { return this.account.createAddress(user.id, dto); }
  @Patch('addresses/:id') updateAddress(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: SaveAddressDto) { return this.account.updateAddress(user.id, id, dto); }
  @Delete('addresses/:id') deleteAddress(@CurrentUser() user: { id: string }, @Param('id') id: string) { return this.account.deleteAddress(user.id, id); }
  @Get('preferences') preferences(@CurrentUser() user: { id: string }) { return this.account.preferences(user.id); }
  @Patch('preferences') updatePreferences(@CurrentUser() user: { id: string }, @Body() dto: UpdatePreferencesDto) { return this.account.updatePreferences(user.id, dto); }
  @Get('consents') consents(@CurrentUser() user: { id: string }) { return this.account.consents(user.id); }
  @Post('consents') recordConsent(@CurrentUser() user: { id: string }, @Body() dto: RecordConsentDto) { return this.account.recordConsent(user.id, dto); }
  @Get('orders') orders(@CurrentUser() user: { id: string }, @Query() query: AccountOrdersQueryDto) { return this.account.orders(user.id, query); }
  @Get('payments') payments(@CurrentUser() user: { id: string }) { return this.account.payments(user.id); }
  @Get('sessions') sessions(@CurrentUser() user: { id: string }) { return this.account.sessions(user.id); }
  @Delete('sessions/:id') revokeSession(@CurrentUser() user: { id: string }, @Param('id') id: string) { return this.account.revokeSession(user.id, id); }
  @Post('export') exportData(@CurrentUser() user: { id: string }) { return this.account.exportData(user.id); }
  @Post('deletion-request') requestDeletion(@CurrentUser() user: { id: string }, @Body() dto: RequestDeletionDto) { return this.account.requestDeletion(user.id, dto); }
  @Post('deletion-request/cancel') cancelDeletion(@CurrentUser() user: { id: string }) { return this.account.cancelDeletion(user.id); }
}
