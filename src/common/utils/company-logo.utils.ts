import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'uploads');
const ASSETS_DIR = join(process.cwd(), 'assets');
const DEFAULT_LOGO = join(ASSETS_DIR, 'logo_tmci.png');

export function ensureUploadDirs() {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!existsSync(ASSETS_DIR)) {
    mkdirSync(ASSETS_DIR, { recursive: true });
  }
}

export function getUploadsDir() {
  ensureUploadDirs();
  return UPLOADS_DIR;
}

export function getCompanyLogoPath(logoFileName?: string | null): string | null {
  ensureUploadDirs();
  if (logoFileName) {
    const uploaded = join(UPLOADS_DIR, logoFileName);
    if (existsSync(uploaded)) return uploaded;
  }
  if (existsSync(DEFAULT_LOGO)) return DEFAULT_LOGO;
  const feLogo = join(process.cwd(), '..', 'fe', 'public', 'logo_tmci.png');
  if (existsSync(feLogo)) return feLogo;
  return null;
}

export function getUploadedLogoPath(fileName: string) {
  return join(getUploadsDir(), fileName);
}
