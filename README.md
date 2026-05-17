# PayGuard AI - Production-Ready Payment Agent

A secure, LLM-powered agent for automated debt collection and payment processing.

## Setup

1. **Environment:** Ensure `GEMINI_API_KEY` is set in your environment or `.env` file.
2. **Install:** `npm install`
3. **Run Dev:** `npm run dev`
4. **Build:** `npm run build`

## Features
- **NLU Extraction:** Handles messy input like "my card expires Dec 27".
- **Deterministic Verification:** Strict 2-factor identity verification.
- **Local Validation:** Luhn algorithm, Expiry check, and Amount bounds checking.
- **Graceful Error Handling:** Maps API error codes to helpful user messages.

## Test Accounts
| Account ID | Name | Balance | DOB |
|------------|------|---------|-----|
| ACC1001 | Nithin Jain | ₹1,250.75 | 1990-05-14 |
| ACC1002 | Rajarajeswari Balasubramaniam | ₹540.00 | 1985-11-23 |
| ACC1003 | Priya Agarwal | ₹0.00 | 1992-08-10 |
| ACC1004 | Rahul Mehta | ₹3,200.50 | 1988-02-29 |

## Evaluation
Run the automated evaluation suite:
```bash
tsx src/server/evaluator.ts
```
