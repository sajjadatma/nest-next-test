import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

export enum AddressTypeInput { SHIPPING = 'SHIPPING', BILLING = 'BILLING', BOTH = 'BOTH' }

export class UpdateAccountProfileDto {
  @IsOptional() @IsString() @MaxLength(80) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(20) locale?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
}

export class SaveAddressDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsEnum(AddressTypeInput) type!: AddressTypeInput;
  @IsString() @MaxLength(120) recipientName!: string;
  @IsOptional() @Matches(/^\+?[0-9 ()-]{7,20}$/) phone?: string;
  @IsString() @MaxLength(160) line1!: string;
  @IsOptional() @IsString() @MaxLength(160) line2?: string;
  @IsString() @MaxLength(80) city!: string;
  @IsOptional() @IsString() @MaxLength(80) region?: string;
  @IsString() @MaxLength(24) postalCode!: string;
  @IsString() @Length(2, 2) countryCode!: string;
  @IsOptional() @IsBoolean() isDefaultShipping?: boolean;
  @IsOptional() @IsBoolean() isDefaultBilling?: boolean;
}

export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() emailOrderUpdates?: boolean;
  @IsOptional() @IsBoolean() emailMarketing?: boolean;
  @IsOptional() @IsBoolean() smsOrderUpdates?: boolean;
  @IsOptional() @IsString() @Length(3, 3) preferredCurrency?: string;
}

export class RecordConsentDto {
  @IsString() @MaxLength(80) type!: string;
  @IsString() @MaxLength(40) version!: string;
  @IsBoolean() granted!: boolean;
}

export class RequestDeletionDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AccountOrdersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;
}
