import { AuditAction } from '@prisma/client';

type AuditLogRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: unknown;
  metadata: unknown;
  createdAt: Date;
  user: { email: string };
};

const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  STATUS_CHANGE: 'Status Changed',
  CONVERT: 'Converted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatFieldName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function summarizeChanges(changes: Record<string, unknown>): string {
  const keys = Object.keys(changes).filter((key) => key !== 'password' && key !== 'passwordHash');
  if (!keys.length) return 'Record updated';
  return `Updated ${keys.map(formatFieldName).join(', ')}`;
}

function buildDescription(row: AuditLogRow): string {
  const metadata = asRecord(row.metadata);
  const changes = asRecord(row.changes);

  if (metadata?.description && typeof metadata.description === 'string') {
    return metadata.description;
  }

  if (metadata?.amount != null) {
    return `Recorded payment of ₹${metadata.amount}`;
  }

  if (metadata?.fileName && typeof metadata.fileName === 'string') {
    return `Uploaded file "${metadata.fileName}"`;
  }

  if (metadata?.fromStatus && metadata?.toStatus) {
    return `Status changed from ${metadata.fromStatus} to ${metadata.toStatus}`;
  }

  if (row.action === AuditAction.CONVERT && metadata?.targetType) {
    return `Converted to ${metadata.targetType}`;
  }

  if (changes) {
    if (changes.companyName && typeof changes.companyName === 'string') {
      return row.action === AuditAction.CREATE
        ? `Created ${changes.companyName}`
        : summarizeChanges(changes);
    }
    if (changes.firstName || changes.lastName) {
      const name = [changes.firstName, changes.lastName].filter(Boolean).join(' ');
      if (name) {
        return row.action === AuditAction.CREATE ? `Created ${name}` : summarizeChanges(changes);
      }
    }
    if (changes.name && typeof changes.name === 'string') {
      return row.action === AuditAction.CREATE ? `Created ${changes.name}` : summarizeChanges(changes);
    }
    return summarizeChanges(changes);
  }

  if (row.entityType === 'User' && row.action === AuditAction.UPDATE) {
    return 'User account updated';
  }

  if (row.entityType === 'CompanyProfile') {
    return 'Company profile settings updated';
  }

  if (row.entityType === 'Auth') {
    return 'Password changed';
  }

  return `${row.entityType} record ${row.action.toLowerCase().replace('_', ' ')}`;
}

export function mapAuditLog(row: AuditLogRow) {
  const metadata = asRecord(row.metadata);
  const title =
    (metadata?.title && typeof metadata.title === 'string'
      ? metadata.title
      : `${row.entityType} ${ACTION_LABELS[row.action]}`);

  return {
    id: row.id,
    title,
    description: buildDescription(row),
    date: row.createdAt,
    userEmail: row.user.email,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
  };
}
