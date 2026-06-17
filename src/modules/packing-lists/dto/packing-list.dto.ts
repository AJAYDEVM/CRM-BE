import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
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

export class PackingListItemDto {
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

  @ApiPropertyOptional({ default: 'Nos' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boxNo?: string;
}

export class CreatePackingListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deliveryChallanId?: string;

  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty()
  @IsUUID()
  projectId: string;

  @ApiProperty()
  @IsDateString()
  packingDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalPackages?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grossWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  netWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

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

  @ApiProperty({ type: [PackingListItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackingListItemDto)
  items: PackingListItemDto[];
}

export class UpdatePackingListDto extends PartialType(CreatePackingListDto) {}
