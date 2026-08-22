import { PromptLoaderService } from './prompt-loader.service';

describe('PromptLoaderService', () => {
  it('renders template variables in prompt strings', () => {
    const template = 'Hello {{name}}, welcome to {{project}}!';
    const rendered = PromptLoaderService.render(template, {
      name: 'Alice',
      project: 'Research',
    });
    expect(rendered).toBe('Hello Alice, welcome to Research!');
  });

  it('renders JSON objects formatted in template variables', () => {
    const template = 'Data: {{obj}}';
    const rendered = PromptLoaderService.render(template, {
      obj: { key: 'val' },
    });
    expect(rendered).toContain('"key": "val"');
  });
});
