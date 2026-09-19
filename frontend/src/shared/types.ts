/** Serializable form field option exposed to the agent (no selectors). */
export interface FormOptionSnapshot {
  option_id: string;
  label: string;
  selected?: boolean;
}

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "email"
  | "tel"
  | "radio"
  | "checkbox"
  | "select";

export type FormFieldValue = string | boolean | string[] | null;

/** Serializable form field exposed to the agent (no selectors / DOM). */
export interface FormFieldSnapshot {
  field_id: string;
  question: string;
  help_text?: string;
  type: FormFieldType;
  required: boolean;
  current_value: FormFieldValue;
  options?: FormOptionSnapshot[];
}

export interface FormWarning {
  reason: "SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY";
  message: string;
  field_label: string;
}

export interface GetCurrentFormSuccess {
  success: true;
  page_version: string;
  page_title: string;
  instructions?: string[];
  fields: FormFieldSnapshot[];
  warnings?: FormWarning[];
}

export interface ToolFailure {
  success: false;
  error: ToolErrorCode;
  message: string;
}

export type GetCurrentFormResult = GetCurrentFormSuccess | ToolFailure;

export interface SetFormAnswerParams {
  field_id: string;
  answer: string;
  option_id?: string;
  page_version: string;
  /** Optional idempotency key to ignore duplicate tool calls. */
  operation_id?: string;
}

export interface SetFormAnswerSuccess {
  success: true;
  field_id: string;
  verified_value: string;
  page_changed: boolean;
}

export type SetFormAnswerResult = SetFormAnswerSuccess | ToolFailure;

export type ToolErrorCode =
  | "NO_ACTIVE_TAB"
  | "UNSUPPORTED_PAGE"
  | "CONTENT_SCRIPT_UNAVAILABLE"
  | "NO_SUPPORTED_FORM"
  | "NO_FORM_FIELDS"
  | "PAGE_SCAN_FAILED"
  | "STALE_PAGE_VERSION"
  | "FIELD_NOT_FOUND"
  | "FIELD_HIDDEN"
  | "FIELD_DISABLED"
  | "OPTION_NOT_FOUND"
  | "OPTION_DOES_NOT_BELONG_TO_FIELD"
  | "AMBIGUOUS_OPTION"
  | "UNSUPPORTED_FIELD_TYPE"
  | "UPDATE_FAILED"
  | "VERIFICATION_FAILED"
  | "SENSITIVE_FIELD_REQUIRES_MANUAL_ENTRY"
  | "MISSING_AGENT_ID"
  | "MISSING_CONFIGURATION"
  | "BACKEND_UNAVAILABLE"
  | "MIC_PERMISSION_DENIED"
  | "CONNECTION_FAILED"
  | "INVALID_REQUEST";

export const MessageType = {
  GET_CURRENT_FORM: "GET_CURRENT_FORM",
  SET_FORM_ANSWER: "SET_FORM_ANSWER",
  PING: "PING",
} as const;

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType];

export interface GetCurrentFormMessage {
  type: typeof MessageType.GET_CURRENT_FORM;
}

export interface SetFormAnswerMessage {
  type: typeof MessageType.SET_FORM_ANSWER;
  payload: SetFormAnswerParams;
}

export interface PingMessage {
  type: typeof MessageType.PING;
}

export type ExtensionMessage =
  | GetCurrentFormMessage
  | SetFormAnswerMessage
  | PingMessage;

export interface PingResponse {
  ok: true;
}

export type ContentScriptResponse =
  | GetCurrentFormResult
  | SetFormAnswerResult
  | PingResponse
  | ToolFailure;

export const WIDGET_HOST_ID = "eldermed-assistant-host";
export const WIDGET_MESSAGE_SOURCE = "eldermed-widget";
export const HOST_MESSAGE_SOURCE = "eldermed-host";

export type WidgetToHostMessage =
  | {
      source: typeof WIDGET_MESSAGE_SOURCE;
      type: "resize";
      width: number;
      height: number;
      expanded: boolean;
    }
  | {
      source: typeof WIDGET_MESSAGE_SOURCE;
      type: "drag";
      dx: number;
      dy: number;
    }
  | {
      source: typeof WIDGET_MESSAGE_SOURCE;
      type: "tool_request";
      requestId: string;
      tool: "get_current_form" | "set_form_answer";
      payload?: SetFormAnswerParams;
    };

export type HostToWidgetMessage = {
  source: typeof HOST_MESSAGE_SOURCE;
  type: "tool_response";
  requestId: string;
  result: GetCurrentFormResult | SetFormAnswerResult;
};

export interface SessionCredentials {
  conversation_token: string;
  signed_url?: string;
  expires_in_seconds?: number;
}
