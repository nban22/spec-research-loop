import { PrismaService } from '../../src/common/prisma.service';

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  const tables = [
    'ExportArtifact',
    'VerifierRun',
    'Issue',
    'IssueGroup',
    'JudgeRun',
    'Decision',
    'RelatedWorkRow',
    'CardSource',
    'Card',
    'ExperimentPlan',
    'ResourceEstimate',
    'Source',
    'JobRun',
    'LlmCall',
    'EvalScore',
    'EvalRun',
    'SpecVersion',
    'Project',
    'RefreshToken',
    'User',
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    } catch {
      // Table might not exist yet or empty; ignore
    }
  }
}
