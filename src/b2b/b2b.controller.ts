import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PermissionKey } from '../rbac/rbac.constants';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { B2bService } from './b2b.service';
import { B2bCartQueryDto, B2bPurchaseRequestQueryDto, CatalogQueryDto, CreateB2bPurchaseRequestDto, EffectivePriceQueryDto, ReviewB2bPurchaseRequestDto, SaveB2bCartLineDto, SaveCustomerGroupDto, SavePriceListDto, SavePriceListItemDto, SavePriceTierDto, SaveVariantDto, UpdateB2bOrderStatusDto } from './dto/b2b.dto';
import { AddCompanyMemberDto, CreateCompanyDto, SaveCompanyAddressDto, UpdateCompanyDto, UpdateCompanyMemberDto } from './dto/company.dto';

@ApiTags('B2B catalog') @ApiBearerAuth() @UseGuards(JwtAuthGuard)
@Controller('b2b')
export class B2bCatalogController {
  constructor(private readonly b2b: B2bService) {}
  @Get('companies') companies(@CurrentUser() user: { id: string }) { return this.b2b.listCompanies(user.id); }
  @Get('companies/:companyId') company(@Param('companyId') companyId: string, @CurrentUser() user: { id: string }) { return this.b2b.getMyCompany(user.id, companyId); }
  @Get('companies/:companyId/addresses') companyAddresses(@Param('companyId') companyId: string, @CurrentUser() user: { id: string }) { return this.b2b.companyAddresses(companyId, user.id); }
  @Post('companies/:companyId/addresses') createCompanyAddress(@Param('companyId') companyId: string, @Body() dto: SaveCompanyAddressDto, @CurrentUser() user: { id: string }) { return this.b2b.createCompanyAddress(companyId, dto, user.id); }
  @Patch('companies/:companyId/addresses/:addressId') updateCompanyAddress(@Param('companyId') companyId: string, @Param('addressId') addressId: string, @Body() dto: SaveCompanyAddressDto, @CurrentUser() user: { id: string }) { return this.b2b.updateCompanyAddress(companyId, addressId, dto, user.id); }
  @Delete('companies/:companyId/addresses/:addressId') archiveCompanyAddress(@Param('companyId') companyId: string, @Param('addressId') addressId: string, @CurrentUser() user: { id: string }) { return this.b2b.archiveCompanyAddress(companyId, addressId, user.id); }
  @Get('companies/:companyId/catalog') catalog(@Param('companyId') companyId: string, @Query() query: CatalogQueryDto, @CurrentUser() user: { id: string }) { return this.b2b.catalog(companyId, user.id, query); }
  @Get('companies/:companyId/catalog/:variantId/price') price(@Param('companyId') companyId: string, @Param('variantId') variantId: string, @Query() query: EffectivePriceQueryDto, @CurrentUser() user: { id: string }) { return this.b2b.price(companyId, user.id, variantId, query.quantity, query.currency); }
  @Get('companies/:companyId/cart') cart(@Param('companyId') companyId: string, @Query() query: B2bCartQueryDto, @CurrentUser() user: { id: string }) { return this.b2b.getCart(companyId, user.id, query); }
  @Post('companies/:companyId/cart/lines') addCartLine(@Param('companyId') companyId: string, @Body() dto: SaveB2bCartLineDto, @CurrentUser() user: { id: string }) { return this.b2b.addCartLine(companyId, user.id, dto); }
  @Patch('companies/:companyId/cart/lines/:variantId') updateCartLine(@Param('companyId') companyId: string, @Param('variantId') variantId: string, @Body() dto: SaveB2bCartLineDto, @CurrentUser() user: { id: string }) { return this.b2b.updateCartLine(companyId, user.id, variantId, dto); }
  @Delete('companies/:companyId/cart/lines/:variantId') removeCartLine(@Param('companyId') companyId: string, @Param('variantId') variantId: string, @Query() query: B2bCartQueryDto, @CurrentUser() user: { id: string }) { return this.b2b.removeCartLine(companyId, user.id, variantId, query); }
  @Delete('companies/:companyId/cart') clearCart(@Param('companyId') companyId: string, @Query() query: B2bCartQueryDto, @CurrentUser() user: { id: string }) { return this.b2b.clearCart(companyId, user.id, query); }
  @Post('companies/:companyId/purchase-requests') createPurchaseRequest(@Param('companyId') companyId: string, @Body() dto: CreateB2bPurchaseRequestDto, @CurrentUser() user: { id: string }) { return this.b2b.createPurchaseRequest(companyId, user.id, dto); }
  @Get('companies/:companyId/purchase-requests') purchaseRequests(@Param('companyId') companyId: string, @Query() query: B2bPurchaseRequestQueryDto, @CurrentUser() user: { id: string }) { return this.b2b.listPurchaseRequests(companyId, user.id, query); }
  @Get('companies/:companyId/purchase-requests/:requestId') purchaseRequest(@Param('companyId') companyId: string, @Param('requestId') requestId: string, @CurrentUser() user: { id: string }) { return this.b2b.getPurchaseRequest(companyId, requestId, user.id); }
  @Post('companies/:companyId/purchase-requests/:requestId/review') reviewPurchaseRequest(@Param('companyId') companyId: string, @Param('requestId') requestId: string, @Body() dto: ReviewB2bPurchaseRequestDto, @CurrentUser() user: { id: string }) { return this.b2b.reviewPurchaseRequest(companyId, requestId, dto, user.id); }
  @Post('companies/:companyId/purchase-requests/:requestId/cancel') cancelPurchaseRequest(@Param('companyId') companyId: string, @Param('requestId') requestId: string, @CurrentUser() user: { id: string }) { return this.b2b.cancelPurchaseRequest(companyId, requestId, user.id); }
  @Post('companies/:companyId/purchase-requests/:requestId/order') createB2bOrder(@Param('companyId') companyId: string, @Param('requestId') requestId: string, @CurrentUser() user: { id: string }) { return this.b2b.createB2bOrder(companyId, requestId, user.id); }
  @Get('companies/:companyId/orders') b2bOrders(@Param('companyId') companyId: string, @CurrentUser() user: { id: string }) { return this.b2b.listB2bOrders(companyId, user.id); }
  @Get('companies/:companyId/orders/:orderId') b2bOrder(@Param('companyId') companyId: string, @Param('orderId') orderId: string, @CurrentUser() user: { id: string }) { return this.b2b.getB2bOrder(companyId, orderId, user.id); }
}

@ApiTags('B2B management') @ApiBearerAuth() @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage)
@Controller('shop/admin/b2b')
export class B2bManagementController {
  constructor(private readonly b2b: B2bService) {}
  @Get('variants') variants(@Query('q') q?: string) { return this.b2b.listVariants(q); }
  @Get('variants/:id') variant(@Param('id') id: string) { return this.b2b.getVariant(id); }
  @Post('products/:productId/variants') createVariant(@Param('productId') productId: string, @Body() dto: SaveVariantDto) { return this.b2b.createVariant(productId, dto); }
  @Patch('variants/:id') updateVariant(@Param('id') id: string, @Body() dto: SaveVariantDto) { return this.b2b.updateVariant(id, dto); }
  @Delete('variants/:id') archiveVariant(@Param('id') id: string) { return this.b2b.archiveVariant(id); }
  @Get('customer-groups') groups() { return this.b2b.customerGroups(); }
  @Post('customer-groups') createGroup(@Body() dto: SaveCustomerGroupDto) { return this.b2b.createCustomerGroup(dto); }
  @Patch('customer-groups/:id') updateGroup(@Param('id') id: string, @Body() dto: SaveCustomerGroupDto) { return this.b2b.updateCustomerGroup(id, dto); }
  @Get('price-lists') priceLists(@Query('customerGroupId') customerGroupId?: string) { return this.b2b.priceLists(customerGroupId); }
  @Post('price-lists') createPriceList(@Body() dto: SavePriceListDto) { return this.b2b.createPriceList(dto); }
  @Patch('price-lists/:id') updatePriceList(@Param('id') id: string, @Body() dto: SavePriceListDto) { return this.b2b.updatePriceList(id, dto); }
  @Delete('price-lists/:id') archivePriceList(@Param('id') id: string) { return this.b2b.archivePriceList(id); }
  @Post('price-list-items') savePriceListItem(@Body() dto: SavePriceListItemDto) { return this.b2b.savePriceListItem(dto); }
  @Post('price-tiers') savePriceTier(@Body() dto: SavePriceTierDto) { return this.b2b.savePriceTier(dto); }
}

@ApiTags('B2B company management') @ApiBearerAuth() @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopB2bManage)
@Controller('shop/admin/b2b')
export class B2bCompanyManagementController {
  constructor(private readonly b2b: B2bService) {}
  @Get('companies') companies() { return this.b2b.listCompanies(); }
  @Post('companies') create(@Body() dto: CreateCompanyDto, @CurrentUser() user: { id: string }) { return this.b2b.createCompany(dto, user.id); }
  @Get('companies/:companyId') company(@Param('companyId') companyId: string) { return this.b2b.getCompanyForStaff(companyId); }
  @Patch('companies/:companyId') update(@Param('companyId') companyId: string, @Body() dto: UpdateCompanyDto, @CurrentUser() user: { id: string }) { return this.b2b.updateCompany(companyId, dto, user.id); }
  @Delete('companies/:companyId') archive(@Param('companyId') companyId: string, @CurrentUser() user: { id: string }) { return this.b2b.archiveCompany(companyId, user.id); }
  @Get('companies/:companyId/members') members(@Param('companyId') companyId: string) { return this.b2b.listMemberships(companyId); }
  @Post('companies/:companyId/members') addMember(@Param('companyId') companyId: string, @Body() dto: AddCompanyMemberDto, @CurrentUser() user: { id: string }) { return this.b2b.addMember(companyId, dto, user.id); }
  @Patch('companies/:companyId/members/:membershipId') updateMember(@Param('companyId') companyId: string, @Param('membershipId') membershipId: string, @Body() dto: UpdateCompanyMemberDto, @CurrentUser() user: { id: string }) { return this.b2b.updateMember(companyId, membershipId, dto, user.id); }
  @Delete('companies/:companyId/members/:membershipId') removeMember(@Param('companyId') companyId: string, @Param('membershipId') membershipId: string, @CurrentUser() user: { id: string }) { return this.b2b.removeMember(companyId, membershipId, user.id); }
  @Get('orders') orders() { return this.b2b.listB2bOrdersForStaff(); }
  @Patch('orders/:orderId/status') updateOrderStatus(@Param('orderId') orderId: string, @Body() dto: UpdateB2bOrderStatusDto, @CurrentUser() user: { id: string }) { return this.b2b.updateB2bOrderStatus(orderId, dto.status, user.id); }
}
