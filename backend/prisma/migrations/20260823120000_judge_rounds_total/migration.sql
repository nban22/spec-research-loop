-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "judge_rounds_total" INTEGER NOT NULL DEFAULT 0;

-- Dự án đang chạy: coi số vòng đã dùng bằng số vòng của version hiện tại, đó là
-- thông tin duy nhất còn lại. Ước lượng thấp hơn thực tế, và chấp nhận được vì
-- nó chỉ nới giới hạn cho dữ liệu cũ, không làm sai dữ liệu mới.
UPDATE "Project" SET "judge_rounds_total" = "judge_round" WHERE "judge_round" > 0;
