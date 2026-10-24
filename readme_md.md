# FormCraft

A starter form builder built with **React, Tailwind CSS, and Python**. Create and edit forms, preview the respondent experience, share a form link, collect responses, and export results as CSV.

## Stack

- Frontend: React, Vite, Tailwind CSS 4
- API: Python, FastAPI, Pydantic
- Storage: SQLite (created automatically at `backend/formbuilder.db`)

## Requirements

- Python 3.10 or newer
- Node.js 20.19+ or 22.12+

## Run locally

### Start Ollama

Keep the Ollama app running. Confirm your local model is available:

```cmd
ollama list
```

FormCraft uses `llama3:latest` by default. To use another model, download it with `ollama pull <model>` and set `OLLAMA_MODEL` in the backend terminal before starting the API.

### Start the API

Open Command Prompt in the project folder and run:

```cmd
cd backend
python -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
set OLLAMA_MODEL=llama3:latest
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API runs at `http://localhost:8000`; interactive API docs are at `http://localhost:8000/docs`. Port `8017` also works if port `8000` is occupied.

AI form generation runs through the local Ollama server at `http://127.0.0.1:11434/v1`; no Hugging Face token or inference credits are needed. Leave this terminal open while using FormCraft.

### Start the frontend

Open a second Command Prompt in the project folder and run:

```cmd
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The frontend tries API ports `8000` and `8017` by default. Set `VITE_API_URL` in a frontend `.env` file to use another API URL. Set `CORS_ORIGINS` in the backend environment to a comma-separated list of allowed origins.

## Features

- Form dashboard with response counts and search
- Grid and list views for browsing forms
- Email and password registration and login
- Per-account form ownership: users can only list, edit, delete, and view responses for their own forms
- AI form drafts generated from a text brief with a local Ollama model
- Five selectable form themes (Violet, Ocean, Forest, Sunset, and Slate) that persist and apply to the respondent page
- Image and video content blocks using public media URLs, including YouTube and Vimeo embeds
- Reorder questions and media blocks by dragging, or use move-up and move-down controls
- Create, edit, and delete forms
- Short answer, paragraph, multiple choice, checkbox, and dropdown questions
- Required question validation
- Respondent preview and submission
- Public respondent links, without exposing the form owner's dashboard or response data
- Individual response list and CSV download

## Current scope

This is a functional starter, not a production deployment. Passwords are stored as salted PBKDF2 hashes, and API sessions use signed bearer tokens. Set a long random `FORMBUILDER_SECRET_KEY` environment variable before deployment; the built-in default is only for local development. SQLite is suitable for local development; choose and configure a production database before deploying with multiple workers. Respondent links are public by design, while form management and response results require the owning account.
