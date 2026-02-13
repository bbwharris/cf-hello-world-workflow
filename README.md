# Cloudflare Workflow Dashboard

A dashboard-style UI for Cloudflare Workflows with real-time updates, step visualization, human-in-the-loop approval controls, and AI-powered document analysis using Workers AI.

![Dashboard Preview](https://github.com/user-attachments/assets/dashboard-preview.png)

## Features

- **Real-time Updates**: Live progress tracking via Server-Sent Events (SSE)
- **Step Visualization**: Visual progress bars and step-by-step status
- **AI Document Analysis**: Uses Workers AI (Llama 3.1) to analyze documents stored in R2
- **Human-in-the-Loop**: "Continue" button for approval steps using `waitForEvent()`
- **Workflow History**: Track all past workflow runs with status and timing
- **Durable Execution**: Uses D1 database for persistence across Worker instances
- **Object Storage**: Documents stored in Cloudflare R2
- **Retry Support**: "Retry" button for failed workflows

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloudflare                                       │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐     │
│  │   Worker     │  │  Workflow    │  │  D1 Database │  │    R2    │     │
│  │   (API)      │  │  (Execution) │  │  (State)     │  │ (Docs)   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘     │
│         │                 │                 │               │           │
│         │  Serves         │  Persists       │  Stores       │  Fetches  │
│         │  Dashboard      │  State          │  Workflow     │  Document │
│         │  HTML           │                 │  Data         │  Content  │
└─────────┼─────────────────┴─────────────────┴───────────────┴───────────┘
          │
          ▼
┌──────────────────────────────────────┐
│          Dashboard UI                │
│  - Progress bars                     │
│  - AI Analysis Output (Markdown)     │
│  - Continue/Retry buttons            │
│  - History sidebar                   │
└──────────────────────────────────────┘
```

## Workflow Steps

The workflow includes 6 steps with AI analysis:

1. **Fetch Document** - Retrieves document from R2 storage
2. **AI Analysis** - Uses Workers AI (Llama 3.1 8B) to analyze and summarize the document
3. **Wait for Approval** - Pauses for human approval via "Continue" button
4. **Fetch API Data** - Calls Cloudflare API for IP ranges
5. **Sleep** - Waits 10 seconds
6. **Persist Results** - Simulated write operation with potential failure and retries

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

4. **Create R2 bucket**
   ```bash
   npx wrangler r2 bucket create workflow-docs
   ```

5. **Upload document to R2**
   ```bash
   npx wrangler r2 object put workflow-docs/cf-hello-world-workflow/document.txt --file=public/document.txt --remote
   ```

6. **Update wrangler.jsonc** with your database ID (from step 3)

7. **Apply database schema**
   ```bash
   npx wrangler d1 execute workflow-db --remote --file=schema.sql
   ```

8. **Generate TypeScript types**
   ```bash
   npx wrangler types
   ```

## Development

Run locally with hot reload:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:8787/`

Note: Local R2 development uses a local storage simulation. The document will also be uploaded locally when running `wrangler dev`.

## Deployment

Deploy to Cloudflare:

```bash
npx wrangler deploy
```

Your dashboard will be available at `https://<your-worker>.workers.dev/`

## Usage

1. Open the dashboard URL in your browser
2. Click "Start New Workflow" to begin
3. Watch the workflow:
   - Fetch the document from R2 storage
   - AI analyzes and summarizes the content (formatted output)
   - Pause for your approval with the "Continue" button
   - Complete remaining steps
4. View the AI analysis with nicely formatted markdown output showing:
   - Model used (Llama 3.1 8B)
   - Analysis timestamp
   - Structured summary with headers and styling
5. Check the history sidebar for past runs
6. If a workflow fails, use the "Retry" button to create a new instance

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
│   ├── index.html          # Dashboard UI (static asset)
│   └── document.txt        # Sample document for R2 upload
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
- **Cloudflare R2** - Object storage for documents
- **Workers AI** - AI inference using Llama 3.1 8B
- **Server-Sent Events (SSE)** - Real-time updates
- **Vanilla JavaScript** - No frontend framework needed

## Document Storage

Documents are stored in Cloudflare R2 at the path:
```
workflow-docs/cf-hello-world-workflow/document.txt
```

The workflow fetches documents from R2 during execution, enabling:
- Easy document updates without code changes
- Large file support (R2 has no size limits)
- Cost-effective storage
- Global access from any Cloudflare data center

## License

MIT
