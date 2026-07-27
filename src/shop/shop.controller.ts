import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { ShopService } from './shop.service';
import { SaveCategoryDto, SaveProductDto, UpdateOrderStatusDto } from './dto/manage-shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { PermissionKey } from '../rbac/rbac.constants';

@ApiTags('Shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly shop: ShopService) {}
  @Get('products') @ApiOperation({ summary: 'Browse the product catalogue' }) @ApiOkResponse()
  products(@Query('category') category?: string, @Query('q') query?: string) { return this.shop.catalog(category, query); }
  @Get('categories') @ApiOperation({ summary: 'List product categories' }) @ApiOkResponse()
  categories() { return this.shop.categories(); }
  @Post('orders') @ApiOperation({ summary: 'Place a cash-on-delivery order' }) @ApiCreatedResponse()
  order(@Body() dto: CreateOrderDto) { return this.shop.createOrder(dto); }

  @Get('admin/overview') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  adminOverview() { return this.shop.adminOverview(); }
  @Post('admin/categories') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  createCategory(@Body() dto: SaveCategoryDto) { return this.shop.createCategory(dto); }
  @Put('admin/categories/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  updateCategory(@Param('id') id: string, @Body() dto: SaveCategoryDto) { return this.shop.updateCategory(id, dto); }
  @Post('admin/products') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  createProduct(@Body() dto: SaveProductDto) { return this.shop.createProduct(dto); }
  @Put('admin/products/:id') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  updateProduct(@Param('id') id: string, @Body() dto: SaveProductDto) { return this.shop.updateProduct(id, dto); }
  @Patch('admin/orders/:id/status') @UseGuards(JwtAuthGuard, PermissionsGuard) @RequirePermissions(PermissionKey.ShopManage) @ApiBearerAuth()
  updateOrder(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) { return this.shop.updateOrderStatus(id, dto.status); }
}
