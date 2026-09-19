# ElderMed

ElderMed is a Chrome Manifest V3 extension that helps older adults complete complicated web forms through a live ElevenLabs voice assistant. A content script reads the visible form, a floating in-page widget starts the conversation, and the agent fills fields only after the user confirms each answer.

## Final architecture

1. A demo government-style healthcare form runs in a normal browser tab.
2. A Chrome content script scans the visible form and injects a Shadow DOM host.
3. The visible assistant is a floating widget (an extension-page iframe inside that Shadow DOM).
4. The user starts an ElevenLabs voice conversation from the widget.
5. ElevenLabs calls client tools `get_current_form` and `set_form_answer`.
6. All DOM access and form filling stay local in the browser. The model never receives CSS selectors, XPath, or DOM nodes.
7. A small FastAPI backend protects the ElevenLabs API key and mints temporary signed conversation credentials.
8. Audio travels directly between the browser and ElevenLabs. The backend does not proxy audio.

The existing Chrome side panel is kept as a fallback. The required visible interface is the floating assistant.

The conversation runtime lives in the extension iframe, not the content-script world. The ElevenLabs SDK loads audio worklets and uses WebRTC; page CSP and isolated-world microphone access are unreliable. DOM scanning and filling remain in the content script.

## Frontend technology stack

- React 19 and TypeScript
- Vite 6 with `@crxjs/vite-plugin`
- `@elevenlabs/react` for the voice session
- Vitest and ESLint

## Backend technology stack

- Python, FastAPI, Uvicorn, Pydantic, httpx
- pytest
- python-dotenv for local configuration

## Repository structure

```
ELDERMED/
  frontend/          Chrome extension (Vite + CRXJS)
    src/
    public/
    package.json
    manifest.config.ts
    vite.config.ts
    .env.example
  backend/           FastAPI credential service
    app/
    tests/
    requirements.txt
    .env.example
  demo-page/         Static About You demo form
  docs/              Dashboard setup and design notes
  README.md
  .gitignore
```

- `frontend/src/background/` — service worker
- `frontend/src/content/` — form scanner, filler, Shadow DOM widget host
- `frontend/src/widget/` — floating assistant iframe UI
- `frontend/src/sidepanel/` — optional side-panel fallback
- `frontend/src/shared/` — types, IDs, tab messaging, and client tools
- `frontend/src/options/` — optional microphone permission page
- `docs/ELEVENLABS_SETUP.md` — dashboard client-tool setup
- `docs/correction-mechanics-ideas.md` — design notes

## How the demo branch page was integrated

The current branch is `AI_Connect`. The demo form lives on `origin/demo`. The branch was **not** merged. Only the original `demo page/` directory was copied, then renamed to `demo-page/`:

```sh
git checkout origin/demo -- "demo page"
git mv "demo page" demo-page
```

Existing extension work was preserved. The demo is still a static HTML page. It now listens for `change` on `document` so conditional questions work, and it includes a clearly labeled ElderMed sample-controls block for date, checkbox, required, Yes/No, and sensitive-field tests. The CommonHelp-like layout is a local testing replica and is not affiliated with Virginia agencies.

## How to Build

### Step #0: Clone the Repo and copy required frontend environment variables

Copy `frontend/.env.example` to `frontend/.env` before building:

```
VITE_API_BASE_URL=http://localhost:8000
```

The frontend must never contain `ELEVENLABS_API_KEY` or `ELEVENLABS_AGENT_ID`. Never prefix those with `VITE_`.

### Step #1: Required backend environment variables

ElderMed is built with ElevenLabs API. Enter your API keys and Agent IDs.

Copy `backend/.env.example` to `backend/.env`:

```
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174
ENVIRONMENT=development
```

### How to obtain the ElevenLabs Agent ID

Open the ElevenLabs Agents dashboard, open your agent, and copy the public Agent ID (`agent_...`). Put it in `backend/.env` as `ELEVENLABS_AGENT_ID`. Configure the two client tools described in `docs/ELEVENLABS_SETUP.md`.

### Where the ElevenLabs API key belongs

Only in `backend/.env` as `ELEVENLABS_API_KEY`. It must never appear in source files, `manifest.json`, Vite variables, browser logs, network responses returned to the extension, compiled JavaScript, `chrome.storage`, or `localStorage`.

### Step #2: How to run the backend

```bash
cd backend
python -m venv .venv

For Mac:
source .venv/bin/activate

For Windows: 
.venv\Scripts\activate

pip install -r requirements.txt

For Windows:
copy .env.example .env

For Mac:
cp .env.example .env

# edit .env and set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID
python -m uvicorn app.main:app --reload --port 8000
```

Confirm 
For Windows:
`GET http://localhost:8000/health` 

For Mac:
curl http://localhost:8000/health
returns `{ "status": "ok" }`.

### Step #4: How to run the demo page

From `frontend/`:

```bash
cd frontend
npm run demo
```
**If you get a Python Version Error, change Python into Python3 inside ./frontend/Packages.json**

Or from the repository root:

```bash
python -m http.server 5174 --bind 127.0.0.1 --directory demo-page
```

Open http://127.0.0.1:5174/ . The demo uses port 5174 so it does not collide with the backend on port 8000.

### Step #5: How to build the extension

```bash
cd frontend
npm install
copy .env.example .env
# VITE_API_BASE_URL defaults to http://localhost:8000
npm run build
```

`npm run dev` starts the CRX development build from `frontend/`.

### Step #6: Load the unpacked extension

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select the **`frontend/dist`** folder.

#### Testing the voice assistant

**You should:**
1. Start the FastAPI backend on port 8000.
2. From `frontend/`, run `npm run demo`.
3. From `frontend/`, run `npm run build` or `npm run dev`.
4. Load/reload unpacked `frontend/dist`.
5. Open http://127.0.0.1:5174/ .
   
7. Open the floating assistant and press **Start Assistant**.


## Security limitations

- The extension can inspect forms on http and https pages because this prototype is a general form assistant. It does not request `<all_urls>`, but `http://*/*` and `https://*/*` are still broad host permissions.
- Temporary conversation tokens are secrets for the life of the session. They are not the API key, but they must not be logged.
- Sensitive fields (passwords, SSN, bank account, verification codes) are excluded from spoken collection and automatic fill. Heuristics can miss unusual labels.
- The model can still request invalid updates. Local validation is the authority, not the model.
- Audio is processed by ElevenLabs. Do not use real applicant data on the demo page.

## Phase-one limitations

- The assistant does not navigate, submit, sign, or accept certifications.
- It does not determine Medicaid eligibility or invent policy.
- The side panel is a fallback, not the primary UI.
- Dashboard tool names must be created manually and must match the code exactly.
- Conditional questions are detected with a debounced MutationObserver; very fast DOM churn can delay a rescan by about 250ms.

## Troubleshooting

- **Missing backend URL:** copy `frontend/.env.example` to `frontend/.env`, set `VITE_API_BASE_URL`, and rebuild.
- **Missing Agent ID:** set `ELEVENLABS_AGENT_ID` in `backend/.env`.
- **Backend unavailable:** start Uvicorn on port 8000 and check `/health`.
- **Microphone denied:** press Start Assistant again and allow the microphone, or use the options page.
- **Content script unavailable:** reload the demo tab after loading the extension. Chrome pages and the Web Store cannot be scanned.
- **Stale page version:** the form changed. The agent should call `get_current_form` again.
- **Widget missing or silent audio:** confirm `frontend/dist` is loaded and that the backend is running. Audio worklets are served from `elevenlabs-worklets/` so the extension does not need `blob:` in CSP.
- **CORS / CSP:** the backend allowlist must include `http://127.0.0.1:5174` and Chrome extension origins; the extension CSP allows the backend plus ElevenLabs/LiveKit.

## Scripts

From `frontend/`:

- `npm run dev` — Vite + CRX development build
- `npm run build` — typecheck + production build
- `npm run demo` — static demo page on port 5174
- `npm run typecheck`
- `npm run lint`
- `npm test`

From `backend/`:

- `python -m uvicorn app.main:app --reload --port 8000`
- `python -m pytest`
