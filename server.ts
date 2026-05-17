/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

// Load env vars FIRST before any module that reads process.env at import time
dotenv.config();

import { createServer as createViteServer } from 'vite';
import { Agent } from './src/server/agent.js';


// In-memory session store
const sessions = new Map<string, Agent>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    let agent = sessions.get(sessionId);
    if (!agent) {
      agent = new Agent();
      sessions.set(sessionId, agent);
    }

    const result = await agent.next(message || "hello");
    res.json(result);
  });

  app.post('/api/reset', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    res.json({ status: 'ok' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
