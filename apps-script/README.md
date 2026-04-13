# UiX Apps Script Backend (Base Ampliada)

This folder contains a free backend for the GitHub Pages frontend using Google Apps Script + Google Sheets.

## 1) Create the Apps Script project

1. Open https://script.google.com/
2. Create a new Apps Script project.
3. Link it to a Google Spreadsheet (or open from an existing spreadsheet).
4. Replace the default `Code.gs` content with `UixBackend.gs`.

## 2) Grant permissions

On first run/deploy, Apps Script will ask for permissions for:
- `SpreadsheetApp` (store chat and progress data)
- `MailApp` (send reminder emails)

## 3) Deploy as Web App

1. Click `Deploy` -> `New deployment`.
2. Type: `Web app`.
3. Execute as: `Me`.
4. Who has access: `Anyone` (or your org setting that still allows your frontend to call it).
5. Deploy and copy the `/exec` URL.

Expected URL format:

`https://script.google.com/macros/s/<deployment-id>/exec`

## 4) Configure frontend

Set this value in your frontend environment:

`VITE_API_BASE_URL=https://script.google.com/macros/s/<deployment-id>/exec`

Or set it from the Capital Humano panel URL setting if available.

## 5) Supported actions

GET actions:
- `action=health`
- `action=getChatSession&email=<email>`
- `action=getCollaboratorProgress&email=<email>`
- `action=listCollaboratorsProgress`

POST actions (form-urlencoded):
- `action=upsertChatSession` with `payload={...}`
- `action=syncCollaboratorAssessment` with `payload={...}`
- `action=uploadDeliverable` with `payload={...}`
- `action=sendProgressReminder` with `payload={...}`

## 6) Quick tests

Health check in browser:

`<exec-url>?action=health`

Fetch chat session:

`<exec-url>?action=getChatSession&email=test@example.com`

If not found, you should receive a 404 JSON response.

## 7) Data storage

The script auto-creates 2 sheets:
- `chat_sessions`
- `collaborator_progress`

Rows are keyed by normalized email (lowercase/trimmed).

## Notes

- This setup is free and works with static hosting on GitHub Pages.
- If you update script code later, create a new deployment version and use the new `/exec` URL.
