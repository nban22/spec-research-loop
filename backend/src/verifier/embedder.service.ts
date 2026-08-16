import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { setImmediate as yieldTick } from 'node:timers/promises';
import { dynamicImport } from '../common/dynamic-import';

type FeatureExtractor = (
  texts: string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>;

/** Bề mặt tối thiểu ta dùng của `@xenova/transformers` — gói ESM-only, nạp lười. */
type TransformersModule = {
  pipeline: (task: string, model: string) => Promise<FeatureExtractor>;
  env?: { allowLocalModels?: boolean; cacheDir?: string };
};

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
/**
 * Chia lô nhỏ và nhả event loop giữa các lô. Tổng thời gian gần như không đổi, nhưng không còn
 * khoảng ~8 giây bị giữ liền mạch — đó là thứ làm SSE của job judge chạy song song đứng hình
 * (SYSTEM_DESIGN_ANALYSIS C2 · F.7). **Chưa** dùng `worker_threads`, có chủ ý.
 */
const BATCH_SIZE = 12;

@Injectable()
export class EmbedderService implements OnModuleInit {
  private readonly logger = new Logger(EmbedderService.name);
  private extractor: FeatureExtractor | null = null;
  private loading: Promise<void> | null = null;
  private failed = false;

  /** Warm-up lúc boot: boot chậm hơn vài giây, không ai thấy; request đầu tiên không phải chờ. */
  onModuleInit(): void {
    void this.ensureLoaded().catch(() => undefined);
  }

  get isAvailable(): boolean {
    return this.extractor !== null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.extractor) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      const t0 = Date.now();
      this.logger.log(
        `Đang nạp model embedding ${MODEL_ID}… (lần đầu tải ~90MB)`,
      );
      const mod = await dynamicImport<TransformersModule>(
        '@xenova/transformers',
      );
      /**
       * Cache model để lần chạy sau không phụ thuộc mạng.
       *
       * Đường dẫn lấy từ `TRANSFORMERS_CACHE` và **phải tuyệt đối khi chạy trong container** —
       * đường dẫn tương đối bám theo `cwd`, nên chỉ cần đổi thư mục làm việc là model bị tải lại
       * từ đầu (~90 MB), hoặc chết hẳn nếu máy chủ không ra được internet.
       * Dockerfile nướng sẵn model vào image ở đúng thư mục này.
       */
      if (mod.env) {
        mod.env.allowLocalModels = false;
        mod.env.cacheDir =
          process.env.TRANSFORMERS_CACHE ?? '.cache/transformers';
      }
      this.extractor = await mod.pipeline('feature-extraction', MODEL_ID);
      this.logger.log(`Model embedding sẵn sàng sau ${Date.now() - t0}ms.`);
    })().catch((err: unknown) => {
      this.failed = true;
      this.loading = null;
      this.logger.error(
        `Không nạp được model embedding: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    });

    return this.loading;
  }

  get hasFailed(): boolean {
    return this.failed;
  }

  /** Trả về vector đã normalize — cosine trở thành phép nhân vô hướng. */
  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    await this.ensureLoaded();
    if (!this.extractor) throw new Error('Embedder chưa sẵn sàng');

    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const result = await this.extractor(batch, {
        pooling: 'mean',
        normalize: true,
      });
      const dim = result.dims[result.dims.length - 1];
      for (let b = 0; b < batch.length; b++) {
        out.push(result.data.slice(b * dim, (b + 1) * dim));
      }
      // Nhả event loop giữa các lô.
      await yieldTick();
    }
    return out;
  }
}

/** Hai vector đã normalize ⇒ cosine = dot product. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}
