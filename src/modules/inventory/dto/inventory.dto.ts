import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryItemStatus, StockTransactionType } from '@prisma/client';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateInventoryItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsUUID()
  vendorId: string;

  @ApiProperty()
  @IsString()
  serialNumber: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty()
  @IsString()
  location: string;

  @ApiPropertyOptional({ enum: InventoryItemStatus })
  @IsOptional()
  @IsEnum(InventoryItemStatus)
  status?: InventoryItemStatus;
}

export class UpdateInventoryItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: InventoryItemStatus })
  @IsOptional()
  @IsEnum(InventoryItemStatus)
  status?: InventoryItemStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class StockTransactionDto {
  @ApiProperty()
  @IsUUID()
  inventoryItemId: string;

  @ApiProperty({ enum: StockTransactionType })
  @IsEnum(StockTransactionType)
  type: StockTransactionType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
