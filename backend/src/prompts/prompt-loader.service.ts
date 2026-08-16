import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type LoadedPrompt = {
  id: string;
  /** sha256 của nguyên văn file — bằng chứng "prompt nộp = prompt chạy" (deliverable #5). */
  hash: string;
  version: string;
  model: string;
  /** Phần dùng chung, đặt ở ĐẦU để 5 judge ăn cache prefix của DeepSeek (STACK §2.5). */
  system: string;
  /** Phần riêng của từng lời gọi, đặt phía SAU. */
  user: string;
};

/**
 * Đọc `prompts/*.md`. Đây là chỗ duy nhất trong `src/` biết tới nội dung prompt —
 * mọi chuỗi hướng dẫn cho model sống ở file, không sống trong code (STACK §1 ràng buộc 1).
 */
@Injectable()
export class PromptLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PromptLoaderService.name);
  private readonly cache = new Map<string, LoadedPrompt>();
  private readonly dir: string;

  constructor() {
    this.dir = PromptLoaderService.resolvePromptDir();
  }

  onModuleInit(): void {
    this.logger.log(`Thư mục prompt: ${this.dir}`);
  }

  /** `prompts/` nằm ở gốc repo, tức là thư mục cha của `backend/`. */
  private static resolvePromptDir(): string {
    const candidates = [
      process.env.PROMPTS_DIR,
      resolve(process.cwd(), '..', 'prompts'),
      resolve(process.cwd(), 'prompts'),
      resolve(__dirname, '..', '..', '..', 'prompts'),
    ].filter((c): c is string => typeof c === 'string' && c.length > 0);
    for (const c of candidates) {
      if (existsSync(join(c, 'generator.md'))) return c;
    }
    return candidates[1];
  }

  load(id: string): LoadedPrompt {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const path = join(this.dir, `${id}.md`);
    const raw = readFileSync(path, 'utf8');
    const parsed = this.parse(id, raw);
    this.cache.set(id, parsed);
    return parsed;
  }

  /** Dùng khi cần chứng minh prompt_hash mà không cần nội dung (eval/score.ts). */
  hashOf(id: string): string {
    return this.load(id).hash;
  }

  private parse(id: string, raw: string): LoadedPrompt {
    const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    const fields: Record<string, string> = {};
    let body = raw;
    if (fmMatch) {
      for (const line of fmMatch[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
        if (kv) fields[kv[1]] = kv[2].trim();
      }
      body = raw.slice(fmMatch[0].length);
    }

    const sections = this.splitSections(body);

    return {
      id,
      hash: createHash('sha256').update(raw).digest('hex'),
      version: fields.version ?? '1',
      model: fields.model ?? 'deepseek-v4-pro',
      system: sections.system.trim(),
      user: sections.user.trim(),
    };
  }

  private splitSections(body: string): { system: string; user: string } {
    const sysIdx = body.indexOf('## SYSTEM');
    const usrIdx = body.indexOf('## USER');
    if (sysIdx === -1 || usrIdx === -1 || usrIdx < sysIdx) {
      // File không chia khối thì coi toàn bộ là phần dùng chung.
      return { system: body, user: '' };
    }
    return {
      system: body.slice(sysIdx + '## SYSTEM'.length, usrIdx),
      user: body.slice(usrIdx + '## USER'.length),
    };
  }

  /** Thay `{{key}}` bằng giá trị. Không có template engine — thay chuỗi là đủ. */
  static render(template: string, vars: Record<string, unknown>): string {
    return template.replace(
      /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
      (whole, key: string) => {
        const v = vars[key];
        if (v === undefined) return whole;
        return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
      },
    );
  }
}
