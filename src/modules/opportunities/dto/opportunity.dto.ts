import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OpportunityStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateOpportunityDto {
  @ApiProperty()
  @IsUUID()
  customerId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedAmount: number;

  @ApiProperty()
  @IsDateString()
  expectedCloseDate: string;
}

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}

export class UpdateOpportunityStageDto {
  @ApiProperty({ enum: OpportunityStatus })
  @IsEnum(OpportunityStatus)
  status: OpportunityStatus;
}
