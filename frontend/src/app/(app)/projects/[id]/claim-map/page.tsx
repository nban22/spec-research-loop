'use client';

import { Network } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { ClaimEvidenceMap, type ClaimCard } from '@/components/claim-evidence-map';
import { HintBox } from '@/components/hint-box';
import { Panel } from '@/components/panel';
import { CardSkeleton, EmptyState } from '@/components/states';
import { StatTileGrid } from '@/components/spec-views';
import { useDeleteCard, useLinkSource, useUnlinkSource } from '@/lib/use-card-link';
import { useCards, useProject, useSources } from '@/lib/use-project';

/**
 * **Bản đồ claim–evidence kéo thả** — issue #15 (làn C), điểm nhấn demo.
 *
 * Trang riêng chứ không nhét vào bước 3: thao tác ở đây là **sửa tay bản nháp**, không phải một
 * bước của quy trình. Cùng khuôn với `/map` (#16), `/simulate` (#18), `/cost` (#17).
 */
export default function ClaimMapPage({ params }: PageProps<'/projects/[id]/claim-map'>) {
  const { id } = use(params);
  const { data: detail, isLoading } = useProject(id);
  const versionId = detail?.currentVersion?.id;
  const { data: cardData } = useCards(versionId);
  const { data: sourceData } = useSources(id);

  const link = useLinkSource(versionId);
  const unlink = useUnlinkSource(versionId);
  const del = useDeleteCard(versionId);
  const busy = link.isPending || unlink.isPending || del.isPending;

  /* Chỉ `CLAIM` — `CONTRIBUTION` là lời hứa về đóng góp, không phải phát biểu cần nguồn đỡ.
     Trộn hai loại vào đây làm mọi thẻ contribution hiện ra như "claim treo", mà chúng không treo. */
  const claims: ClaimCard[] = (cardData?.cards ?? []).filter((c) => c.type === 'CLAIM');
  const sources = sourceData?.sources ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
        <CardSkeleton rows={3} />
      </div>
    );
  }

  if (!versionId) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-3 py-4 md:px-4">
        <EmptyState
          icon={Network}
          title="Dự án chưa có bản đặc tả nào"
          description="Bạn chạy bước 1 để phân tích ý tưởng trước, rồi quay lại đây."
        />
      </div>
    );
  }

  const dangling = claims.filter((c) => c.card_sources.length === 0).length;
  const usedSources = new Set(claims.flatMap((c) => c.card_sources.map((cs) => cs.source.id)));

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3 px-3 py-4 md:px-4">
      <header className="space-y-1">
        <h1 className="text-ink-1 text-lg font-semibold md:text-xl">Bản đồ claim–evidence</h1>
        <p className="text-ink-3 text-xs md:text-sm">
          Kéo nguồn thả vào claim để nối ·{' '}
          <Link
            href={`/projects/${id}/step/3`}
            className="text-brand-strong underline underline-offset-2"
          >
            quay lại bước 3
          </Link>
        </p>
      </header>

      <Panel accent={dangling > 0 ? 'decide' : 'ok'} icon={Network} title="Tình trạng">
        <StatTileGrid
          items={[
            { label: 'Claim', value: String(claims.length) },
            { label: 'Claim đang treo', value: String(dangling) },
            { label: 'Nguồn đang dùng', value: `${usedSources.size}/${sources.length}` },
          ]}
        />
        <HintBox tone={dangling > 0 ? 'warn' : 'ok'}>
          {dangling > 0 ? (
            <>
              Có <strong>{dangling} claim chưa có nguồn nào đỡ</strong>. Đó là chỗ verifier sẽ gắn
              nhãn <code>UNSUPPORTED</code> và chặn xuất bản. Bạn nối nguồn cho chúng trước.
            </>
          ) : (
            <>
              Mọi claim đều đã có ít nhất một nguồn. Cặp bạn vừa nối tay được đánh dấu{' '}
              <strong>chưa kiểm</strong> — chạy kiểm chứng ở bước 5 để verifier chấm chúng.
            </>
          )}
        </HintBox>
      </Panel>

      <Panel accent="neutral" icon={Network} title="Bản đồ">
        <ClaimEvidenceMap
          claims={claims}
          sources={sources}
          busy={busy}
          onLink={(cardId, sourceId) => link.mutate({ cardId, sourceId })}
          onUnlink={(cardSourceId) => unlink.mutate(cardSourceId)}
          onDeleteCard={(cardId) => del.mutate(cardId)}
        />
      </Panel>
    </div>
  );
}
