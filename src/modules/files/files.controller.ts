import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuditAction, FileReferenceType } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FileStorageService } from '../../common/services/file-storage.service';
import { AuditService } from '../../common/services/audit.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class UploadFileDto {
  @ApiProperty({ enum: FileReferenceType })
  @IsEnum(FileReferenceType)
  referenceType: FileReferenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referenceId?: string;
}

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(
    private storage: FileStorageService,
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthUser,
  ) {
    const stored = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: dto.referenceType.toLowerCase(),
    });

    const asset = await this.prisma.fileAsset.create({
      data: {
        fileName: stored.fileName,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
        s3Key: stored.s3Key,
        s3Bucket: stored.s3Bucket,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        uploadedById: user.sub,
      },
    });

    await this.audit.log({
      entityType: 'FileAsset',
      entityId: asset.id,
      action: AuditAction.CREATE,
      userId: user.sub,
      metadata: {
        fileName: stored.originalName,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        description: `Uploaded file "${stored.originalName}"`,
      },
    });

    return asset;
  }
}
