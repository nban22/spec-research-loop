-- CreateTable
CREATE TABLE "JudgeCalibration" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "judge_key" "JudgeKey" NOT NULL,
    "rounds" INTEGER NOT NULL,
    "n" INTEGER NOT NULL,
    "mean_rank" DOUBLE PRECISION NOT NULL,
    "sd_rank" DOUBLE PRECISION NOT NULL,
    "usable" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JudgeCalibration_spec_version_id_idx" ON "JudgeCalibration"("spec_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeCalibration_spec_version_id_round_judge_key_key" ON "JudgeCalibration"("spec_version_id", "round", "judge_key");
