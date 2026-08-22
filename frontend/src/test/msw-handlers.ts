import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/me', () => {
    return HttpResponse.json({
      user: { id: 'u-1', email: 'test@example.com', display_name: 'Test User' },
    });
  }),

  http.get('/api/projects/:id', ({ params }) => {
    return HttpResponse.json({
      project: {
        id: params.id,
        title: 'Sample Spec Project',
        raw_idea: 'Detailed research proposal raw idea text for testing.',
        step: 'S1',
        status: 'DRAFT',
        arm: 'STANDARD',
        verifier_gate: true,
        current_spec_version_id: 'v-1',
      },
      currentVersion: {
        id: 'v-1',
        version_no: 1,
        status: 'DRAFT',
        card_count: 4,
        related_work_count: 2,
        issue_group_count: 0,
      },
      source_count: 3,
    });
  }),

  http.get('/api/projects/:id/cards', () => {
    return HttpResponse.json([
      {
        id: 'c-1',
        type: 'PROBLEM',
        status: 'UNVERIFIED',
        title: 'Problem 1',
        body: 'Problem description text.',
        card_sources: [],
      },
    ]);
  }),
];
