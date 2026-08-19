import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export const COMPANY_ROLES = ['OWNER', 'ADMIN', 'BUYER', 'VIEWER'] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];
export const COMPANY_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

export class CreateCompanyDto {
  @IsString() @Length(2, 160) name!: string;
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MaxLength(80) taxRegistrationNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) customerGroupId?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @IsIn(COMPANY_STATUSES) status?: CompanyStatus;
  @IsOptional() @IsString() @MaxLength(80) taxRegistrationNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) customerGroupId?: string;
}

export class AddCompanyMemberDto {
  @IsOptional() @IsString() @MaxLength(100) userId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsIn(COMPANY_ROLES) role!: CompanyRole;
}

export class UpdateCompanyMemberDto {
  @IsOptional() @IsIn(COMPANY_ROLES) role?: CompanyRole;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'REMOVED']) status?: 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
}
