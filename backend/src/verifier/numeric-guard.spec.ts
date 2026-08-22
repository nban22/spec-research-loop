import {
  claimsRecency,
  extractNumbers,
  numbersMissingFromSource,
} from './numeric-guard';

describe('numeric citation guard', () => {
  it('ignores publication years and small unqualified counts', () => {
    expect(extractNumbers('In 2024, we ran 3 experiments.')).toEqual([]);
  });

  it('flags a quantitative claim that is absent from its source', () => {
    expect(
      numbersMissingFromSource(
        'Improves accuracy by 18%.',
        'Accuracy improved by 12%.',
      ),
    ).toEqual(['18%']);
  });

  it('allows rounded values and detects recency claims', () => {
    expect(
      numbersMissingFromSource('Uses 20.4 GB.', 'The system uses 20 GB.'),
    ).toEqual([]);
    expect(claimsRecency('This is the latest state of the art method.')).toBe(
      true,
    );
  });
});
