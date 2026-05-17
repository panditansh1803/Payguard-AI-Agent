# PayGuard AI Agent - Architectural Design

This document outlines the architecture, key decisions, and tradeoffs for the Payment Collection AI Agent.

## 1. Architecture Overview

The system uses a **Hybrid Orchestration** model:
- **LLM (Gemini 2.0 Flash):** Responsible for Natural Language Understanding (NLU). It extracts structured fields (Account IDs, Names, Dates, Card details) from messy, free-form user input and suggests contextual responses.
- **Deterministic State Machine (TypeScript):** Manages the conversation flow, persists session state, and executes strict logic (Verification, Local Validation, API calls).

### State Flow
1. **GREETING:** Welcomes user, prompts for Account ID.
2. **ACCOUNT_LOOKUP:** Fetches account details from the external API.
3. **VERIFICATION:** Strict deterministic check of Name + (DOB/Aadhaar/Pincode).
4. **BALANCE_DISCLOSURE:** Informs user of outstanding amount.
5. **PAYMENT_AMOUNT:** Validates user's desired payment amount against balance.
6. **CARD_COLLECTION:** Collects and locally validates card data (Luhn, Expiry, CVV).
7. **PAYMENT_PROCESSING:** Final API call to process transaction.
8. **RECAP & CLOSE:** Final summary and session termination.

## 2. Key Decisions

### Deterministic Verification
**Decision:** Verification matching is performed in TypeScript/Node, NOT inside the LLM prompt.
**Rationale:** LLMs can be "helpful" to a fault, potentially allowing fuzzy name matches or ignoring small discrepancies. Security requires strict string equality and calendar-valid date checks.

### Local Validation Layer
**Decision:** Perform Luhn checks and date validation before calling the Payment API.
**Rationale:** Reduces latency for the user and prevents unnecessary load/errors on the downstream payment processor.

### Zero-Exposure Policy
**Decision:** Sensitive fields like DOB, Aadhaar, and Pincode are NEVER repeated back to the user.
**Rationale:** Prevents phishing or accidental data leakage in shared environments.

## 3. Tradeoffs & Security

- **In-Memory Sessions:** For this demo, sessions are stored in an in-memory Map. In production, this would use Redis with encrypted payloads.
- **Card Data:** Raw PAN is transiently held in the Agent's state to facilitate the single-call payment API structure. A more secure production implementation would use a PCI-compliant tokenization service (e.g., Stripe) where the server only sees tokens.

## 4. Future Improvements
- **Handoff Logic:** Trigger human agent escalation if verification fails 3 times.
- **Multimodal Support:** Allow users to upload images of their accounts for faster lookup.
- **Voice Integration:** Support phone-based payment collection using the same state machine.
