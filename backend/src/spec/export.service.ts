import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppError } from '../common/app-error';
import { dynamicImport } from '../common/dynamic-import';
import { PrismaService } from '../common/prisma.service';
import { GATED_CARD_TYPES } from '../contracts/card';
import { markdownToHtml, wrapDocument } from './markdown-html';
import { SpecService } from './spec.service';

export type ExportResult = {
  artifactId: string;
  format: 'MD' | 'PDF';
  filename: string;
  contentType: string;
  body: Buffer;
  checksum: string;
};

/** Bề mặt tối thiểu ta dùng của Puppeteer — nạp lười để app vẫn boot khi Chromium không có. */
type PdfPage = {
  setContent(html: string, opts: { waitUntil: string }): Promise<void>;
  pdf(opts: { format: string; printBackground: boolean }): Promise<Uint8Array>;
  close(): Promise<void>;
};
type PdfBrowser = {
  newPage(): Promise<PdfPage>;
  close(): Promise<void>;
};
type PuppeteerLauncher = {
  launch(opts: { headless: boolean; args: string[] }): Promise<PdfBrowser>;
};
type PuppeteerModule = PuppeteerLauncher & { default?: PuppeteerLauncher };

@Injectable()
export class ExportService implements OnModuleDestroy {
  private readonly logger = new Logger(ExportService.name);
  private browser: PdfBrowser | null = null;
  private browserPromise: Promise<PdfBrowser> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly spec: SpecService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  /**
   * Verifier gate — chỗ verifier thật sự **thay đổi hành vi** hệ thống, chứ không chỉ gắn nhãn
   * (ARCHITECTURE §6.6). Thẻ `EVIDENCE` **không** bị chặn: một evidence bị bác chính là thông tin
   * có ích, giữ lại trong spec.
   */
  async checkGate(specVersionId: string): Promise<{
    blocked: boolean;
    reason: 'NOT_VERIFIED' | 'UNSUPPORTED_CITATION' | null;
    offenders: {
      /** Id của **cặp** (khẳng định, nguồn) — đầu vào của 4 đường ra ở §6.6. */
      card_source_id: string;
      card_id: string;
      card_title: string;
      source_title: string;
    }[];
  }> {
    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      include: { project: { select: { verifier_gate: true } } },
    });
    if (!version.project.verifier_gate) {
      return { blocked: false, reason: null, offenders: [] };
    }

    const runs = await this.prisma.verifierRun.count({
      where: { spec_version_id: specVersionId },
    });
    if (runs === 0) {
      // **Fail-closed**: không nhãn ⇒ không xuất bản. Một spec chưa kiểm mà xuất ra được thì
      // gate chỉ là trang trí (C2 · F.8).
      return { blocked: true, reason: 'NOT_VERIFIED', offenders: [] };
    }

    const bad = await this.prisma.cardSource.findMany({
      where: {
        support_label: 'UNSUPPORTED',
        // Cặp đã được người dùng giữ lại kèm lý do thì không chặn nữa — người dùng vẫn là
        // người quyết định cuối cùng (ARCHITECTURE §6.6, nhánh "Other"). Dấu vết không mất:
        // lý do nằm ở `Decision.custom_text` **và** được in vào file xuất ra.
        override_reason: null,
        card: {
          spec_version_id: specVersionId,
          type: { in: [...GATED_CARD_TYPES] },
        },
      },
      include: {
        card: { select: { id: true, title: true } },
        source: { select: { title: true } },
      },
    });

    return {
      blocked: bad.length > 0,
      reason: bad.length > 0 ? 'UNSUPPORTED_CITATION' : null,
      offenders: bad.map((b) => ({
        card_source_id: b.id,
        card_id: b.card.id,
        card_title: b.card.title,
        source_title: b.source.title,
      })),
    };
  }

  async export(
    specVersionId: string,
    format: 'MD' | 'PDF',
  ): Promise<ExportResult> {
    const gate = await this.checkGate(specVersionId);
    if (gate.blocked) {
      if (gate.reason === 'NOT_VERIFIED') {
        throw AppError.conflict(
          'EXPORT_BLOCKED_NOT_VERIFIED',
          'Evidence verification has not run on this version, so it cannot be published yet. Run it first.',
        );
      }
      throw AppError.conflict(
        'EXPORT_BLOCKED_UNSUPPORTED_CITATION',
        `${gate.offenders.length} citations are still unsupported by their sources. Resolve them before publishing.`,
        gate.offenders,
      );
    }

    const version = await this.prisma.specVersion.findUniqueOrThrow({
      where: { id: specVersionId },
      include: { project: { select: { title: true } } },
    });
    const markdown = await this.spec.buildMarkdown(specVersionId);
    const safeTitle = version.project.title
      .replace(/[^\w\d-]+/g, '_')
      .slice(0, 60);

    let body: Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'MD') {
      // Markdown dựng bằng chuỗi thuần, **không đụng Chromium** — hai đường xuất bản độc lập
      // chính là chiến lược suy giảm mềm (S6 · F.8).
      body = Buffer.from(markdown, 'utf8');
      contentType = 'text/markdown; charset=utf-8';
      filename = `${safeTitle}_v${version.version_no}.md`;
    } else {
      body = await this.renderPdf(version.project.title, markdown);
      contentType = 'application/pdf';
      filename = `${safeTitle}_v${version.version_no}.pdf`;
    }

    const checksum = createHash('sha256').update(body).digest('hex');
    // **Không lưu nội dung file** — file sinh lại được từ version bất biến; DB chỉ giữ
    // bằng chứng "đã xuất bản, và nội dung lúc đó băm ra thế này" (S6 · F.5).
    const artifact = await this.prisma.exportArtifact.create({
      data: {
        spec_version_id: specVersionId,
        format,
        checksum,
        byte_size: body.byteLength,
      },
      select: { id: true },
    });

    await this.prisma.specVersion.update({
      where: { id: specVersionId },
      data: { status: 'FINAL' },
    });
    await this.prisma.project.update({
      where: { id: version.project_id },
      data: { status: 'FINAL' },
    });

    return {
      artifactId: artifact.id,
      format,
      filename,
      contentType,
      body,
      checksum,
    };
  }

  private async getBrowser(): Promise<PdfBrowser> {
    if (this.browser) return this.browser;
    if (!this.browserPromise) {
      this.browserPromise = (async () => {
        const puppeteer = await dynamicImport<PuppeteerModule>('puppeteer');
        const launcher: PuppeteerLauncher = puppeteer.default ?? puppeteer;
        // Khởi tạo **một** Chromium và dùng lại — lần xuất đầu tiên không mất 3–5 giây khởi động.
        return launcher.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
      })();
    }
    try {
      this.browser = await this.browserPromise;
      return this.browser;
    } catch (err) {
      this.browserPromise = null;
      throw err;
    }
  }

  private async renderPdf(title: string, markdown: string): Promise<Buffer> {
    let browser: PdfBrowser;
    try {
      browser = await this.getBrowser();
    } catch (err) {
      this.logger.error(
        `Could not launch Chromium: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw AppError.unavailable(
        'PDF_ENGINE_UNAVAILABLE',
        'The PDF renderer could not start on the server. The Markdown export still works normally.',
      );
    }

    const page = await browser.newPage();
    try {
      await page.setContent(wrapDocument(title, markdownToHtml(markdown)), {
        waitUntil: 'load',
      });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }
}
