'use client';

import { useMutation } from '@tanstack/react-query';
import { Pencil, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ErrorState } from './states';

/** **Read-only** topic chips — different from `KeywordChipInput` (editable, used in B2). Do not merge the two. */
export function TopicChipList({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {topics.map((t) => (
        <li
          key={t}
          className="border-brand-line bg-brand-soft text-brand-strong rounded-sm border px-2 py-0.5 text-xs"
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

/**
 * The raw-idea input — **the entry point of the whole app** (feature 1).
 * A quote-styled text area, a pencil button to switch into edit mode, and a full-width primary
 * button (DESIGN_SYSTEM §5.3).
 */
export function IdeaInput({
  value,
  editable = true,
  variant = 'create',
  onAnalyze,
  analyzing,
}: {
  value?: string;
  editable?: boolean;
  variant?: 'create' | 'inline';
  onAnalyze?: (text: string) => void;
  analyzing?: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(value ?? '');
  const [editing, setEditing] = useState(variant === 'create');

  const create = useMutation({
    mutationFn: (raw_idea: string) =>
      api.post<{ project: { id: string } }>('/projects', { raw_idea }),
    onSuccess: (res) => router.push(`/projects/${res.project.id}/step/1`),
  });

  const tooShort = text.trim().length < 20;

  return (
    <div className="space-y-3">
      {editing ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={variant === 'create' ? 5 : 4}
          placeholder="For example: I want to improve RAG over Vietnamese legal documents, especially for statutes with cross-references."
          aria-label="Research idea"
        />
      ) : (
        <div
          className={cn(
            'border-brand-line bg-brand-soft relative rounded-md border-l-4 px-3 py-2.5',
            editable && 'pr-11',
          )}
        >
          <p className="text-ink-1 text-sm leading-relaxed">{text}</p>
          {editable && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="border-brand-line bg-surface text-brand-strong hover:bg-brand-line absolute top-1.5 right-1.5 cursor-pointer rounded-md border p-1.5 shadow-xs"
              aria-label="Edit idea"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}

      {tooShort && editing && text.length > 0 && (
        <p className="text-ink-3 text-xs">At least 20 characters are needed to analyse this.</p>
      )}

      {create.isError && (
        <ErrorState
          message={
            create.error instanceof ApiError ? create.error.message : 'The project could not be created.'
          }
        />
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={tooShort || create.isPending || analyzing}
        onClick={() => {
          if (variant === 'create') create.mutate(text.trim());
          else {
            setEditing(false);
            onAnalyze?.(text.trim());
          }
        }}
      >
        <Sparkles className="size-4" aria-hidden />
        {create.isPending || analyzing ? 'Analysing…' : 'Analyse idea'}
      </Button>
    </div>
  );
}
