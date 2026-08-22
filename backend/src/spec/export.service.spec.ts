import { ExportService } from './export.service';

describe('ExportService', () => {
  const prisma = {
    specVersion: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    verifierRun: { count: jest.fn() },
    cardSource: { findMany: jest.fn() },
    exportArtifact: { create: jest.fn() },
    project: { update: jest.fn() },
  };

  const spec = { buildMarkdown: jest.fn() };
  const service = new ExportService(prisma as never, spec as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkGate passes when project verifier_gate is false', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project: { verifier_gate: false },
    });

    const result = await service.checkGate('v-1');
    expect(result.blocked).toBe(false);
  });

  it('checkGate blocks with NOT_VERIFIED when zero verifier runs exist', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project: { verifier_gate: true },
    });
    prisma.verifierRun.count.mockResolvedValue(0);

    const result = await service.checkGate('v-1');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('NOT_VERIFIED');
  });

  it('checkGate blocks with UNSUPPORTED_CITATION when unsupported card sources exist', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project: { verifier_gate: true },
    });
    prisma.verifierRun.count.mockResolvedValue(1);
    prisma.cardSource.findMany.mockResolvedValue([
      {
        card: { id: 'c-1', title: 'Claim Title' },
        source: { title: 'Source Title' },
      },
    ]);

    const result = await service.checkGate('v-1');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('UNSUPPORTED_CITATION');
    expect(result.offenders.length).toBe(1);
  });

  it('export throws GATE_BLOCKED when verifier gate fails', async () => {
    prisma.specVersion.findUniqueOrThrow.mockResolvedValue({
      id: 'v-1',
      project: { verifier_gate: true },
    });
    prisma.verifierRun.count.mockResolvedValue(0);

    await expect(service.export('v-1', 'MD')).rejects.toMatchObject({
      code: 'EXPORT_BLOCKED_NOT_VERIFIED',
    });
  });

  it('export MD creates export artifact and sets status to FINAL when gate passes', async () => {
    prisma.specVersion.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'v-1',
        project: { verifier_gate: false },
      })
      .mockResolvedValueOnce({
        id: 'v-1',
        version_no: 1,
        project_id: 'p-1',
        project: { title: 'Test Project' },
      });

    spec.buildMarkdown.mockResolvedValue('# Test Spec Markdown');
    prisma.exportArtifact.create.mockResolvedValue({ id: 'art-1' });

    const result = await service.export('v-1', 'MD');
    expect(result.artifactId).toBe('art-1');
    expect(result.format).toBe('MD');
    expect(result.filename).toBe('Test_Project_v1.md');
    expect(prisma.specVersion.update).toHaveBeenCalledWith({
      where: { id: 'v-1' },
      data: { status: 'FINAL' },
    });
  });
});
