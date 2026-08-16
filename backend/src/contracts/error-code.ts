import { z } from 'zod';

/**
 * Mã lỗi trả cho FE. FE map mã → thông báo tiếng Việt ở `lib/error-code.ts`;
 * FE **không** được parse `message` để phân nhánh logic (STACK §3.1 luật 3).
 */
export const errorCodeSchema = z.enum([
  // chung
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'INTERNAL_ERROR',

  // auth
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_USED',
  'UNAUTHENTICATED',
  'REFRESH_TOKEN_INVALID',

  // nguồn
  'SOURCE_PROVIDER_UNAVAILABLE',
  'NO_SOURCES_YET',

  // llm
  'LLM_UNAVAILABLE',
  'LLM_INVALID_JSON',

  // judge
  'JUDGE_ROUND_EXISTS',
  'JUDGE_ROUND_LIMIT',
  'JUDGE_QUORUM_NOT_MET',

  // quyết định / version
  'DECISION_ALREADY_APPLIED',
  'VERSION_CONFLICT',
  'OTHER_REASON_REQUIRED',
  'DECISION_OPTION_UNKNOWN',

  // xuất bản
  'EXPORT_BLOCKED_UNSUPPORTED_CITATION',
  'EXPORT_BLOCKED_NOT_VERIFIED',
  'PDF_ENGINE_UNAVAILABLE',

  // luồng bước
  'STEP_PRECONDITION_FAILED',
  'JOB_ALREADY_RUNNING',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;
