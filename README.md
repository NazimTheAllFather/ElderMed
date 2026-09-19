# ElderMed

ElderMed helps elderly users fill out government benefit forms (like Medicaid) by voice — instead of typing, they'll be able to talk to an AI, and the AI fills in the form for them.

This repo currently has two pieces that work together: a **demo form** to practice on, and a **browser extension** that can fill it in.

## What's in `demo page/`

A local copy of the "About You" page from Virginia's real CommonHelp Medicaid application, with the same field names/IDs as the original. It's a safe sandbox — nothing here is submitted anywhere, and no real Medicaid data is involved. It exists purely so we have something realistic for the extension to practice filling out.

Run it with:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory "demo page"
```

Then open `http://localhost:8000` in Chrome. See `demo page/README.md` for more detail.

## What's in `extension/`

A Chrome extension that will eventually let a voice AI fill out the demo form for a user. The full plan has 4 steps; here's where each one stands and, in plain terms, what it does.

### Step 4 — Extension & form-filling (done)

This is the part that actually finds a field on the page and types a value into it. In simple terms:

1. Something (right now, a manual test popup — later, the voice AI) says: *"Set Date of Birth to 04/18/1952."*
2. The extension's background script checks that request is safe (right extension, right tab — only the local demo page is allowed) and hands it to a helper script injected into that tab.
3. That helper script finds the real Date of Birth box on the page, checks it isn't hidden or locked, and types the value in.
4. It reports back "done" or a specific error (e.g. "that field is disabled"), which shows up as a result message.

Nothing here understands speech or talks to any AI — it only receives already-decided instructions and acts on them.

**To try it yourself:** load `extension/` as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked), open the demo page, then open the extension's popup. Pick a field, type a value, click **Apply answer**. Full steps are in `extension/README.md`.

### Step 1 — Microphone capture (skeleton only)

Handles asking the user for microphone permission and keeping an open microphone stream ready. It doesn't do anything with the audio yet — no speech-to-text, nothing sent anywhere.

### Steps 2 & 3 — Talking to the AI and playing its voice back (not started)

Step 2 will send the microphone audio to a voice AI service and get back both a transcript and the AI's spoken response. Step 3 will play that response out loud, and stop it instantly if the user starts talking over it. Once these exist, they'll replace the manual test popup from Step 4 — the AI will send the same kind of "set this field to this value" instruction automatically, instead of a person clicking a button.

## Current status

Steps 1 and 4 are merged into one extension (in `extension/`) so they're able to talk to each other once Steps 2/3 are added. See `extension/README.md` for the full technical status and the message format Steps 2/3 need to use to hand off to Step 4.
