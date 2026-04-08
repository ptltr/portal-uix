# Deploy api-server on Render

## 1) Create service from repo Blueprint

1. Go to Render Dashboard.
2. Click New + -> Blueprint.
3. Select repository `ptltr/portal-uix`.
4. Confirm `render.yaml` is detected.
5. Deploy.

This will create:
- Web service: `portal-uix-api`
- PostgreSQL database: `portal-uix-db`

## 2) Set required environment variables

In Render web service -> Environment, set:
- `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `GOOGLE_APPS_SCRIPT_WEBHOOK_URL`
- Optional: `GOOGLE_APPS_SCRIPT_WEBHOOK_TOKEN`

If you are not using OpenAI routes for now, you can set temporary values:
- `AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1`
- `AI_INTEGRATIONS_OPENAI_API_KEY=dummy`

## 3) Verify backend health

Open:
- `https://<your-render-domain>/api/healthz`

Expected response:
- `{ "status": "ok" }`

## 4) Connect GitHub Pages frontend to this backend

On `https://ptltr.github.io/portal-uix/`:
1. Open Capital Humano.
2. In "Configuracion de recordatorios automaticos", paste:
   - `https://<your-render-domain>`
3. Click "Guardar URL".

This URL is persisted in browser local storage and used for reminder send requests.

## 5) Notes about persistence

- Chat session history (`/api/chat-sessions/:email`) now uses PostgreSQL when `DATABASE_URL` is present (Render production).
- In local/dev environments without DB, it falls back to file storage.
