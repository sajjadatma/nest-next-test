import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

export class OrderLineDto {
  @IsString() @IsNotEmpty() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) quantity!: number;
}

export class ShippingAddressDto {
  @IsString() @IsNotEmpty() fullName!: string;
  @IsString() @IsNotEmpty() line1!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() postalCode!: string;
  @IsString() @IsNotEmpty() country!: string;
}

export class CreateOrderDto {
  @IsEmail() email!: string;
  @Matches(/^\+?[0-9 ()-]{7,20}$/) phone!: string;
  @IsUUID() idempotencyKey!: string;
  @IsUUID() confirmationToken!: string;
  @IsString() @IsNotEmpty() shippingMethod!: string;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_-]{2,40}$/i) promotionCode?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto) items!: OrderLineDto[];
  @ValidateNested() @Type(() => ShippingAddressDto) shippingAddress!: ShippingAddressDto;
}
