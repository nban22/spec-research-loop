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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ApiSource, CredibilityTier } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CredibilityTag } from './credibility-tag';
import { SupportTag } from './support-tag';

/**
 * Tap to open the source details — **tap**, not hover: touch has no hover
 * (DESIGN_SYSTEM §6.7 rule 1).
 */
export function SourceChip({
  source,
  credibility,
}: {
  source: ApiSource;
  /** Lane A · #1 — only passed when the `source_credibility` flag is on. */
  credibility?: { tier: CredibilityTier; reason: string } | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'border-hairline bg-sunken text-ink-2 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-sm border px-2 py-1 text-xs',
            'ease-out-quart transition-[color,background-color,border-color] duration-150',
            'hover:border-brand-line hover:bg-brand-soft hover:text-brand-strong',
          )}
        >
          <span className="truncate">{source.title}</span>
          {source.year && <span className="text-ink-4 shrink-0">({source.year})</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm leading-snug">{source.title}</DialogTitle>
          <DialogDescription className="text-xs">
            {source.authors.slice(0, 6).join(', ') || 'Authors unknown'}
            {source.authors.length > 6 ? ' et al.' : ''}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-1.5 text-xs">
          <Row label="Year" value={source.year ? String(source.year) : '—'} />
          <Row label="Venue" value={source.venue ?? '—'} />
          <Row label="Retrieved from" value={source.retrieved_from} />
          <Row
            label="Citations"
            value={source.citation_count === null ? '—' : String(source.citation_count)}
          />
          <Row
            label="DOI"
            value={source.doi ?? '—'}
            mono
            extra={
              source.doi_verified === true
                ? 'found in the registry'
                : source.doi_verified === false
                  ? 'not found'
                  : 'could not be checked'
            }
          />
        </dl>
        {credibility && (
          <CredibilityTag tier={credibility.tier} reason={credibility.reason} />
        )}
        {source.abstract && (
          <ScrollArea className="max-h-48">
            <p className="text-ink-2 pr-3 text-xs leading-relaxed">{source.abstract}</p>
          </ScrollArea>
        )}
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="text-brand-strong inline-flex items-center gap-1 text-xs underline underline-offset-2"
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Open the original
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
 * Five columns per mockup 2. Below the `md` breakpoint it **switches entirely to a card list**,
 * not a shrunken table: there are few rows and the user reads **one paper at a time**, so
 * horizontal scrolling would be the worst of the three options (DESIGN_SYSTEM §6.5).
 */
export function RelatedWorkTable({ rows }: { rows: RelatedRow[] }) {
  return (
    <>
      {/* ≥ md: a real table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[22%]">Study</TableHead>
              <TableHead>What it did</TableHead>
              <TableHead className="w-[14%]">Feedback type</TableHead>
              <TableHead>What is missing</TableHead>
              <TableHead className="w-[12%]">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="ease-out-quart transition-colors duration-150 hover:bg-sunken">
                <TableCell className="text-ink-1 align-top text-xs font-medium">
                  {r.source.title}
                  {r.source.year ? ` (${r.source.year})` : ''}
                </TableCell>
                <TableCell className="text-ink-2 align-top text-xs">{r.what_done}</TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline" className="text-2xs">
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

      {/* < md: one card per paper, with its own structure rather than a broken-up table */}
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li
            key={r.id}
            className="border-hairline bg-surface ease-out-quart hover:border-brand-line space-y-2 rounded-lg border p-3 transition-colors duration-150"
          >
            <h4 className="text-ink-1 text-sm font-medium">
              {r.source.title}
              {r.source.year ? ` (${r.source.year})` : ''}
            </h4>
            <Badge variant="outline" className="text-2xs">
              {r.feedback_type}
            </Badge>
            <div className="space-y-1 text-xs">
              <p className="text-ink-3 font-medium">What it did</p>
              <p className="text-ink-2">{r.what_done}</p>
              <p className="text-ink-3 font-medium">What is missing</p>
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

/** An input + removable keyword chips. The touch target grows via padding, not a bigger icon (§6.7). */
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
          placeholder="Add an English keyword…"
          aria-label="Add a source-search keyword"
        />
        <Button type="button" variant="outline" onClick={add}>
          Add
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
              className="hover:bg-brand-line cursor-pointer rounded p-1"
              aria-label={`Remove keyword ${k}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The "Preferred sources" checkbox list (mockup 2). Client-side filtering over the collected set. */
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
