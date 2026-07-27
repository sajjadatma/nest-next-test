import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShopService } from './shop.service';
import { AdminOrdersQueryDto, ManageOrderStatusDto, MoveCategoryDto, SaveCategoryDto, SaveProductDto } from './dto/manage-shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PermissionKey } from '../rbac/rbac.constants';
import { CurrentUser } from '../auth/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@ApiTags('Shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}
  @Get('products') @ApiOperation({ summary: 'Browse the product catalogue' }) @ApiOkResponse()
  products(@Query('category') category?: string, @Query('q') query?: string) { return this.shop.catalog(category, query); }
  @Get('categories') @ApiOperation({ summary: 'List product categories' }) @ApiOkResponse()
  categories() { return this.shop.categories(); }
  @Post('orders') @UseGuards(OptionalJwtAuthGuard) @ApiOperation({ summary: 'Place an idempotent cash-on-delivery order' }) @ApiCreatedResponse()
  order(@Body() dto: CreateOrderDto, @CurrentUser() user?: { id: string; email: string }) { return this.shop.createOrder(dto, user); }
  @Get('orders/confirmation/:token')
  confirmation(@Param('token') token: string) { return this.shop.confirmation(token); }
  @Get('orders/mine') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  myOrders(@CurrentUser() user: { id: string }) { return this.shop.ordersForCustomer(user.id); }

  @Get('admin/overview') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  adminOverview() { return this.shop.adminOverview(); }
  @Get('admin/orders') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  adminOrders(@Query() query: AdminOrdersQueryDto) { return this.shop.adminOrders(query.page, query.q, query.status); }
  @Post('admin/categories') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  createCategory(@Body() dto: SaveCategoryDto, @CurrentUser() actor: { id: string }) { return this.shop.createCategory(dto, actor.id); }
  @Put('admin/categories/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  updateCategory(@Param('id') id: string, @Body() dto: SaveCategoryDto, @CurrentUser() actor: { id: string }) { return this.shop.updateCategory(id, dto, actor.id); }
  @Patch('admin/categories/:id/position') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  moveCategory(@Param('id') id: string, @Body() dto: MoveCategoryDto, @CurrentUser() actor: { id: string }) { return this.shop.moveCategory(id, dto, actor.id); }
  @Delete('admin/categories/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  deleteCategory(@Param('id') id: string, @CurrentUser() actor: { id: string }) { return this.shop.deleteCategory(id, actor.id); }
  @Post('admin/products') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  createProduct(@Body() dto: SaveProductDto, @CurrentUser() actor: { id: string }) { return this.shop.createProduct(dto, actor.id); }
  @Put('admin/products/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  updateProduct(@Param('id') id: string, @Body() dto: SaveProductDto, @CurrentUser() actor: { id: string }) { return this.shop.updateProduct(id, dto, actor.id); }
  @Patch('admin/orders/:id/status') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  updateOrder(@Param('id') id: string, @Body() dto: ManageOrderStatusDto, @CurrentUser() actor: { id: string }) { return this.shop.updateOrderStatus(id, dto.status, actor.id, dto.reason); }
}
