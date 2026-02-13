# Cloudflare Workflow Dashboard

A dashboard-style UI for Cloudflare Workflows with real-time updates, step visualization, and human-in-the-loop approval controls.

![Dashboard Preview](https://github.com/user-attachments/assets/dashboard-preview.png)

## Features

- **Real-time Updates**: Live progress tracking via Server-Sent Events (SSE)
- **Step Visualization**: Visual progress bars and step-by-step status
- **Human-in-the-Loop**: "Continue" button for approval steps using `waitForEvent()`
- **Workflow History**: Track all past workflow runs with status and timing
- **Durable Execution**: Uses D1 database for persistence across Worker instances
- **Retry Support**: "Retry" button for failed workflows

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Cloudflare                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Worker     │  │  Workflow    │  │  D1 Database │       │
│  │   (API)      │  │  (Execution) │  │  (State)     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                  │               │
│         │  Serves         │  Persists        │  Stores       │
│         │  Dashboard      │  State           │  Workflow     │
│         │  HTML           │                  │  Data         │
└─────────┼─────────────────┴──────────────────┴───────────────┘
          │
          ▼
┌──────────────────────────────────────┐
│          Dashboard UI                 │
│  - Progress bars                      │
│  - Step outputs                       │
│  - Continue/Retry buttons             │
│  - History sidebar                    │
└──────────────────────────────────────┘
```

## Workflow Steps

The demo workflow includes 5 steps:

1. **Fetch Files** - Retrieves a list of files (simulated)
2. **Wait for Approval** - Pauses for human approval via "Continue" button
3. **Fetch API Data** - Calls Cloudflare API for IP ranges
4. **Sleep** - Waits 10 seconds
5. **Write Operation** - Simulated write with potential failure and retries

## Prerequisites

- Node.js 18+
- Cloudflare account
- Wrangler CLI installed globally

## Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd cf-hello-world-workflow
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create D1 database**
   ```bash
   npx wrangler d1 create workflow-db
   ```

4. **Update wrangler.jsonc** with your database ID (from step 3)

5. **Apply database schema**
   ```bash
   npx wrangler d1 execute workflow-db --remote --file=schema.sql
   ```

6. **Generate TypeScript types**
   ```bash
   npx wrangler types
   ```

## Development

Run locally with hot reload:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:8787/`

## Deployment

Deploy to Cloudflare:

```bash
npx wrangler deploy
```

Your dashboard will be available at `https://<your-worker>.workers.dev/`

## Usage

1. Open the dashboard URL in your browser
2. Click "Start New Workflow" to begin
3. Watch steps execute in real-time
4. When the workflow reaches "Wait for Approval", click the "Continue" button
5. View step outputs by expanding them
6. Check the history sidebar for past runs
7. If a workflow fails, use the "Retry" button to create a new instance

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Dashboard HTML |
| `/api/stream` | GET | SSE for real-time updates |
| `/api/workflows` | GET | List all workflows |
| `/api/workflow` | POST | Create new workflow |
| `/api/workflow/:id` | GET | Get workflow details |
| `/api/workflow/:id/continue` | POST | Send continue event |
| `/api/workflow/:id/retry` | POST | Retry failed workflow |

## Project Structure

```
.
├── public/
│   └── index.html          # Dashboard UI (static asset)
├── src/
│   └── index.ts            # Worker code & API routes
├── schema.sql              # D1 database schema
├── wrangler.jsonc          # Wrangler configuration
└── package.json
```

## Technologies Used

- **Cloudflare Workers** - Edge computing platform
- **Cloudflare Workflows** - Durable execution framework
- **Cloudflare D1** - SQLite database for state persistence
- **Server-Sent Events (SSE)** - Real-time updates
- **Vanilla JavaScript** - No frontend framework needed

## License

MIT
