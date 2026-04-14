const IMPORT_HEADER_TOKENS = new Set([
  'card',
  'cardcode',
  'cdkey',
  'code',
  'codes',
  'upstreamcode',
  'upstreamcodes',
  '上游卡密',
  '卡密',
]);

function normalizeImportToken(value: string) {
  return value.trim().replace(/^['"]+|['"]+$/g, '');
}

function isHeaderToken(value: string) {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');

  return IMPORT_HEADER_TOKENS.has(normalized);
}

export function normalizeInventoryImportCode(value: string) {
  return value.trim().toUpperCase();
}

export type ParsedInventoryCodesText = {
  receivedCount: number;
  duplicateInputCount: number;
  duplicateCodes: string[];
  codes: string[];
};

export function parseInventoryCodesText(codesText: string): ParsedInventoryCodesText {
  const rawTokens = codesText
    .split(/[\n\r,;\t]+/)
    .map(normalizeImportToken)
    .filter(Boolean)
    .filter((token) => !isHeaderToken(token));

  const codes: string[] = [];
  const duplicateCodes: string[] = [];
  const seen = new Set<string>();
  const seenDuplicates = new Set<string>();
  let duplicateInputCount = 0;

  for (const token of rawTokens) {
    const normalizedCode = normalizeInventoryImportCode(token);

    if (seen.has(normalizedCode)) {
      duplicateInputCount += 1;

      if (!seenDuplicates.has(normalizedCode)) {
        seenDuplicates.add(normalizedCode);
        duplicateCodes.push(normalizedCode);
      }

      continue;
    }

    seen.add(normalizedCode);
    codes.push(normalizedCode);
  }

  return {
    receivedCount: rawTokens.length,
    duplicateInputCount,
    duplicateCodes,
    codes,
  };
}
