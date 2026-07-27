import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

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
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateOrderStatusDto { @IsEnum(OrderStatus) status!: OrderStatus; }

export class ManageOrderStatusDto {
  @IsEnum(OrderStatus) status!: OrderStatus;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class AdminOrdersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @IsString() @MaxLength(120) q = '';
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
}
