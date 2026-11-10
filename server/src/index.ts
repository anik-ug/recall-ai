import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "./db/pool.js";
import { runAgent } from "./agent/agent.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const maxHistory = Math.max(6, Math.min(60, Number(process.env.MAX_HISTORY_MESSAGES || 24)));

app.use(helmet());
app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: "20kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const chatSchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(4_000)
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.get("/api/conversations", async (_req, res) => {
  const result = await pool.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
      (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
     FROM conversations c ORDER BY c.updated_at DESC LIMIT 30`
  );
  res.json({ conversations: result.rows });
});

app.post("/api/conversations", async (_req, res) => {
  const result = await pool.query(
    "INSERT INTO conversations DEFAULT VALUES RETURNING id, title, created_at, updated_at"
  );
  res.status(201).json({ conversation: result.rows[0] });
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: "Invalid conversation ID" });
  const conversation = await pool.query("SELECT id FROM conversations WHERE id = $1", [id.data]);
  if (!conversation.rowCount) return res.status(404).json({ error: "Conversation not found" });
  const result = await pool.query(
    "SELECT id, role, content, sources, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [id.data]
  );
  res.json({ messages: result.rows });
});

app.post("/api/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  const { conversationId, message } = parsed.data;

  try {
    const conversation = await pool.query("SELECT id FROM conversations WHERE id = $1", [conversationId]);
    if (!conversation.rowCount) return res.status(404).json({ error: "Conversation not found. Create one first." });

    // Persist the user turn before calling providers, so its timestamp is never lost.
    const inserted = await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2) RETURNING id, created_at",
      [conversationId, message]
    );
    await pool.query(
      "UPDATE conversations SET updated_at = NOW(), title = CASE WHEN title = 'New conversation' THEN LEFT($2, 72) ELSE title END WHERE id = $1",
      [conversationId, message]
    );

    const historyResult = await pool.query(
      `SELECT role, content, created_at FROM (
         SELECT role, content, created_at FROM messages
         WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2
       ) recent ORDER BY created_at ASC`,
      [conversationId, maxHistory]
    );

    const result = await runAgent(historyResult.rows, new Date().toISOString());
    const assistant = await pool.query(
      "INSERT INTO messages (conversation_id, role, content, sources) VALUES ($1, 'assistant', $2, $3::jsonb) RETURNING id, created_at",
      [conversationId, result.answer, JSON.stringify(result.sources)]
    );
    await pool.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);

    res.json({
      answer: result.answer,
      sources: result.sources,
      userMessage: { id: inserted.rows[0].id, createdAt: inserted.rows[0].created_at },
      assistantMessage: { id: assistant.rows[0].id, createdAt: assistant.rows[0].created_at }
    });
  } catch (error) {
    console.error("Chat request failed:", error);
    res.status(502).json({ error: "The agent could not complete this turn. Your message was saved; please try again." });
  }
});

app.listen(port, () => console.log(`RecallAI API listening on port ${port}`));
