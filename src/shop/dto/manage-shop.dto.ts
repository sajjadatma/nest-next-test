import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { CommentStatus, InventoryMovementReason, OrderStatus, PromotionType, ShipmentStatus } from '@prisma/client';

export class SaveCategoryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(80) slug!: string;
  @IsOptional() @IsString() parentId?: string | null;
}

export class MoveCategoryDto {
  @IsOptional() @IsString() parentId?: string | null;
  @Type(() => Number) @IsInt() @Min(0) position!: number;
}

export class SaveProductDto {
  @IsString() @MaxLength(120) name!: string;
  @IsString() @MaxLength(120) slug!: string;
  @IsString() @MaxLength(1000) description!: string;
  @Type(() => Number) @IsInt() @Min(0) priceMinor!: number;
  @Type(() => Number) @IsInt() @Min(0) stockQty!: number;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) material?: string;
  @IsOptional() @IsString() @MaxLength(300) dimensions?: string;
  @IsOptional() @IsString() @MaxLength(500) care?: string;
  @IsOptional() @IsInt() @Min(1) featuredRank?: number | null;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) galleryUrls?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ModerateCommentDto { @IsEnum(CommentStatus) status!: CommentStatus; }

export class ModerateManagedCommentDto extends ModerateCommentDto { @IsOptional() @IsString() @MaxLength(300) reason?: string; }

export class CreateProductCommentDto {
  @IsString() @MaxLength(1000) body!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
}

export class UpdateOrderStatusDto { @IsEnum(OrderStatus) status!: OrderStatus; }

export class ManageOrderStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CreateOrderNoteDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) body!: string;
  @IsOptional() @IsBoolean() isCustomerVisible?: boolean;
  // Deprecated compatibility field for older management clients. New clients
  // must send isCustomerVisible so the audience is unambiguous.
  @IsOptional() @IsIn(['INTERNAL', 'CUSTOMER']) visibility?: 'INTERNAL' | 'CUSTOMER';
}

export class SaveShipmentDto {
  @IsOptional() @IsString() @MaxLength(80) carrier?: string;
  @IsOptional() @IsString() @MaxLength(120) service?: string;
  @IsOptional() @IsString() @MaxLength(160) trackingNumber?: string;
  @IsOptional() @IsUrl() @MaxLength(500) trackingUrl?: string;
  @IsOptional() @IsEnum(ShipmentStatus) status?: ShipmentStatus;
}

export class InventoryAdjustmentDto {
  @Type(() => Number) @IsInt() @Min(-100000) @Max(100000) quantityDelta!: number;
  @IsEnum(InventoryMovementReason) reason!: InventoryMovementReason;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SaveShippingMethodDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MaxLength(100) label!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsString() @MaxLength(100) eta!: string;
  @Type(() => Number) @IsInt() @Min(0) priceMinor!: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class SavePromotionDto {
  @IsString() @MaxLength(40) code!: string;
  @IsEnum(PromotionType) type!: PromotionType;
  @Type(() => Number) @IsInt() @Min(1) @Max(100000000) value!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimumSubtotalMinor?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AnalyticsQueryDto {
  @IsOptional() @IsIn(['7d', '30d', '90d']) range?: '7d' | '30d' | '90d';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class ManagementPageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(CommentStatus) status?: CommentStatus;
}

export class AdminOrdersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsString() @MaxLength(120) q = '';
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
}
