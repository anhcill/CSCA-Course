const PLAIN_TEXT_MATH_MARKER = '\u2063\u2063\u2063';

export function isPlainTextMathValue(value) {
  return typeof value === 'string' && value.startsWith(PLAIN_TEXT_MATH_MARKER);
}

export function stripPlainTextMathMarker(value) {
  return isPlainTextMathValue(value) ? value.slice(PLAIN_TEXT_MATH_MARKER.length) : (value || '');
}

export function markPlainTextMathValue(value) {
  const clean = stripPlainTextMathMarker(value);
  return clean ? `${PLAIN_TEXT_MATH_MARKER}${clean}` : '';
}

export function preservePlainTextMathMode(currentValue, nextValue) {
  return isPlainTextMathValue(currentValue) ? markPlainTextMathValue(nextValue) : nextValue;
}
