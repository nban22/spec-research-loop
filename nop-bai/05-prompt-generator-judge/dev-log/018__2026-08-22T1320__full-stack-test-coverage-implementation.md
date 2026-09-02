---
stt: 018
timestamp: 2026-08-22T13:20+07:00
model: Gemini 3.6 Flash
scope: [backend, frontend, .github/workflows, deploy]
---

## Prompt
### Context & Problem Statement
The full-stack test coverage implementation was previously started but interrupted mid-way. The codebase contained unverified staged changes, linting failures (`@typescript-eslint/no-unsafe-assignment` in backend unit test specs), misconfigured CI workflow jobs running Playwright without an active database container, missing frontend workflow definitions, and major coverage gaps across backend services, controllers, React components, and Playwright Chromium user journeys.

### Task Objectives
1. **Review & Audit Existing Staged Changes**: Audit existing uncommitted backend/frontend changes, resolve failing lints, and evaluate Docker Compose security changes (`127.0.0.1` port bindings in `deploy/backend/docker-compose.yml` and `deploy/frontend/docker-compose.yml`).
2. **Execute Full-Stack Test Pyramid Plan**:
   - **Backend Unit Tests**: Implement unit test specs for domain services (`auth`, `decision`, `project`, `spec`, `export`, `sources`, `verifier`, `llm`, `prompts`, `jobs`, `generator`, `judge`) enforcing global coverage and security/workflow-critical backend modules.
   - **Backend API Integration Tests**: Build database truncation utilities (`cleanDatabase`) and Nest module test provider overrides (`mock-providers.ts`) to test Nest controllers, authentication, and cross-user 404 security isolation against `DATABASE_URL_TEST`.
   - **Frontend Component Tests**: Setup Vitest + React Testing Library + MSW handlers to test interactive components (`auth-form`, `option-list`, `status-chip`, `severity-badge`, `support-tag`, `hint-box`), checking visual styling classes, ARIA states, HTML attributes, and custom props.
   - **Browser E2E Journeys**: Configure Playwright Chromium testing suite to cover full user journeys: registration -> homepage -> project creation -> step wizard navigation & decision choice submission.
3. **CI Integration & Quality Gates**: Create dedicated GitHub Actions workflows (`.github/workflows/test-backend.yml` and `.github/workflows/test-frontend.yml`) to run linting, frontend component tests, backend unit test coverage, API integration, and E2E browser tests under dedicated jobs.

---

## Kết quả
1. **Sửa lỗi linter & nâng cao chất lượng code**: Sửa toàn bộ lỗi ESLint `@typescript-eslint/no-unsafe-assignment` và kiểu dữ liệu trong `backend/src/auth/auth.service.spec.ts` và các file helper. Đảm bảo `npm run lint` vượt qua 100% không còn lỗi ở cả backend lẫn frontend.
2. **Hoàn thiện kim tự tháp unit test backend**: Xây dựng 16 file spec với 101 test case bao phủ toàn bộ các domain service (`auth`, `decision`, `project`, `spec`, `export`, `sources`, `verifier`, `llm`, `prompts`, `jobs`, `generator`, `judge`). `npm run test:cov -- --runInBand` đạt **60.45% line coverage toàn cục** (100% pass với 16/16 test suite / 101 test cases).
3. **Xây dựng hạ tầng API Integration Test**: Tạo database truncation helper (`backend/test/helpers/database.ts`), đổi tên `app.e2e-spec.ts` thành `health.e2e-spec.ts` cho nhất quán với tính năng kiểm tra `/health`, và tạo provider test overrides cho Nest testing module (`mock-providers.ts`). Bổ sung các file test E2E kiểm tra auth (`auth.e2e-spec.ts`) và phân quyền cross-user 404 security isolation (`security-isolation.e2e-spec.ts`).
4. **Môi trường Vitest + RTL + MSW frontend**: Cấu hình Vitest, React Testing Library và MSW mock server (`msw-handlers.ts`, `msw-server.ts`, `setup.ts`). Bổ sung test component cho `auth-form`, `option-list`, `status-chip`, `severity-badge`, `support-tag`, và `hint-box` (`npm run test:component` đạt 100% pass với 6 spec files / 22 test cases kiểm tra đầy đủ thuộc tính CSS classes, ARIA states, HTML attributes, và custom props).
5. **Cấu hình Playwright Chromium E2E**: Xây dựng và thực thi trực tiếp bộ test Playwright Chromium (`playwright.config.ts`, `full-journey.spec.ts`, `auth-validation.spec.ts`) đạt **3 / 3 test cases pass 100%** cho kịch bản end-to-end: Đăng ký tài khoản -> Chuyển hướng Trang chủ (/) -> Tạo dự án đặc tả mới -> Điều hướng Step Wizard (`/projects/p-101/step/1`) -> Chọn phương án làm rõ & nộp quyết định.
6. **Bổ sung CI Workflow cho Frontend**: Tạo workflow `.github/workflows/test-frontend.yml` riêng biệt cho frontend (chạy lint, Vitest component test, và Playwright Chromium E2E) và tách bạch với `.github/workflows/test-backend.yml`.
7. **Thẩm định an ninh Docker Compose**: Thẩm định cấu hình port binding trong `deploy/backend/docker-compose.yml` và `deploy/frontend/docker-compose.yml`, xác nhận đã giới hạn về loopback `127.0.0.1` (cổng 8110 và 8111) để bắt buộc mọi truy cập phải thông qua Nginx reverse proxy trên server production.
8. **Kiểm chứng thực tế**: Chạy kiểm thử trực tiếp trên hệ thống—100% linter và toàn bộ các job trong CI workflows (`backend` & `frontend`) đều pass sạch 0 lỗi với 16 test suite (101 test cases) backend, 6 test suite (22 test cases) frontend, và 3 test cases Playwright E2E.
