-- AlterTable
ALTER TABLE "JudgeRun" ADD COLUMN     "shuffle_seed" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "judge_debias" BOOLEAN NOT NULL DEFAULT false;
