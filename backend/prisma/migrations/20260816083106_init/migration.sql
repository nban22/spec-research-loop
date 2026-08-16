-- CreateEnum
CREATE TYPE "ProjectStep" AS ENUM ('S1', 'S2', 'S3', 'S4', 'S5');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'FINAL');

-- CreateEnum
CREATE TYPE "Arm" AS ENUM ('B1', 'B2', 'SYS', 'SYS_NO_VERIFY');

-- CreateEnum
CREATE TYPE "SpecVersionStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'ACCEPTED', 'FINAL');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('PROBLEM', 'RESEARCH_QUESTION', 'GAP', 'CONTRIBUTION', 'CLAIM', 'EVIDENCE', 'CONSTRAINT', 'OPEN_QUESTION');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('CONFIRMED', 'PROPOSED', 'MISSING', 'AMBIGUOUS', 'UNSUPPORTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "CardOrigin" AS ENUM ('GENERATOR', 'USER', 'JUDGE_FIX');

-- CreateEnum
CREATE TYPE "SourceProvider" AS ENUM ('SEMANTIC_SCHOLAR', 'OPENALEX', 'ARXIV', 'CROSSREF');

-- CreateEnum
CREATE TYPE "SupportLabel" AS ENUM ('SUPPORTED', 'WEAK', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "Entailment" AS ENUM ('ENTAILS', 'PARTIAL', 'NOT_ENTAILED', 'CONTRADICTS');

-- CreateEnum
CREATE TYPE "JudgeKey" AS ENUM ('J1', 'J2', 'J3', 'J4', 'J5');

-- CreateEnum
CREATE TYPE "JudgeRunStatus" AS ENUM ('OK', 'FAILED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR');

-- CreateEnum
CREATE TYPE "IssueGroupStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DecisionActor" AS ENUM ('USER', 'SCRIPTED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('ANALYZE', 'SEARCH', 'RELATED_WORK', 'GENERATE', 'JUDGE', 'VERIFY', 'EXPORT');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "LlmPurpose" AS ENUM ('PARAPHRASE', 'DECOMPOSE', 'RELATED_WORK', 'GAP', 'CLAIM', 'EXPERIMENT', 'OPTIONS', 'JUDGE', 'ENTAILMENT', 'AUDITOR', 'B1_SINGLE_SHOT');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('MD', 'PDF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw_idea" TEXT NOT NULL,
    "domain" TEXT,
    "step" "ProjectStep" NOT NULL DEFAULT 'S1',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "current_spec_version_id" TEXT,
    "arm" "Arm" NOT NULL DEFAULT 'SYS',
    "verifier_gate" BOOLEAN NOT NULL DEFAULT true,
    "judge_round" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecVersion" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version_no" INTEGER NOT NULL,
    "parent_version_id" TEXT,
    "created_by_decision_id" TEXT,
    "status" "SpecVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "type" "CardType" NOT NULL,
    "status" "CardStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "parent_card_id" TEXT,
    "origin" "CardOrigin" NOT NULL DEFAULT 'GENERATOR',
    "conflict_with_card_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "retrieved_from" "SourceProvider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" JSONB NOT NULL,
    "year" INTEGER,
    "venue" TEXT,
    "doi" TEXT,
    "url" TEXT,
    "abstract" TEXT,
    "citation_count" INTEGER,
    "raw" JSONB NOT NULL,
    "doi_verified" BOOLEAN,
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardSource" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "support_label" "SupportLabel" NOT NULL DEFAULT 'WEAK',
    "similarity" DOUBLE PRECISION,
    "entailment" "Entailment",
    "confidence" DOUBLE PRECISION,
    "evidence_sentence" TEXT,
    "flags" JSONB,
    "verifier_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatedWorkRow" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "what_done" TEXT NOT NULL,
    "feedback_type" TEXT NOT NULL,
    "what_missing" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatedWorkRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudgeRun" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "judge_key" "JudgeKey" NOT NULL,
    "round" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "input_digest" TEXT NOT NULL,
    "raw_output" JSONB NOT NULL,
    "parse_attempts" INTEGER NOT NULL DEFAULT 1,
    "status" "JudgeRunStatus" NOT NULL DEFAULT 'OK',
    "error_code" TEXT,
    "job_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "judge_run_id" TEXT NOT NULL,
    "issue_group_id" TEXT,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "target_card_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueGroup" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "canonical_title" TEXT NOT NULL,
    "max_severity" "Severity" NOT NULL,
    "judge_keys" JSONB NOT NULL,
    "agreement_count" INTEGER NOT NULL,
    "judges_completed" INTEGER NOT NULL,
    "disagreement_score" DOUBLE PRECISION NOT NULL,
    "status" "IssueGroupStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "step" "ProjectStep" NOT NULL,
    "issue_group_id" TEXT,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "chosen_key" TEXT NOT NULL,
    "custom_text" TEXT,
    "actor" "DecisionActor" NOT NULL DEFAULT 'USER',
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "resulting_spec_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentPlan" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceEstimate" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "vram_gb" DOUBLE PRECISION NOT NULL,
    "hours_min" DOUBLE PRECISION NOT NULL,
    "hours_max" DOUBLE PRECISION NOT NULL,
    "tokens_est" DOUBLE PRECISION NOT NULL,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "fits_rtx3090" BOOLEAN NOT NULL,
    "downscale_suggestion" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportArtifact" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "checksum" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifierRun" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "units_total" INTEGER NOT NULL,
    "units_l4" INTEGER NOT NULL,
    "label_counts" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifierRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "spec_version_id" TEXT,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" JSONB NOT NULL DEFAULT '{"done":0,"total":1}',
    "message" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" TEXT NOT NULL,
    "purpose" "LlmPurpose" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "prompt_hash" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_hit_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_miss_tokens" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error_code" TEXT,
    "project_id" TEXT,
    "spec_version_id" TEXT,
    "judge_run_id" TEXT,
    "eval_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "arm" "Arm" NOT NULL,
    "idea_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "wall_ms" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalMetric" (
    "id" TEXT NOT NULL,
    "eval_run_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditorScore" (
    "id" TEXT NOT NULL,
    "eval_run_id" TEXT NOT NULL,
    "blind_label" TEXT NOT NULL,
    "severity_counts" JSONB NOT NULL,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditorScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanCheck" (
    "id" TEXT NOT NULL,
    "card_source_id" TEXT NOT NULL,
    "human_label" "SupportLabel" NOT NULL,
    "auto_label" "SupportLabel" NOT NULL,
    "match" BOOLEAN NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "RefreshToken_user_id_idx" ON "RefreshToken"("user_id");

-- CreateIndex
CREATE INDEX "RefreshToken_token_hash_idx" ON "RefreshToken"("token_hash");

-- CreateIndex
CREATE INDEX "Project_user_id_idx" ON "Project"("user_id");

-- CreateIndex
CREATE INDEX "SpecVersion_project_id_idx" ON "SpecVersion"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "SpecVersion_project_id_version_no_key" ON "SpecVersion"("project_id", "version_no");

-- CreateIndex
CREATE INDEX "Card_spec_version_id_idx" ON "Card"("spec_version_id");

-- CreateIndex
CREATE INDEX "Card_spec_version_id_type_idx" ON "Card"("spec_version_id", "type");

-- CreateIndex
CREATE INDEX "Source_project_id_idx" ON "Source"("project_id");

-- CreateIndex
CREATE INDEX "Source_doi_idx" ON "Source"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "Source_project_id_retrieved_from_external_id_key" ON "Source"("project_id", "retrieved_from", "external_id");

-- CreateIndex
CREATE INDEX "CardSource_card_id_idx" ON "CardSource"("card_id");

-- CreateIndex
CREATE INDEX "CardSource_source_id_idx" ON "CardSource"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "CardSource_card_id_source_id_key" ON "CardSource"("card_id", "source_id");

-- CreateIndex
CREATE INDEX "RelatedWorkRow_spec_version_id_idx" ON "RelatedWorkRow"("spec_version_id");

-- CreateIndex
CREATE INDEX "JudgeRun_spec_version_id_idx" ON "JudgeRun"("spec_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeRun_spec_version_id_judge_key_round_key" ON "JudgeRun"("spec_version_id", "judge_key", "round");

-- CreateIndex
CREATE INDEX "Issue_judge_run_id_idx" ON "Issue"("judge_run_id");

-- CreateIndex
CREATE INDEX "Issue_issue_group_id_idx" ON "Issue"("issue_group_id");

-- CreateIndex
CREATE INDEX "IssueGroup_spec_version_id_idx" ON "IssueGroup"("spec_version_id");

-- CreateIndex
CREATE INDEX "Decision_project_id_idx" ON "Decision"("project_id");

-- CreateIndex
CREATE INDEX "Decision_issue_group_id_idx" ON "Decision"("issue_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentPlan_spec_version_id_key" ON "ExperimentPlan"("spec_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceEstimate_spec_version_id_key" ON "ResourceEstimate"("spec_version_id");

-- CreateIndex
CREATE INDEX "ExportArtifact_spec_version_id_idx" ON "ExportArtifact"("spec_version_id");

-- CreateIndex
CREATE INDEX "VerifierRun_spec_version_id_idx" ON "VerifierRun"("spec_version_id");

-- CreateIndex
CREATE INDEX "JobRun_project_id_idx" ON "JobRun"("project_id");

-- CreateIndex
CREATE INDEX "JobRun_spec_version_id_idx" ON "JobRun"("spec_version_id");

-- CreateIndex
CREATE INDEX "JobEvent_job_id_idx" ON "JobEvent"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "JobEvent_job_id_seq_key" ON "JobEvent"("job_id", "seq");

-- CreateIndex
CREATE INDEX "LlmCall_project_id_idx" ON "LlmCall"("project_id");

-- CreateIndex
CREATE INDEX "LlmCall_eval_run_id_idx" ON "LlmCall"("eval_run_id");

-- CreateIndex
CREATE INDEX "LlmCall_purpose_idx" ON "LlmCall"("purpose");

-- CreateIndex
CREATE INDEX "EvalRun_batch_id_idx" ON "EvalRun"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "EvalRun_batch_id_arm_idea_id_key" ON "EvalRun"("batch_id", "arm", "idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "EvalMetric_eval_run_id_key_key" ON "EvalMetric"("eval_run_id", "key");

-- CreateIndex
CREATE INDEX "AuditorScore_eval_run_id_idx" ON "AuditorScore"("eval_run_id");

-- CreateIndex
CREATE INDEX "HumanCheck_card_source_id_idx" ON "HumanCheck"("card_source_id");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecVersion" ADD CONSTRAINT "SpecVersion_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecVersion" ADD CONSTRAINT "SpecVersion_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "SpecVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecVersion" ADD CONSTRAINT "SpecVersion_created_by_decision_id_fkey" FOREIGN KEY ("created_by_decision_id") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_parent_card_id_fkey" FOREIGN KEY ("parent_card_id") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSource" ADD CONSTRAINT "CardSource_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSource" ADD CONSTRAINT "CardSource_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardSource" ADD CONSTRAINT "CardSource_verifier_run_id_fkey" FOREIGN KEY ("verifier_run_id") REFERENCES "VerifierRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedWorkRow" ADD CONSTRAINT "RelatedWorkRow_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedWorkRow" ADD CONSTRAINT "RelatedWorkRow_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeRun" ADD CONSTRAINT "JudgeRun_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeRun" ADD CONSTRAINT "JudgeRun_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_judge_run_id_fkey" FOREIGN KEY ("judge_run_id") REFERENCES "JudgeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_issue_group_id_fkey" FOREIGN KEY ("issue_group_id") REFERENCES "IssueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_target_card_id_fkey" FOREIGN KEY ("target_card_id") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueGroup" ADD CONSTRAINT "IssueGroup_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_issue_group_id_fkey" FOREIGN KEY ("issue_group_id") REFERENCES "IssueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_resulting_spec_version_id_fkey" FOREIGN KEY ("resulting_spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentPlan" ADD CONSTRAINT "ExperimentPlan_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceEstimate" ADD CONSTRAINT "ResourceEstimate_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportArtifact" ADD CONSTRAINT "ExportArtifact_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifierRun" ADD CONSTRAINT "VerifierRun_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_spec_version_id_fkey" FOREIGN KEY ("spec_version_id") REFERENCES "SpecVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_judge_run_id_fkey" FOREIGN KEY ("judge_run_id") REFERENCES "JudgeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalMetric" ADD CONSTRAINT "EvalMetric_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditorScore" ADD CONSTRAINT "AuditorScore_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanCheck" ADD CONSTRAINT "HumanCheck_card_source_id_fkey" FOREIGN KEY ("card_source_id") REFERENCES "CardSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
