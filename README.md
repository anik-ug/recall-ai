# RecallAI — Context-aware Web Search Agent

RecallAI is a full-stack chat agent built for the minimi engineering challenge. It has one external tool (**web search**), persistent timestamped conversation history, follow-up awareness, source citations, and a documented architecture.

## Architecture

- **Web:** React + TypeScript + Vite
- **API:** Node.js + Express + TypeScript
- **Agent:** Gemini function calling with one declared tool (`web_search`)
- **Search:** Tavily Search API
- **Persistence:** PostgreSQL (`pg`)
- **Safety/reliability:** input validation, rate limiting, bounded history, search timeout, tool-call limit, parameterized SQL

See [`design.md`](./design.md) for the architecture, trade-offs, and failure handling.

## Requirements

- Node.js 20+
- PostgreSQL 15+
- Gemini API key
- Tavily API key

## Run locally

### 1. Configure the API

```bash
cd server
cp .env.example .env
# Fill GEMINI_API_KEY, TAVILY_API_KEY and DATABASE_URL
npm install
npm run db:migrate
npm run dev
```

The API defaults to `http://localhost:4000`.

### 2. Configure the web app

In another terminal:

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`).

## Environment variables

Server (`server/.env`):

| Variable | Required | Description |
|---|---:|---|
| `GEMINI_API_KEY` | yes | Google Gemini API key |
| `TAVILY_API_KEY` | yes | Tavily Search API key |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `PORT` | no | API port, default `4000` |
| `CLIENT_ORIGIN` | no | Browser origin, default `http://localhost:5173` |
| `GEMINI_MODEL` | no | Default `gemini-2.5-flash` |
| `MAX_HISTORY_MESSAGES` | no | Context window, default `24` |

Client (`client/.env`):

| Variable | Required | Description |
|---|---:|---|
| `VITE_API_URL` | no | API base URL, default `http://localhost:4000` |

## API

- `GET /api/health` — health check
- `GET /api/conversations` — list recent conversations
- `POST /api/conversations` — create a conversation
- `GET /api/conversations/:id/messages` — timestamped messages
- `POST /api/chat` — send a message and receive an answer with citations

Example:

```bash
curl -X POST http://localhost:4000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"conversationId":"<uuid>","message":"What changed in the latest Node.js release?"}'
```

## Design decisions

1. Search is a tool, not a separate chatbot mode. The model decides when current or externally verifiable information needs a search.
2. Only one tool is exposed to the model: `web_search`.
3. Messages are persisted before the agent runs, so the user's question and its timestamp survive a model/search failure.
4. Tool calls are capped and search results are bounded to keep latency and token use predictable.
5. Conversation history is loaded from PostgreSQL, preserving follow-up context across reloads.
6. Search citations are returned as structured sources and rendered as links.

## Known limitations

- The initial version returns a completed answer rather than token-by-token streaming. Search and model calls are asynchronous, bounded by timeouts.
- Memory is conversation-scoped recent history, not cross-conversation personal profiling.
- For production, add authentication, per-user ownership checks, observability, migrations tooling, and durable background processing.

## Tests

```bash
cd server
npm test
```

The tests cover agent history construction and search-result normalization. API integration tests require a configured PostgreSQL database and API keys.
