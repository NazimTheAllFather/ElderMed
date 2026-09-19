# ElevenLabs dashboard setup

The ElevenLabs agent is configured in the dashboard. The extension registers these **exact**, case-sensitive client tool names. Dashboard names must match the code. Enable **Wait for response / Block conversation** on both tools.

Do not put the ElevenLabs API key in the extension. The FastAPI backend at `POST /api/elevenlabs/session` requests a temporary WebRTC conversation token (and a signed WebSocket URL) using `ELEVENLABS_API_KEY` on the server.

## Backend `.env`

In `backend/.env`:

- `ELEVENLABS_API_KEY` — from [API keys](https://elevenlabs.io/app/settings/api-keys)
- `ELEVENLABS_AGENT_ID` — the id that starts with `agent_…` from the agent URL or agent settings (not the display name like “ElderMed AI”)

After editing `.env`, restart uvicorn (`Ctrl+C`, then start again). Changing `.env` alone does not reload settings.

## Tool 1

Name:
`get_current_form`

Type:
Client

Parameters:
None

Wait for response / Block conversation:
Enabled

The tool returns a JSON snapshot of the visible form, or a structured failure such as `NO_SUPPORTED_FORM`, `NO_FORM_FIELDS`, `CONTENT_SCRIPT_UNAVAILABLE`, `NO_ACTIVE_TAB`, `UNSUPPORTED_PAGE`, or `PAGE_SCAN_FAILED`.

## Tool 2

Name:
`set_form_answer`

Type:
Client

Required parameters:

- `field_id`: String
- `answer`: String
- `page_version`: String

Optional parameters:

- `option_id`: String — exact option_id from the form snapshot (radio / checkbox only). Do NOT send for select (dropdown) fields — they are resolved by the `answer` text.
- `operation_id`: String — a unique caller-generated ID; repeating the same ID replays the cached result instead of re-applying the write (idempotency key)

Wait for response / Block conversation:
Enabled

The tool fills only the field identified by `field_id` on the current `page_version`. It never searches the page globally for “Yes” or “No”. Failures include `STALE_PAGE_VERSION`, `FIELD_NOT_FOUND`, `FIELD_HIDDEN`, `FIELD_DISABLED`, `OPTION_NOT_FOUND`, `OPTION_DOES_NOT_BELONG_TO_FIELD`, `AMBIGUOUS_OPTION`, `UNSUPPORTED_FIELD_TYPE`, `UPDATE_FAILED`, `VERIFICATION_FAILED`, and `SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY`.

**Note on select (dropdown) fields:** The form snapshot omits option lists for dropdowns to reduce payload size. These fields include `options_total` (the number of available choices) but no `options` array. For these fields, ask the user to speak their answer, then call `set_form_answer` with only `answer` (no `option_id`). The extension matches the spoken text to the dropdown option automatically.

## Conversation sequence

1. Call `get_current_form` before claiming to know the page.
2. Explain the page using only the returned snapshot.
3. Ask one question at a time.
4. For select (dropdown) fields, ask the user to speak their answer freely (the snapshot has no options list). For radio/checkbox fields, read the listed options aloud.
5. Interpret the user’s answer, read it back, and wait for confirmation.
6. Only after confirmation, call `set_form_answer`. For radio/checkbox use the matching `option_id` from the snapshot. For select use only `answer` (no `option_id`).
7. Report success only when the tool returns verified success.
8. If `page_changed` is true, call `get_current_form` again.
9. If the user corrects an answer, discard the previous proposal.
10. Never navigate, submit, sign, or accept certification.
11. Never determine Medicaid eligibility or invent fields.
12. Offer private manual entry for highly sensitive information.
