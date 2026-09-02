/**
 * Backend error codes → English messages. The FE **never** parses `message` to branch
 * logic (STACK §3.1 rule 3), and **never** prints the raw error code on screen
 * (DESIGN_SYSTEM §5.5 rule 6).
 *
 * Waiting-state copy lives here too, for the same reason as the enum maps: one place to
 * edit, not ten (§7.3).
 */

export const ERROR_MESSAGE: Record<string, string> = {
  VALIDATION_FAILED: 'The information you entered is not valid. Please review the fields above.',
  NOT_FOUND: 'Sorry, we could not find the content you requested.',
  INTERNAL_ERROR:
    'The server ran into a problem. We are sorry — please try again in a few minutes.',

  INVALID_CREDENTIALS: 'That email or password is not correct. Please check and try again.',
  EMAIL_ALREADY_USED:
    'This email is already registered. Please sign in, or use a different email.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  REFRESH_TOKEN_INVALID: 'Your session has expired. Please sign in again.',

  SOURCE_PROVIDER_UNAVAILABLE:
    'Sorry, we could not reach Semantic Scholar or OpenAlex, so this step has been stopped. The system never invents papers, so that every citation you receive is real.',
  NO_SOURCES_YET: 'No sources yet. Please run the source search first.',

  LLM_UNAVAILABLE: 'We could not reach the model. Please run this step again.',
  LLM_INVALID_JSON:
    'The model returned data in an unexpected shape. Please run this step again.',

  /* Cố ý nói khác `LLM_INVALID_JSON`: ở đây model không sai, nó chỉ hết chỗ để viết. Bảo người
     dùng "chạy lại" là bảo họ lặp lại đúng thất bại — hướng ra là bớt nguồn. */
  LLM_OUTPUT_TRUNCATED:
    'This step produced more findings than the model had room to write, even after being asked to report only the worst ones. Try again with fewer sources, or tell the team to raise the limit for this step.',

  JUDGE_ROUND_EXISTS:
    'This judge round has already run on the current version. Please create a new version before running again.',
  JUDGE_ROUND_LIMIT: 'This project has used all 3 judge rounds allowed.',
  JUDGE_QUORUM_NOT_MET:
    'Too few judges completed, so the agreement score could not be computed. Please run again.',

  DECISION_ALREADY_APPLIED: 'This decision has already been applied.',
  VERSION_CONFLICT:
    'The spec changed somewhere else. Please reload the page and choose again.',
  OTHER_REASON_REQUIRED: 'When you choose “Other”, please enter a reason.',
  DECISION_OPTION_UNKNOWN:
    'This option is no longer on the list. Please reload the page and choose again.',

  EXPORT_BLOCKED_UNSUPPORTED_CITATION:
    'Some citations are still unsupported by their sources, so publishing is on hold.',
  EXPORT_BLOCKED_NOT_VERIFIED:
    'This version has not been through evidence verification, so publishing is on hold.',
  PDF_ENGINE_UNAVAILABLE:
    'The server could not build the PDF — sorry about that. The Markdown file still downloads normally.',

  STEP_PRECONDITION_FAILED: 'Please complete the previous step first.',
  JOB_ALREADY_RUNNING:
    'A job of the same kind is already running. Please wait for it to finish.',
};

export function messageOf(code: string | undefined, fallback?: string): string {
  if (code && ERROR_MESSAGE[code]) return ERROR_MESSAGE[code];
  return fallback ?? 'Sorry, something went wrong. Please try again.';
}

/**
 * A sentence describing "what the system is doing" for each job kind. Always spelled out in
 * words (§5.5 rule 2).
 */
export const JOB_LABEL: Record<string, string> = {
  ANALYZE: 'Analysing and breaking down your idea…',
  SEARCH: 'Searching Semantic Scholar and OpenAlex for sources…',
  RELATED_WORK: 'Reading abstracts and building the related-work table…',
  GENERATE: 'Generating the spec content…',
  JUDGE: 'Running the 5 independent judges…',
  VERIFY: 'Checking every (claim, source) pair…',
  EXPORT: 'Building the export files…',
};

/** Past roughly 60 seconds, add a line reassuring that the job is still alive (§5.5 rule 3). */
export const LONG_WAIT_HINT =
  'This is still running on the server. You can leave the page and come back — progress is not lost.';

export const SSE_LOST_HINT = 'Lost the live connection, retrying…';
