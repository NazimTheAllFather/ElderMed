# ElderMed extension — Step 1 (mic) + Step 4 (form tools), merged

JavaScript form tools for the local About You demo, merged into one Chrome extension with the Step 1 microphone/offscreen skeleton from `Correc_Mechanics`. No transport (Step 2) or playback (Step 3) is included yet — the voice AI itself is not wired up.

## Current status (2026-09-19)

- **Step 4 (this repo's original work):** done and manually verified against the demo page — popup finds the target tab, loads the field list (`GET_FIELDS`), and fills a field (`SET_FIELD`) with visible/disabled checks.
- **Step 1 (merged in from `Correc_Mechanics`):** permission flow and offscreen document verified working — installing the extension opens `options.html`, granting mic access creates the offscreen document (visible at `chrome://inspect/#offscreen-documents`), which holds a live `getUserMedia` stream. No audio is transmitted anywhere yet; `offscreen.js` only logs that the stream is active.
- **Step 2 (transport) and Step 3 (playback/barge-in):** not started. Whoever builds these should add the WebSocket/tool-call logic inside `offscreen.js`, since that's where the mic stream already lives, and call `chrome.runtime.sendMessage` with the same `ELDERMED_TOOL_REQUEST` envelope documented below (see "Voice integration contract") to reach `background.js`.
- This used to be two separate extensions (a form-tools extension and a "Voice AI Extension" skeleton). They're now one `manifest.json`/one extension so `chrome.runtime.sendMessage` can reach across both halves.

## Run the demo

From the ElderMed repository:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory "demo page"
```

Open http://localhost:8000 in Chrome.

## Load the extension

1. Open chrome://extensions.
2. Enable Developer mode.
3. Click Load unpacked and select this `extension` folder.
4. An options tab opens automatically — click Enable Microphone and allow it. This creates the offscreen document that will hold the voice pipeline's mic stream (Step 1).
5. Return to the local demo tab and open the extension popup.
6. Choose Date of Birth, enter `04/18/1952`, and click Apply answer.
7. Test a dropdown and radio group. Select a different value to test a correction.
8. Refresh fields after changing a controlling answer that reveals other controls.

First and last names are editable in the demo for typing and extension testing. Hidden or disabled fields are not forcibly unlocked. The popup displays error responses.

## Files

- manifest.json: Chrome Manifest V3 configuration
- background.js: validates and routes requests to a specific tab; creates the offscreen document once mic permission is granted
- field-map.js: 37 known field/group identifiers
- content.js: applies and verifies DOM updates; serializes requests
- popup.html / popup.js: manual stand-in for voice requests; also records the target tab ID for the voice component
- options.html / options.js: one-time microphone permission prompt (opens automatically on install)
- offscreen.html / offscreen.js: holds the microphone stream for the voice pipeline (Step 1 skeleton; Steps 2/3 — transport and playback — are not implemented here yet)

Only localhost and 127.0.0.1 are supported. A teammate can run their own copy locally. The real CommonHelp portal is intentionally not enabled or validated in this prototype.

## Voice integration contract

After the user opens the extension on the target tab, `popup.js` stores that tab's ID in `chrome.storage.local` (`eldermedTabId`). Requests from the voice component (running in `offscreen.js`) can omit `tabId` and `background.js` will fall back to the stored value automatically. Send this from the extension's voice component (not from ordinary page JavaScript):

```js
const result = await chrome.runtime.sendMessage({
  type: 'ELDERMED_TOOL_REQUEST',
  requestId: crypto.randomUUID(),
  tabId: targetTabId,
  action: 'SET_FIELD',
  field: 'dateOfBirth',
  value: '04/18/1952'
});
```

Use `action: 'GET_FIELDS'` with the same envelope to obtain field metadata and actual option values. Dropdowns and radios use exact option values, not their spoken labels. The voice adapter maps a spoken answer to one of these values. A correction repeats SET_FIELD with a new value. Unknown actions are rejected; no arbitrary code or selectors are accepted.

Example success:

```json
{"requestId":"example","success":true,"field":"dateOfBirth","value":"04/18/1952"}
```

Example failure:

```json
{"requestId":"example","success":false,"code":"FIELD_DISABLED","error":"This field is disabled or read-only."}
```

Interpret success as verification of the local field state, not government validation or saved application status. Do not verbally confirm success before receiving the result. An invalid result may leave an attempted value in a text field; error responses require review.

## Checks completed

The content handler was exercised in isolated headless Chrome on the demo HTML: valid/invalid dates, disabled and unknown fields, radio selection/repeat/correction, valid dropdown values and invalid options. JavaScript syntax was checked. Loading the complete unpacked extension and testing Chrome message routing remains a manual integration check using the steps above.
