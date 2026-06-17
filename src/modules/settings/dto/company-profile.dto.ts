import { IsEmail, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export class UpdateCompanyProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  companyName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '29AABCT1234A1Z5' })
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.trim() !== '')
  @IsString()
  @Matches(GSTIN_REGEX, { message: 'GSTIN must be a valid 15-character GST number' })
  gstNumber?: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankBranch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.trim() !== '')
  @IsString()
  @Matches(IFSC_REGEX, { message: 'IFSC must be a valid 11-character code' })
  bankIfsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultQuotationTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultPaymentTerms?: string;
}
