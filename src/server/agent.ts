/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import * as validators from "./validators.js";
import * as tools from "./tools.js";
import { buildSystemPrompt } from "./prompts.js";

// Lazily constructed so dotenv.config() in server.ts runs first
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return _ai;
}

export type State = 
  | "GREETING"
  | "ACCOUNT_LOOKUP"
  | "VERIFICATION"
  | "BALANCE_DISCLOSURE"
  | "PAYMENT_AMOUNT"
  | "CARD_COLLECTION"
  | "PAYMENT_PROCESSING"
  | "RECAP"
  | "CLOSED"
  | "TERMINATED";

export interface CardInfo {
  card_number?: string;
  expiry_month?: number;
  expiry_year?: number;
  cvv?: string;
  cardholder_name?: string;
}

export interface VerificationFields {
  full_name?: string;
  secondary_type?: 'dob' | 'aadhaar' | 'pincode';
  secondary_value?: string;
}

export class Agent {
  state: State = "GREETING";
  conversationHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  accountData: tools.AccountData | null = null;
  verified: boolean = false;
  verificationAttempts: number = 0;
  paymentAmount: number | null = null;
  paymentAttempts: number = 0;
  transactionId: string | null = null;
  
  // Internal collection buffers
  collectedName: string | null = null;
  collectedSecondary: { type: string; value: string } | null = null;
  card: CardInfo = {};

  constructor() {}

  async next(userInput: string): Promise<{ message: string; state: State }> {
    // Add to history
    this.conversationHistory.push({ role: 'user', parts: [{ text: userInput }] });

    // Build context for prompt
    const context = this._getBatchContext();
    const systemPrompt = buildSystemPrompt(context);

    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries) {
      try {
        const response: GenerateContentResponse = await getAI().models.generateContent({
          model: "gemini-2.5-flash",
          contents: this.conversationHistory.map(h => ({
            role: h.role,
            parts: h.parts
          })),
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
          }
        });
        
        const output = JSON.parse(response.text || "{}");
        
        // Update history with only the natural language response
        this.conversationHistory.push({ role: 'model', parts: [{ text: output.response }] });

        // Run State Logic
        const agentMessage = await this._processState(output.extracted, output.response);
        
        return { message: agentMessage, state: this.state };
      } catch (err: any) {
        const msg = err.message || JSON.stringify(err) || "";
        const isQuota = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
        const isKeyError = msg.includes("API key expired") || msg.includes("API_KEY_INVALID") || msg.includes("400");

        if (isQuota && retries < maxRetries) {
          retries++;
          console.warn(`Quota hit, retrying ${retries}/${maxRetries}...`);
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, 4000 * Math.pow(2, retries)));
          continue;
        }

        console.error("Agent Loop Error:", err);
        
        if (isQuota) {
          return { 
            message: "I've reached my message limit for the moment. Please wait a minute and try again.", 
            state: this.state 
          };
        }
        
        if (isKeyError) {
          return { 
            message: "The Gemini API key is expired or invalid. Please update it in the 'Secrets' panel within the AI Studio Settings menu (click the gear icon).", 
            state: this.state 
          };
        }
        
        return { message: "I'm having some technical difficulties. Please try again in a moment.", state: this.state };
      }
    }
    
    return { message: "I'm having trouble connecting right now. Please try again in a moment.", state: this.state };
  }

  private _getBatchContext() {
    return {
      current_state: this.state,
      verified: this.verified,
      verification_attempts: this.verificationAttempts,
      account_id: this.accountData?.account_id || null,
      balance: this.verified ? (this.accountData?.balance ?? null) : null,
      payment_amount: this.paymentAmount,
      card_fields_collected: Object.keys(this.card),
      card_fields_needed: this._getMissingCardFields(),
      payment_attempts: this.paymentAttempts,
    };
  }

  private _getMissingCardFields(): string[] {
    const fields = ["card_number", "expiry_month", "expiry_year", "cvv", "cardholder_name"];
    return fields.filter(f => !this.card[f as keyof CardInfo]);
  }

  private async _processState(extracted: any, llmResponse: string): Promise<string> {
    switch (this.state) {
      case "GREETING":
      case "ACCOUNT_LOOKUP":
        if (extracted.account_id) {
          const accId = validators.normalizeAccountId(extracted.account_id);
          if (accId) {
            const data = await tools.lookupAccount(accId);
            if ('error' in data) {
              if (data.error === 'account_not_found') {
                return "I couldn't find an account with that ID. Please double-check and try again.";
              }
              return "I'm having trouble reaching our systems. Could you please try providing your account ID again?";
            }
            this.accountData = data;
            this.state = "VERIFICATION";
            return `Found account for ${data.account_id}. To proceed securely, I need to verify your identity. What is your full name?`;
          }
        }
        return llmResponse;

      case "VERIFICATION":
        return await this._handleVerification(extracted, llmResponse);

      case "BALANCE_DISCLOSURE":
      case "PAYMENT_AMOUNT":
        if (extracted.payment_amount_raw) {
          const bal = this.accountData?.balance ?? 0;
          const { isValid, amount, error } = validators.validateAmount(extracted.payment_amount_raw, bal);
          if (isValid) {
            this.paymentAmount = amount;
            this.state = "CARD_COLLECTION";
            return `Got it. You'd like to pay ₹${amount.toFixed(2)}. Now, please provide your card details (Number, Expiry MM/YY, CVV, and Name on card).`;
          } else if (error) {
            return error;
          }
        }
        return llmResponse;

      case "CARD_COLLECTION":
        this._updateCardInfo(extracted);
        const missing = this._getMissingCardFields();
        if (missing.length === 0) {
          // All fields collected, run local validation
          const localError = this._validateCardLocally();
          if (localError) return localError;
          
          this.state = "PAYMENT_PROCESSING";
          return await this._executePayment();
        }
        return llmResponse;

      case "RECAP":
      case "CLOSED":
        return llmResponse;

      default:
        return llmResponse;
    }
  }

  private async _handleVerification(extracted: any, llmResponse: string): Promise<string> {
    if (extracted.full_name) this.collectedName = extracted.full_name;
    
    // Check secondary factors
    if (extracted.dob_iso) {
      this.collectedSecondary = { type: 'dob', value: extracted.dob_iso };
    } else if (extracted.aadhaar_last4) {
      this.collectedSecondary = { type: 'aadhaar', value: extracted.aadhaar_last4 };
    } else if (extracted.pincode) {
      this.collectedSecondary = { type: 'pincode', value: extracted.pincode };
    }

    if (this.collectedName && this.collectedSecondary) {
      // Deterministic check
      const isNameMatch = this.collectedName === this.accountData?.full_name;
      let isSecondaryMatch = false;

      if (this.collectedSecondary.type === 'dob') {
        const { isValid, normalized } = validators.validateDate(this.collectedSecondary.value);
        if (isValid) {
          isSecondaryMatch = normalized === this.accountData?.dob;
        }
      } else if (this.collectedSecondary.type === 'aadhaar') {
        isSecondaryMatch = this.collectedSecondary.value === this.accountData?.aadhaar_last4;
      } else if (this.collectedSecondary.type === 'pincode') {
        isSecondaryMatch = this.collectedSecondary.value === this.accountData?.pincode;
      }

      if (isNameMatch && isSecondaryMatch) {
        this.verified = true;
        if (this.accountData?.balance === 0) {
          this.state = "CLOSED";
          return `Verification successful! Your account has no outstanding balance. There's nothing to pay at this time. Have a great day!`;
        }
        this.state = "BALANCE_DISCLOSURE";
        return `Verification successful. Your outstanding balance is ₹${this.accountData?.balance.toFixed(2)}. How much would you like to pay today?`;
      } else {
        this.verificationAttempts++;
        this.collectedName = null;
        this.collectedSecondary = null;
        if (this.verificationAttempts >= 3) {
          this.state = "TERMINATED";
          return "I'm sorry, I'm unable to verify your identity. For security, this session has been ended. Please contact support.";
        }
        return "I'm sorry, that didn't match our records. Please try again with your full name and one other factor (DOB, Aadhaar last 4, or pincode).";
      }
    }

    return llmResponse;
  }

  private _updateCardInfo(extracted: any) {
    if (extracted.card_number_raw) this.card.card_number = extracted.card_number_raw.replace(/\s+/g, '');
    if (extracted.cvv_raw) this.card.cvv = extracted.cvv_raw;
    if (extracted.cardholder_name) this.card.cardholder_name = extracted.cardholder_name;
    
    if (extracted.expiry_raw) {
      const raw = extracted.expiry_raw.toLowerCase();
      const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const wordMatch = raw.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/);
      
      if (wordMatch) {
        this.card.expiry_month = monthNames.indexOf(wordMatch[1]) + 1;
        this.card.expiry_year = parseInt(wordMatch[2]);
      } else {
        const match = raw.match(/(\d{1,2})\/(\d{2,4})/);
        if (match) {
          this.card.expiry_month = parseInt(match[1]);
          let year = parseInt(match[2]);
          if (year < 100) year += 2000;
          this.card.expiry_year = year;
        }
      }
    }
  }

  private _validateCardLocally(): string | null {
    if (!validators.luhnCheck(this.card.card_number!)) {
      this.card.card_number = undefined;
      return "The card number doesn't appear to be valid. Please re-enter your card number.";
    }
    const expiry = validators.validateExpiry(this.card.expiry_month!, this.card.expiry_year!);
    if (!expiry.isValid) {
      this.card.expiry_month = undefined;
      this.card.expiry_year = undefined;
      return expiry.error || "Invalid expiry.";
    }
    if (!validators.validateCvvLength(this.card.cvv!, this.card.card_number!)) {
      this.card.cvv = undefined;
      return "The CVV length is incorrect for this card type. Please re-enter.";
    }
    return null;
  }

  private async _executePayment(): Promise<string> {
    const res = await tools.processPayment({
      account_id: this.accountData!.account_id,
      amount: this.paymentAmount!,
      payment_method: {
        type: 'card',
        card: {
          card_number: this.card.card_number!,
          cvv: this.card.cvv!,
          expiry_month: this.card.expiry_month!,
          expiry_year: this.card.expiry_year!,
          cardholder_name: this.card.cardholder_name!
        }
      }
    });

    if (res.success) {
      this.state = "RECAP";
      this.transactionId = res.transaction_id!;
      return `Your payment of ₹${this.paymentAmount!.toFixed(2)} has been processed successfully! Transaction ID: ${this.transactionId}. To recap: ₹${this.paymentAmount!.toFixed(2)} was charged to account ${this.accountData!.account_id}. Thank you!`;
    } else {
      this.paymentAttempts++;
      if (this.paymentAttempts >= 3) {
        this.state = "TERMINATED";
        return "I'm unable to process your payment after multiple attempts. Please try again later or contact support.";
      }
      return this._mapErrorCode(res.error_code);
    }
  }

  private _mapErrorCode(code?: string): string {
    switch (code) {
      case 'insufficient_balance': return "That amount exceeds your outstanding balance. Please enter a lower amount.";
      case 'invalid_amount': return "The amount entered isn't valid. Please enter a positive amount with up to 2 decimal places.";
      case 'invalid_card': return "The card details are invalid. Please check and try again.";
      case 'invalid_cvv': return "The CVV is incorrect. Please check and re-enter.";
      case 'invalid_expiry': return "The expiry date is invalid. Please use a different card.";
      default: return "An error occurred during payment processing. Please double check your details and try again.";
    }
  }
}
