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

### Start the API

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`; interactive API docs are at `http://localhost:8000/docs`. Port `8017` also works if port `8000` is occupied.

### Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The frontend tries API ports `8000` and `8017` by default. Set `VITE_API_URL` in a frontend `.env` file to use another API URL. Set `CORS_ORIGINS` in the backend environment to a comma-separated list of allowed origins.

## Features

- Form dashboard with response counts and search
- Email and password registration and login
- Per-account form ownership: users can only list, edit, delete, and view responses for their own forms
- Create, edit, and delete forms
- Short answer, paragraph, multiple choice, checkbox, and dropdown questions
- Required question validation
- Respondent preview and submission
- Public respondent links, without exposing the form owner's dashboard or response data
- Individual response list and CSV download

## Current scope

This is a functional starter, not a production deployment. Passwords are stored as salted PBKDF2 hashes, and API sessions use signed bearer tokens. Set a long random `FORMBUILDER_SECRET_KEY` environment variable before deployment; the built-in default is only for local development. SQLite is suitable for local development; choose and configure a production database before deploying with multiple workers. Respondent links are public by design, while form management and response results require the owning account.
