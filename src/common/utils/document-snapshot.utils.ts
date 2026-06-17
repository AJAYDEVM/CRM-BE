import { Customer } from '@prisma/client';
import { SettingsService } from '../../modules/settings/settings.service';

export interface DocumentAddressSnapshot {
  customerGstin?: string;
  billToAddress?: string;
  shipToAddress?: string;
}

export function buildAddressSnapshot(
  customer: Customer,
  overrides: {
    customerGstin?: string;
    billToAddress?: string;
    shipToAddress?: string;
    sameAsBilling?: boolean;
  } = {},
): DocumentAddressSnapshot {
  const billToAddress = overrides.billToAddress?.trim() || customer.address?.trim() || undefined;
  const shipToAddress = overrides.sameAsBilling
    ? billToAddress
    : overrides.shipToAddress?.trim() || customer.shippingAddress?.trim() || billToAddress;

  return {
    customerGstin: overrides.customerGstin?.trim().toUpperCase() || customer.gstNumber?.trim().toUpperCase() || undefined,
    billToAddress,
    shipToAddress,
  };
}

export async function getDefaultQuotationTerms(settings: SettingsService) {
  const profile = await settings.getCompanyProfile();
  return profile.defaultQuotationTerms ?? '';
}

export async function getDefaultPaymentTerms(settings: SettingsService) {
  const profile = await settings.getCompanyProfile();
  return profile.defaultPaymentTerms ?? 'Due on Receipt';
}
