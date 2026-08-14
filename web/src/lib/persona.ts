const PERSONA_INTEREST_SEPARATOR = /[;,；，、\r\n]+/;

export const normalizePersonaInterestTags = (values: string[]): string[] => {
  const tags: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const part of value.split(PERSONA_INTEREST_SEPARATOR)) {
      const tag = part.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
};

export const containsPersonaInterestSeparator = (value: string): boolean => PERSONA_INTEREST_SEPARATOR.test(value);
