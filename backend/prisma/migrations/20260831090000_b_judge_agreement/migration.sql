-- CreateTable
CREATE TABLE "JudgeAgreement" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "raters" INTEGER NOT NULL,
    "items" INTEGER NOT NULL,
    "kappa" DOUBLE PRECISION,
    "reason" TEXT,
    "unanimous" BOOLEAN NOT NULL DEFAULT false,
    "degenerate" TEXT,
    "coverage" DOUBLE PRECISION,
    "matrix" JSONB NOT NULL,
    "patterns" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAgreement_spec_version_id_round_key" ON "JudgeAgreement"("spec_version_id", "round");

-- CreateIndex
CREATE INDEX "JudgeAgreement_spec_version_id_idx" ON "JudgeAgreement"("spec_version_id");
