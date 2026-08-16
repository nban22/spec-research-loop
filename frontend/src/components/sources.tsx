'use client';

import { ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiSource } from '@/lib/types';
import { SupportTag } from './support-tag';

/**
 * Bấm để mở thông tin nguồn — **bấm**, không phải hover: cảm ứng không có hover
 * (DESIGN_SYSTEM §6.7 luật 1).
 */
export function SourceChip({ source }: { source: ApiSource }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-hairline bg-sunken text-ink-2 hover:border-brand-line inline-flex max-w-full items-center gap-1 rounded-sm border px-2 py-1 text-xs"
        >
          <span className="truncate">{source.title}</span>
          {source.year && <span className="text-ink-4 shrink-0">({source.year})</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm leading-snug">{source.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {source.authors.slice(0, 6).join(', ') || 'Không rõ tác giả'}
            {source.authors.length > 6 ? ' và cộng sự' : ''}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-1.5 text-xs">
          <Row label="Năm" value={source.year ? String(source.year) : '—'} />
          <Row label="Nơi công bố" value={source.venue ?? '—'} />
          <Row label="Lấy từ" value={source.retrieved_from} />
          <Row
            label="DOI"
            value={source.doi ?? '—'}
            mono
            extra={
              source.doi_verified === true
                ? 'đã tra ra ở registry'
                : source.doi_verified === false
                  ? 'không tra ra'
                  : 'chưa kiểm được'
            }
          />
        </dl>
        {source.abstract && (
          <p className="text-ink-2 max-h-48 overflow-y-auto text-xs leading-relaxed">
            {source.abstract}
          </p>
        )}
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-brand-strong inline-flex items-center gap-1 text-xs underline underline-offset-2"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Mở nguồn gốc
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  mono,
  extra,
}: {
  label: string;
  value: string;
  mono?: boolean;
  extra?: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className="text-ink-3 w-28 shrink-0">{label}</dt>
      <dd className={mono ? 'text-ink-1 font-mono break-all' : 'text-ink-1'}>
        {value}
        {extra && <span className="text-ink-4 ml-1 font-sans">· {extra}</span>}
      </dd>
    </div>
  );
}

export type RelatedRow = {
  id: string;
  source: ApiSource;
  what_done: string;
  feedback_type: string;
  what_missing: string;
  support?: { label: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED' } | null;
};

/**
 * Năm cột theo mockup 2. Dưới mốc `md` **đổi hẳn sang card list**, không phải bảng thu nhỏ:
 * ít hàng và người dùng đọc **từng paper một**, nên cuộn ngang là tệ nhất trong ba lựa chọn
 * (DESIGN_SYSTEM §6.5).
 */
export function RelatedWorkTable({ rows }: { rows: RelatedRow[] }) {
  return (
    <>
      {/* ≥ md: bảng thật */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%]">Nghiên cứu</TableHead>
              <TableHead>Đã làm gì</TableHead>
              <TableHead className="w-[14%]">Loại feedback</TableHead>
              <TableHead>Điểm còn thiếu</TableHead>
              <TableHead className="w-[12%]">Nguồn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-ink-1 align-top text-xs font-medium">
                  {r.source.title}
                  {r.source.year ? ` (${r.source.year})` : ''}
                </TableCell>
                <TableCell className="text-ink-2 align-top text-xs">{r.what_done}</TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline" className="text-[11px]">
                    {r.feedback_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-ink-2 align-top text-xs">
                  {r.what_missing}
                </TableCell>
                <TableCell className="align-top">
                  <SourceChip source={r.source} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* < md: mỗi paper một card, có cấu trúc riêng chứ không phải bảng bị bẻ */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="border-hairline bg-surface space-y-2 rounded-lg border p-3">
            <h4 className="text-ink-1 text-sm font-medium">
              {r.source.title}
              {r.source.year ? ` (${r.source.year})` : ''}
            </h4>
            <Badge variant="outline" className="text-[11px]">
              {r.feedback_type}
            </Badge>
            <div className="space-y-1 text-xs">
              <p className="text-ink-3 font-medium">Đã làm gì</p>
              <p className="text-ink-2">{r.what_done}</p>
              <p className="text-ink-3 font-medium">Điểm còn thiếu</p>
              <p className="text-ink-2">{r.what_missing}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <SourceChip source={r.source} />
              {r.support && <SupportTag label={r.support.label} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Ô nhập + chip từ khoá có nút xoá. Vùng chạm nới bằng padding, không phóng to icon (§6.7). */
export function KeywordChipInput({
  keywords,
  onChange,
}: {
  keywords: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v.length < 2 || keywords.includes(v)) return;
    onChange([...keywords, v]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Thêm từ khoá tiếng Anh…"
          aria-label="Thêm từ khoá tìm nguồn"
        />
        <Button type="button" variant="outline" onClick={add}>
          Thêm
        </Button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <li
            key={k}
            className="border-brand-line bg-brand-soft text-brand-strong flex items-center gap-1 rounded-sm border py-1 pr-1 pl-2 text-xs"
          >
            <span>{k}</span>
            <button
              type="button"
              onClick={() => onChange(keywords.filter((x) => x !== k))}
              className="hover:bg-brand-line rounded p-1"
              aria-label={`Xoá từ khoá ${k}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Danh sách checkbox "Nguồn ưu tiên" (mockup 2). Lọc phía client trên tập đã gom. */
export function SourceFilterList({
  filters,
  onToggle,
}: {
  filters: { key: string; label: string; checked: boolean }[];
  onToggle: (key: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {filters.map((f) => (
        <li key={f.key} className="flex items-center gap-2">
          <Checkbox
            id={`filter-${f.key}`}
            checked={f.checked}
            onCheckedChange={() => onToggle(f.key)}
          />
          <Label htmlFor={`filter-${f.key}`} className="text-ink-2 text-xs font-normal">
            {f.label}
          </Label>
        </li>
      ))}
    </ul>
  );
}
