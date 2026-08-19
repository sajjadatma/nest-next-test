import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SaveVariantDto {
  @IsString() @IsNotEmpty() @MaxLength(80) sku!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) options?: string;
  /** Base price in the smallest currency unit; persisted as ProductVariant.basePriceMinor. */
  @Type(() => Number) @IsInt() @Min(0) basePriceMinor!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @Type(() => Number) @IsInt() @Min(0) stockQty = 0;
  @Type(() => Number) @IsInt() @Min(0) lowStockThreshold = 5;
  @Type(() => Number) @IsInt() @Min(1) minimumOrderQty = 1;
  @Type(() => Number) @IsInt() @Min(1) packSize = 1;
  @Type(() => Number) @IsInt() @Min(1) quantityIncrement = 1;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) position?: number;
}

export class SaveCustomerGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(60) code!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SavePriceListDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(80) code?: string;
  @IsString() @MaxLength(3) currency!: string;
  @Type(() => Number) @IsInt() priority = 0;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsString() customerGroupId!: string;
}

export class SavePriceListItemDto {
  @IsString() priceListId!: string;
  @IsString() variantId!: string;
  @Type(() => Number) @IsInt() @Min(0) priceMinor!: number;
}

export class SavePriceTierDto {
  @IsString() priceListItemId!: string;
  @Type(() => Number) @IsInt() @Min(1) minimumQuantity!: number;
  @Type(() => Number) @IsInt() @Min(0) unitPriceMinor!: number;
}

export class CatalogQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 24;
}

export class EffectivePriceQueryDto {
  @Type(() => Number) @IsInt() @Min(1) quantity = 1;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class B2bCartQueryDto {
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class SaveB2bCartLineDto {
  @IsString() @IsNotEmpty() variantId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class B2bPurchaseRequestQueryDto {
  @IsOptional() @IsIn(['SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED']) status?: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

export class CreateB2bPurchaseRequestDto {
  @IsString() @IsNotEmpty() addressId!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
}

export class ReviewB2bPurchaseRequestDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class UpdateB2bOrderStatusDto {
  @IsIn(['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']) status!: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
}
