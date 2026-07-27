import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsString, Max, Min, ValidateNested } from 'class-validator';

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
  @ValidateNested({ each: true }) @Type(() => OrderLineDto) items!: OrderLineDto[];
  @ValidateNested() @Type(() => ShippingAddressDto) shippingAddress!: ShippingAddressDto;
}
