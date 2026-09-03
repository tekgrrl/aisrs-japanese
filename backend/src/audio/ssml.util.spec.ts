import { escapeXml, validateSegments, punctuationSplit, buildPacedSsml } from './ssml.util';

describe('escapeXml', () => {
  it('escapes all five XML-significant characters', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('leaves Japanese text untouched', () => {
    expect(escapeXml('今日はいい天気ですね')).toBe('今日はいい天気ですね');
  });
});

describe('validateSegments', () => {
  it('accepts an exact reconstruction', () => {
    expect(validateSegments('今日はいい天気', ['今日', 'は', 'いい', '天気'])).toBe(true);
  });

  it('tolerates whitespace differences, including full-width space', () => {
    expect(validateSegments('今日は いい天気', ['今日は', '　', 'いい天気'])).toBe(true);
  });

  it('rejects a segmenter that drops a character', () => {
    expect(validateSegments('今日はいい天気ですね', ['今日', 'は', 'いい', '天気', 'です'])).toBe(false);
  });

  it('rejects a segmenter that alters/corrects text', () => {
    expect(validateSegments('今日はいい天気ですね', ['今日', 'は', '良い', '天気', 'ですね'])).toBe(false);
  });

  it('rejects reordered segments even if characters match', () => {
    expect(validateSegments('AB', ['B', 'A'])).toBe(false);
  });
});

describe('punctuationSplit', () => {
  it('splits on clause-ending punctuation and keeps it as its own segment', () => {
    expect(punctuationSplit('今日は、いい天気ですね。')).toEqual([
      '今日は', '、', 'いい天気ですね', '。',
    ]);
  });

  it('produces no empty segments', () => {
    for (const s of punctuationSplit('元気？うん！')) {
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

describe('buildPacedSsml', () => {
  it('joins segments with a break tag of the given duration', () => {
    expect(buildPacedSsml(['今日', 'は'], 400)).toBe(
      '<speak>今日<break time="400ms"/>は</speak>',
    );
  });

  it('escapes each segment before joining, so a literal & cannot corrupt the break tag', () => {
    const ssml = buildPacedSsml(['A&B', 'C'], 200);
    expect(ssml).toBe('<speak>A&amp;B<break time="200ms"/>C</speak>');
  });
});
