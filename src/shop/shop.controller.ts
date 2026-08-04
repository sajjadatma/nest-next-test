import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateOrderDto, OrderQuoteDto } from './dto/create-order.dto';
import { ShopService } from './shop.service';
import { AdminOrdersQueryDto, AnalyticsQueryDto, CreateOrderNoteDto, CreateProductCommentDto, InventoryAdjustmentDto, ManageOrderStatusDto, ManagementPageQueryDto, ModerateManagedCommentDto, ModerateCommentDto, MoveCategoryDto, SaveCategoryDto, SaveProductDto, SavePromotionDto, SaveShipmentDto, SaveShippingMethodDto } from './dto/manage-shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermissions, RequirePermissions } from '../rbac/require-permissions.decorator';
import { PermissionKey } from '../rbac/rbac.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@ApiTags('Shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}
  @Get('products') @UseGuards(OptionalJwtAuthGuard) @ApiOperation({ summary: 'Browse the product catalogue' }) @ApiOkResponse()
  products(@Query('category') category?: string, @Query('q') query?: string, @CurrentUser() user?: { id: string }) { return this.shop.catalog(category, query, user?.id); }
  @Get('products/:slug') @UseGuards(OptionalJwtAuthGuard) @ApiOperation({ summary: 'View one product and its gallery' }) @ApiOkResponse()
  product(@Param('slug') slug: string, @CurrentUser() user?: { id: string }) { return this.shop.productBySlug(slug, user?.id); }
  @Get('products/:id/comments') comments(@Param('id') id: string) { return this.shop.comments(id); }
  @Post('products/:id/comments') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  comment(@Param('id') id: string, @Body() dto: CreateProductCommentDto, @CurrentUser() user: { id: string }) { return this.shop.createComment(id, dto, user.id); }
  @Delete('comments/:id') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  deleteComment(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.shop.deleteComment(id, user.id); }
  @Get('favorites') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  favorites(@CurrentUser() user: { id: string }) { return this.shop.favorites(user.id); }
  @Put('products/:id/favorite') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  favorite(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.shop.favorite(id, user.id); }
  @Delete('products/:id/favorite') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  unfavorite(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.shop.unfavorite(id, user.id); }
  @Get('shipping-options') shippingOptions() { return this.shop.shippingOptions(); }
  @Get('categories') @ApiOperation({ summary: 'List product categories' }) @ApiOkResponse()
  categories() { return this.shop.categories(); }
  @Post('order-quote') @ApiOperation({ summary: 'Preview a cash-on-delivery order total without reserving stock' }) @ApiOkResponse()
  orderQuote(@Body() dto: OrderQuoteDto) { return this.shop.quoteOrder(dto); }
  @Post('orders') @UseGuards(OptionalJwtAuthGuard) @ApiOperation({ summary: 'Place an idempotent cash-on-delivery order' }) @ApiCreatedResponse()
  order(@Body() dto: CreateOrderDto, @CurrentUser() user?: { id: string; email: string }) { return this.shop.createOrder(dto, user); }
  @Get('orders/confirmation/:token')
  confirmation(@Param('token') token: string) { return this.shop.confirmation(token); }
  @Get('orders/mine') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  myOrders(@CurrentUser() user: { id: string }) { return this.shop.ordersForCustomer(user.id); }

  @Get('admin/overview') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  adminOverview() { return this.shop.adminOverview(); }
  @Get('admin/catalog') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  adminCatalog() { return this.shop.adminCatalog(); }
  @Get('admin/inventory') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopInventoryManage) @ApiBearerAuth()
  adminInventory() { return this.shop.adminInventory(); }
  @Get('admin/orders') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequireAnyPermissions(PermissionKey.ShopOrdersRead, PermissionKey.ShopOrdersFulfill) @ApiBearerAuth()
  adminOrders(@Query() query: AdminOrdersQueryDto) { return this.shop.adminOrders(query.page, query.q, query.status); }
  @Post('admin/categories') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  createCategory(@Body() dto: SaveCategoryDto, @CurrentUser() actor: { id: string }) { return this.shop.createCategory(dto, actor.id); }
  @Put('admin/categories/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  updateCategory(@Param('id') id: string, @Body() dto: SaveCategoryDto, @CurrentUser() actor: { id: string }) { return this.shop.updateCategory(id, dto, actor.id); }
  @Patch('admin/categories/:id/position') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  moveCategory(@Param('id') id: string, @Body() dto: MoveCategoryDto, @CurrentUser() actor: { id: string }) { return this.shop.moveCategory(id, dto, actor.id); }
  @Delete('admin/categories/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  deleteCategory(@Param('id') id: string, @CurrentUser() actor: { id: string }) { return this.shop.deleteCategory(id, actor.id); }
  @Post('admin/products') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  createProduct(@Body() dto: SaveProductDto, @CurrentUser() actor: { id: string }) { return this.shop.createProduct(dto, actor.id); }
  @Put('admin/products/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCatalogManage) @ApiBearerAuth()
  updateProduct(@Param('id') id: string, @Body() dto: SaveProductDto, @CurrentUser() actor: { id: string }) { return this.shop.updateProduct(id, dto, actor.id); }
  @Patch('admin/orders/:id/status') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopOrdersFulfill) @ApiBearerAuth()
  updateOrder(@Param('id') id: string, @Body() dto: ManageOrderStatusDto, @CurrentUser() actor: { id: string }) { return this.shop.updateOrderStatus(id, dto.status, actor.id, dto.reason); }
  @Patch('admin/comments/:id/status') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCommentsModerate) @ApiBearerAuth()
  moderateComment(@Param('id') id: string, @Body() dto: ModerateCommentDto, @CurrentUser() actor: { id: string }) { return this.shop.moderateComment(id, dto.status, actor.id); }
  @Get('admin/inventory/:productId') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopInventoryManage) @ApiBearerAuth()
  inventory(@Param('productId') productId: string, @Query() query: ManagementPageQueryDto) { return this.shop.inventory(productId, query.page, query.pageSize); }
  @Post('admin/inventory/:productId/adjustments') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopInventoryManage) @ApiBearerAuth()
  adjustInventory(@Param('productId') productId: string, @Body() dto: InventoryAdjustmentDto, @CurrentUser() actor: { id: string }) { return this.shop.adjustInventory(productId, dto, actor.id); }
  @Post('admin/orders/:id/notes') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopOrdersFulfill) @ApiBearerAuth()
  addOrderNote(@Param('id') id: string, @Body() dto: CreateOrderNoteDto, @CurrentUser() actor: { id: string }) { return this.shop.addOrderNote(id, dto, actor.id); }
  @Post('admin/orders/:id/shipments') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopOrdersFulfill) @ApiBearerAuth()
  createShipment(@Param('id') id: string, @Body() dto: SaveShipmentDto, @CurrentUser() actor: { id: string }) { return this.shop.saveShipment(id, dto, actor.id); }
  @Put('admin/orders/:id/shipment') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopOrdersFulfill) @ApiBearerAuth()
  saveLegacyShipment(@Param('id') id: string, @Body() dto: SaveShipmentDto, @CurrentUser() actor: { id: string }) { return this.shop.saveLatestShipment(id, dto, actor.id); }
  @Put('admin/orders/:id/shipments/:shipmentId') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopOrdersFulfill) @ApiBearerAuth()
  updateShipment(@Param('id') id: string, @Param('shipmentId') shipmentId: string, @Body() dto: SaveShipmentDto, @CurrentUser() actor: { id: string }) { return this.shop.saveShipment(id, dto, actor.id, shipmentId); }
  @Get('admin/shipping-methods') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopShippingManage) @ApiBearerAuth()
  shippingMethods() { return this.shop.adminShippingMethods(); }
  @Post('admin/shipping-methods') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopShippingManage) @ApiBearerAuth()
  createShippingMethod(@Body() dto: SaveShippingMethodDto, @CurrentUser() actor: { id: string }) { return this.shop.saveShippingMethod(dto, actor.id); }
  @Put('admin/shipping-methods/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopShippingManage) @ApiBearerAuth()
  updateShippingMethod(@Param('id') id: string, @Body() dto: SaveShippingMethodDto, @CurrentUser() actor: { id: string }) { return this.shop.saveShippingMethod(dto, actor.id, id); }
  @Get('admin/promotions') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopPromotionsManage) @ApiBearerAuth()
  promotions() { return this.shop.adminPromotions(); }
  @Post('admin/promotions') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopPromotionsManage) @ApiBearerAuth()
  createPromotion(@Body() dto: SavePromotionDto, @CurrentUser() actor: { id: string }) { return this.shop.savePromotion(dto, actor.id); }
  @Put('admin/promotions/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopPromotionsManage) @ApiBearerAuth()
  updatePromotion(@Param('id') id: string, @Body() dto: SavePromotionDto, @CurrentUser() actor: { id: string }) { return this.shop.savePromotion(dto, actor.id, id); }
  @Get('admin/comments') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCommentsModerate) @ApiBearerAuth()
  adminComments(@Query() query: ManagementPageQueryDto) { return this.shop.adminComments(query.page, query.pageSize, query.status); }
  @Patch('admin/comments/:id/moderation') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopCommentsModerate) @ApiBearerAuth()
  manageComment(@Param('id') id: string, @Body() dto: ModerateManagedCommentDto, @CurrentUser() actor: { id: string }) { return this.shop.moderateComment(id, dto.status, actor.id, dto.reason); }
  @Get('admin/reports') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopAnalyticsRead) @ApiBearerAuth()
  reports(@Query() query: AnalyticsQueryDto) { return this.shop.analytics(query); }
  @Get('admin/audit') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopAuditRead) @ApiBearerAuth()
  audit(@Query() query: ManagementPageQueryDto) { return this.shop.auditFeed(query.page, query.pageSize); }
}
