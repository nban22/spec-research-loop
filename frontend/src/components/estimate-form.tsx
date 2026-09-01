'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { QuantPicker, SliderRow, type SimInput } from '@/components/cost-simulator';
import { Button } from '@/components/ui/button';
import { ApiError, api, qk } from '@/lib/api';

/**
 * The form for entering resource-estimate parameters by hand.
 *
 * Shown only in the `INVALID_PARAMS` case: the plan **does** have a compute part but the
 * parameters the model returned are unusable. Very different from `NOT_APPLICABLE` — there the
 * number does not exist, here it exists and was merely not obtained, so inviting the user to enter
 * it is the right move rather than passing the buck.
 *
 * `POST /projects/:id/estimate` **has existed for a long time with no caller**. No new endpoint.
 *
 * It reuses `SliderRow` and `QuantPicker` from the cost-simulation screen: the same seven
 * parameters on the same scales. Building a second set of inputs just to look different is an
 * invitation for the two to drift apart.
 */
export function EstimateForm({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  /* The initial values are **shared defaults**, not the parameters the model returned — those were
     just rejected as invalid, and pre-filling them invites the user to resubmit what already broke. */
  const [input, setInput] = useState<SimInput>({
    model_params_b: 7,
    quantization: 'int8',
    candidates: 8,
    rounds: 3,
    eval_samples: 200,
    avg_prompt_tokens: 1200,
    avg_output_tokens: 600,
  });

  const save = useMutation({
    mutationFn: () => api.post<{ estimate: unknown }>(`/projects/${projectId}/estimate`, input),
    onSuccess: () => {
      toast.success('Resource estimate saved.');
      void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: ['spec-versions'] });
      setOpen(false);
      onSaved?.();
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'The estimate could not be saved. Please try again.',
      );
    },
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Enter the estimate parameters yourself
      </Button>
    );
  }

  return (
    <div className="border-hairline space-y-3 rounded-md border px-3 py-3">
      <SliderRow
        id="est-params"
        label="Model size (billion parameters)"
        value={input.model_params_b}
        min={1}
        max={180}
        onChange={(v) => setInput((s) => ({ ...s, model_params_b: v }))}
      />
      <QuantPicker
        value={input.quantization}
        onChange={(v) => setInput((s) => ({ ...s, quantization: v }))}
      />
      <SliderRow
        id="est-candidates"
        label="Candidates"
        value={input.candidates}
        min={1}
        max={64}
        onChange={(v) => setInput((s) => ({ ...s, candidates: v }))}
      />
      <SliderRow
        id="est-rounds"
        label="Rounds"
        value={input.rounds}
        min={1}
        max={12}
        onChange={(v) => setInput((s) => ({ ...s, rounds: v }))}
      />
      <SliderRow
        id="est-eval"
        label="Evaluation samples"
        value={input.eval_samples}
        min={10}
        max={2000}
        step={10}
        onChange={(v) => setInput((s) => ({ ...s, eval_samples: v }))}
      />
      <SliderRow
        id="est-prompt-tokens"
        label="Average input tokens"
        value={input.avg_prompt_tokens}
        min={200}
        max={8000}
        step={100}
        onChange={(v) => setInput((s) => ({ ...s, avg_prompt_tokens: v }))}
      />
      <SliderRow
        id="est-output-tokens"
        label="Average output tokens"
        value={input.avg_output_tokens}
        min={100}
        max={4000}
        step={50}
        onChange={(v) => setInput((s) => ({ ...s, avg_output_tokens: v }))}
      />

      <div className="flex gap-2">
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          Save estimate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
