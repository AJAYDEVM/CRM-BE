import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export class ProformaInvoiceItemDto {
  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnCode?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ default: 18 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxRate?: number;
}

export class CreateProformaInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  quotationId?: string;

  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty()
  @IsUUID()
  projectId: string;

  @ApiProperty()
  @IsDateString()
  proformaDate: string;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeOfSupply?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => typeof value === 'string' && value.trim() !== '')
  @IsString()
  @Matches(GSTIN_REGEX, { message: 'GSTIN must be a valid 15-character GST number' })
  customerGstin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billToAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shipToAddress?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sameAsBilling?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ProformaInvoiceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProformaInvoiceItemDto)
  items: ProformaInvoiceItemDto[];
}

export class UpdateProformaInvoiceDto extends PartialType(CreateProformaInvoiceDto) {}
