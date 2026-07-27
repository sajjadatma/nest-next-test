import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class SaveCategoryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(80) slug!: string;
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
