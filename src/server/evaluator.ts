/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from "./agent.js";
import dotenv from "dotenv";

dotenv.config();

interface Scenario {
  name: string;
  steps: string[];
  expectedState?: string;
  mustContain?: string[];
}

const TEST_SCENARIOS: Scenario[] = [
  {
    name: "Happy Path - ACC1001",
    steps: [
      "hi",
      "it's ACC 1001",
      "Nithin Jain",
      "my DOB is 14th May 1990",
      "I'll pay the full amount",
      "card 4532 0151 1283 0366, expiring 12/27, CVV 123, name Nithin Jain"
    ],
    expectedState: "RECAP"
  },
  {
    name: "Verification Failure - Wrong Name",
    steps: [
      "ACC1001",
      "Wrong Name",
      "1990-05-14",
      "Incorrect Again",
      "1990-05-14",
      "Failed Third",
      "1990-05-14"
    ],
    expectedState: "TERMINATED"
  },
  {
    name: "Zero Balance - ACC1003",
    steps: [
      "ACC1003",
      "Priya Agarwal",
      "10th August 1992"
    ],
    expectedState: "CLOSED"
  },
  {
    name: "Messy Input - ACC1002",
    steps: [
      "yeah it's ACC 1002 I think",
      "my name? it's Rajarajeswari Balasubramaniam",
      "born on November 23rd, 1985",
      "can I do 200 for now?",
      "card 4532015112830366, Dec 2027, 123, Rajarajeswari B"
    ],
    expectedState: "RECAP"
  },
  {
    name: "Leap Year DOB - ACC1004",
    steps: [
      "ACC1004",
      "Rahul Mehta",
      "February 29, 1988"
    ],
    expectedState: "BALANCE_DISCLOSURE"
  },
  {
    name: "Invalid Leap Year Date - 1989",
    steps: [
      "ACC1004",
      "Rahul Mehta",
      "February 29, 1989"
    ],
    mustContain: ["match", "try again"] // Should stay in verification
  },
  {
    name: "Invalid Card Then Valid Card",
    steps: [
      "ACC1001",
      "Nithin Jain",
      "1990-05-14",
      "full amount",
      "1234567812345678", // Fails Luhn
      "4532015112830366", // Valid
      "12/2027",
      "123",
      "Nithin Jain"
    ],
    expectedState: "RECAP"
  },
  {
    name: "Amount Exceeds Balance",
    steps: [
      "ACC1001",
      "Nithin Jain",
      "1990-05-14",
      "I want to pay 999999"
    ],
    mustContain: ["exceeds"]
  }
];

async function runEvaluation() {
  console.log("==============================================");
  console.log("   PAYGUARD AGENT AUTOMATED EVALUATOR        ");
  console.log("==============================================\n");

  let passes = 0;

  for (const scenario of TEST_SCENARIOS) {
    console.log(`[SCENARIO] ${scenario.name}`);
    const agent = new Agent();
    let lastResult: any;
    
    for (const step of scenario.steps) {
      process.stdout.write(`  User: ${step}\n`);
      lastResult = await agent.next(step);
      process.stdout.write(`  Agent: ${lastResult.message}\n\n`);
    }

    let scenarioPassed = true;
    if (scenario.expectedState && lastResult.state !== scenario.expectedState) {
      scenarioPassed = false;
    }
    if (scenario.mustContain) {
      for (const keyword of scenario.mustContain) {
        if (!lastResult.message.toLowerCase().includes(keyword.toLowerCase())) {
          scenarioPassed = false;
        }
      }
    }

    if (scenarioPassed) {
      console.log(`✅ RESULT: PASS\n`);
      passes++;
    } else {
      console.log(`❌ RESULT: FAIL (State: ${lastResult.state})\n`);
    }
    console.log("----------------------------------------------\n");
  }

  console.log("==============================================");
  console.log(`FINAL SCORE: ${passes}/${TEST_SCENARIOS.length}`);
  console.log("==============================================\n");
}

if (process.env.GEMINI_API_KEY) {
  runEvaluation();
} else {
  console.error("GEMINI_API_KEY not found in environment.");
}
