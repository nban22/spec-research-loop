import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClaimEvidenceMap, type ClaimCard } from './claim-evidence-map';
import type { ApiSource } from '@/lib/types';

/**
 * Test **hợp đồng**, không test cơ chế kéo thả.
 *
 * Kéo thả thật cần toạ độ chuột, `PointerEvent`, và phép đo bố cục — jsdom không có cái nào cho
 * ra kết quả đáng tin, nên test kéo thả ở đây chỉ tạo cảm giác an toàn giả. Thứ đáng khoá lại là:
 *
 * 1. **Kéo thả không phải đường duy nhất** — mọi thao tác đều có nút thật, dùng được bằng ngón
 *    tay và bằng bàn phím (frontend/CLAUDE.md §7).
 * 2. **Claim treo phải nhìn ra được** — đó là lý do màn hình này tồn tại.
 * 3. Mọi nút có **tên**, không phải icon trần.
 */

const source = (over: Partial<ApiSource> = {}): ApiSource => ({
  id: 's-1',
  title: 'Neural machine translation with attention',
  authors: ['A'],
  year: 2020,
  venue: 'ACL',
  doi: null,
  url: null,
  abstract: null,
  citation_count: 10,
  retrieved_from: 'SEMANTIC_SCHOLAR',
  doi_verified: true,
  ...over,
});

const claim = (over: Partial<ClaimCard> = {}): ClaimCard => ({
  id: 'c-1',
  title: 'Mô hình đề xuất giảm 20% lỗi dịch',
  status: 'PROPOSED',
  type: 'CLAIM',
  card_sources: [],
  ...over,
});

const linked = (over: Partial<ClaimCard['card_sources'][number]> = {}) => ({
  id: 'cs-1',
  support_label: 'SUPPORTED' as const,
  flags: null,
  source: { id: 's-1', title: 'Neural machine translation with attention', year: 2020 },
  ...over,
});

function setup(props: Partial<Parameters<typeof ClaimEvidenceMap>[0]> = {}) {
  const onLink = vi.fn();
  const onUnlink = vi.fn();
  const onDeleteCard = vi.fn();
  render(
    <ClaimEvidenceMap
      claims={[claim()]}
      sources={[source()]}
      onLink={onLink}
      onUnlink={onUnlink}
      onDeleteCard={onDeleteCard}
      {...props}
    />,
  );
  return { onLink, onUnlink, onDeleteCard };
}

describe('ClaimEvidenceMap', () => {
  it('claim chưa có nguồn nào thì nói thẳng ra, không để người dùng tự đoán', () => {
    setup();
    expect(screen.getByText(/Claim này chưa có nguồn nào đỡ/)).toBeInTheDocument();
  });

  it('nối được nguồn bằng NÚT, không bắt buộc phải kéo', () => {
    const { onLink } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Nối vào…' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Mô hình đề xuất giảm 20% lỗi dịch' }),
    );
    expect(onLink).toHaveBeenCalledWith('c-1', 's-1');
  });

  it('gỡ được liên kết bằng nút có tên rõ ràng', () => {
    const { onUnlink } = setup({ claims: [claim({ card_sources: [linked()] })] });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Gỡ nguồn Neural machine translation with attention khỏi claim',
      }),
    );
    expect(onUnlink).toHaveBeenCalledWith('cs-1');
  });

  it('xoá được thẻ bằng nút có tên rõ ràng', () => {
    const { onDeleteCard } = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'Xoá thẻ Mô hình đề xuất giảm 20% lỗi dịch' }),
    );
    expect(onDeleteCard).toHaveBeenCalledWith('c-1');
  });

  it('đếm đúng số nguồn đang được dùng', () => {
    setup({
      claims: [claim({ card_sources: [linked()] })],
      sources: [source(), source({ id: 's-2', title: 'Nguồn chưa ai dùng' })],
    });
    expect(screen.getByText('1/2 đang dùng')).toBeInTheDocument();
  });

  it('hiện nhãn kiểm chứng của từng liên kết, không giấu trong hover', () => {
    setup({
      claims: [claim({ card_sources: [linked({ support_label: 'UNSUPPORTED' })] })],
    });
    const section = screen.getByLabelText('Claim Mô hình đề xuất giảm 20% lỗi dịch');
    // Nhãn giữ nguyên tiếng Anh: đây là kết quả verifier, FE không dịch (CLAUDE.md §6).
    expect(within(section).getByText('UNSUPPORTED')).toBeInTheDocument();
  });

  it('chưa có claim nào thì chỉ đường sang bước sinh claim, không hiện bản đồ rỗng', () => {
    setup({ claims: [] });
    expect(screen.getByText(/Chưa có claim nào/)).toBeInTheDocument();
  });

  it('chưa có nguồn nào thì chỉ đường sang bước tìm nguồn', () => {
    setup({ sources: [] });
    expect(screen.getByText(/Chưa có nguồn nào/)).toBeInTheDocument();
  });

  it('đang có lệnh chạy thì khoá mọi nút ghi, tránh bấm hai lần', () => {
    setup({ claims: [claim({ card_sources: [linked()] })], busy: true });
    expect(
      screen.getByRole('button', { name: 'Xoá thẻ Mô hình đề xuất giảm 20% lỗi dịch' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Gỡ nguồn Neural machine translation with attention khỏi claim',
      }),
    ).toBeDisabled();
  });
});
