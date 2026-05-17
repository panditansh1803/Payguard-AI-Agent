/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalizes account ID from messy user input.
 * e.g., "my account is ACC 1001" -> "ACC1001"
 */
export function normalizeAccountId(input: string): string | null {
  const match = input.toUpperCase().replace(/\s+/g, '').match(/ACC\d+/);
  return match ? match[0] : null;
}

/**
 * Standard Luhn Algorithm for card number validation.
 */
export function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Validates if a date string is a real calendar date and returns normalized YYYY-MM-DD.
 * Handles leap years correctly.
 */
export function validateDate(dateStr: string): { isValid: boolean; normalized: string; error?: string } {
  // Expected input normalized by LLM to YYYY-MM-DD or similar
  // If it's a messy string, we expect the LLM to have done its best.
  // We'll perform a strict calendar check here.
  const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = dateStr.match(regex);

  if (!match) {
    return { isValid: false, normalized: dateStr, error: "Invalid date format. Use YYYY-MM-DD." };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12) return { isValid: false, normalized: dateStr, error: "Invalid month." };

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return { isValid: false, normalized: dateStr, error: "Invalid day for the given month/year." };
  }

  return { isValid: true, normalized: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}` };
}

/**
 * Validates payment amount against balance.
 */
export function validateAmount(amountInput: string | number, balance: number): { isValid: boolean; amount: number; error?: string } {
  let val: number;
  
  if (typeof amountInput === 'string') {
    const cleanInput = amountInput.toLowerCase().trim();
    if (['full', 'all', 'everything', 'total'].some(kw => cleanInput.includes(kw))) {
      return { isValid: true, amount: balance };
    }
    val = parseFloat(cleanInput.replace(/[^\d.]/g, ''));
  } else {
    val = amountInput;
  }

  if (isNaN(val) || val <= 0) {
    return { isValid: false, amount: 0, error: "Amount must be a valid number greater than zero." };
  }

  // Check decimals (max 2)
  const decimalParts = val.toString().split('.');
  if (decimalParts.length > 1 && decimalParts[1].length > 2) {
    return { isValid: false, amount: val, error: "Amount cannot have more than 2 decimal places." };
  }

  if (val > balance) {
    return { isValid: false, amount: val, error: `Amount exceeds your outstanding balance of ₹${balance.toFixed(2)}.` };
  }

  return { isValid: true, amount: val };
}

/**
 * Validates card expiry date.
 */
export function validateExpiry(month: number, year: number): { isValid: boolean; error?: string } {
  if (month < 1 || month > 12) return { isValid: false, error: "Invalid month." };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 0-indexed

  // Handle 2-digit year (assume 20xx)
  const fullYear = year < 100 ? 2000 + year : year;

  if (fullYear < currentYear || (fullYear === currentYear && month < currentMonth)) {
    return { isValid: false, error: "The card has expired." };
  }

  return { isValid: true };
}

/**
 * Check if card is Amex.
 */
export function isAmex(cardNumber: string): boolean {
  const clean = cardNumber.replace(/\D/g, '');
  return clean.startsWith('34') || clean.startsWith('37');
}

/**
 * Validates CVV length based on card type.
 */
export function validateCvvLength(cvv: string, cardNumber: string): boolean {
  const cleanCvv = cvv.replace(/\D/g, '');
  const amex = isAmex(cardNumber);
  return amex ? cleanCvv.length === 4 : cleanCvv.length === 3;
}
