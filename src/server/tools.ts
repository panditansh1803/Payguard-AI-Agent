/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE_URL = "https://se-payment-verification-api.service.external.usea2.aws.prodigaltech.com";

export interface AccountData {
  account_id: string;
  full_name: string;
  dob: string;
  aadhaar_last4: string;
  pincode: string;
  balance: number;
}

export interface PaymentMethod {
  type: 'card';
  card: {
    cardholder_name: string;
    card_number: string;
    cvv: string;
    expiry_month: number;
    expiry_year: number;
  };
}

export interface PaymentRequest {
  account_id: string;
  amount: number;
  payment_method: PaymentMethod;
}

export async function lookupAccount(accountId: string): Promise<AccountData | { error: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/lookup-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: accountId }),
    });

    if (response.status === 404) {
      return { error: 'account_not_found' };
    }

    if (!response.ok) {
      return { error: 'server_error' };
    }

    return await response.json();
  } catch (err) {
    console.error('Lookup Error:', err);
    return { error: 'network_error' };
  }
}

export async function processPayment(paymentReq: PaymentRequest): Promise<{ success: boolean; transaction_id?: string; error_code?: string }> {
  try {
    const response = await fetch(`${BASE_URL}/api/process-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentReq),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Payment Error:', err);
    return { success: false, error_code: 'network_error' };
  }
}
