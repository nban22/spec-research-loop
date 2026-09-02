-- CreateTable
CREATE TABLE "JudgeAttempt" (
    "id" TEXT NOT NULL,
    "judge_run_id" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "JudgeRunStatus" NOT NULL DEFAULT 'OK',
    "error_code" TEXT,
    "raw_output" JSONB NOT NULL,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JudgeAttempt_judge_run_id_idx" ON "JudgeAttempt"("judge_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAttempt_judge_run_id_attempt_no_key" ON "JudgeAttempt"("judge_run_id", "attempt_no");
