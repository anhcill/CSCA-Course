import {
  OCR_MATH_SYMBOL_REPLACEMENTS,
  normalizeOcrMathSyntax,
  repairOcrMathArtifacts,
} from './ocrMathArtifacts.js';
import { applyDisplayLatexInputRules, applyDisplayLatexOutputRules } from './displayLatexRules.js';

const MATH_RANGES = [
  [0x1d400, 65, 26],
  [0x1d41a, 97, 26],
  [0x1d434, 65, 26],
  [0x1d44e, 97, 26],
  [0x1d468, 65, 26],
  [0x1d482, 97, 26],
  [0x1d5a0, 65, 26],
  [0x1d5ba, 97, 26],
  [0x1d7ce, 48, 10],
  [0x1d7d8, 48, 10],
];

const SYMBOL_REPLACEMENTS = {
  ['\u2212']: '-',
  ['\u2013']: '-',
  ['\u2014']: '-',
  ['\u2260']: '\\ne ',
  ['\u2264']: '\\le ',
  ['\u2265']: '\\ge ',
  ['\u00d7']: '\\times ',
  ['\u00f7']: '\\div ',
  ['\u00b7']: '\\cdot ',
  ['\u22c5']: '\\cdot ',
  ['\u00b1']: '\\pm ',
  ['\u21d2']: '\\Rightarrow ',
  ['\u21d4']: '\\Leftrightarrow ',
  ['\u2192']: '\\to ',
  ['\u221a']: '\\sqrt{}',
  ['\u221e']: '\\infty ',
  ['\u2205']: '\\emptyset ',
  ['\u2208']: '\\in ',
  ['\u2209']: '\\notin ',
  ['\u211d']: '\\mathbb{R} ',
  ['\u2124']: '\\mathbb{Z} ',
  ['\u2115']: '\\mathbb{N} ',
  ['\u2216']: '\\setminus ',
  ['\u222a']: '\\cup ',
  ['\u2229']: '\\cap ',
  ['\u2248']: '\\approx ',
  ['\u00b0']: '^\\circ',
  ['\u03c0']: '\\pi ',
  ['\u03b8']: '\\theta ',
  ['\u03b1']: '\\alpha ',
  ['\u03b2']: '\\beta ',
  ['\u03b3']: '\\gamma ',
  ['\u03b4']: '\\delta ',
  ['\u03bc']: '\\mu ',
  ['\u03bb']: '\\lambda ',
  ['\u03c9']: '\\omega ',
  ['\u03c6']: '\\varphi ',
  ['\u03d5']: '\\phi ',
  ['\ud6fc']: '\\alpha ',
  ['\uff08']: '(',
  ['\uff09']: ')',
};

const INLINE_MATH_COMMAND_RE =
  /\\(?:sin|cos|tan|cot|sec|csc|log|ln|lg|sqrt|lim|sum|int|vec|bar|hat|tilde|frac|binom|mathbb|mathrm|operatorname|text|begin|end|rightleftharpoons|leftrightharpoons|leftrightarrow|rightarrow|leftarrow|left|right|infty|emptyset|in|notin|setminus|cup|cap|times|div|cdot|quad|qquad|circ|pi|alpha|beta|gamma|delta|theta|lambda|mu|omega|varphi|phi|Delta|partial|pm|Rightarrow|Leftrightarrow|to|leq|geq|neq|le|ge|ne|approx)(?![A-Za-z])/;
const WRAPPED_MATH_RE = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g;
const LATEX_COMMAND_BOUNDARY_RE =
  /\\(sin|cos|tan|cot|sec|csc|log|ln|lg|sqrt|lim|sum|int|vec|bar|hat|tilde|frac|binom|mathbb|mathrm|operatorname|text|begin|end|rightleftharpoons|leftrightharpoons|leftrightarrow|rightarrow|leftarrow|left|right|infty|emptyset|in|notin|setminus|cup|cap|times|div|cdot|quad|qquad|circ|pi|alpha|beta|gamma|delta|theta|lambda|mu|omega|varphi|phi|Delta|partial|pm|Rightarrow|Leftrightarrow|to|leq|geq|neq|le|ge|ne|approx)(?=[A-Za-z])/g;
const MATH_WORD_RE =
  /^(?:sin|cos|tan|cot|sec|csc|log|ln|lg|lim|sum|int|alpha|beta|gamma|delta|theta|lambda|mu|omega|varphi|phi|pi)$/i;
const SIMPLE_INTERVAL_ENDPOINT_RE_SOURCE =
  String.raw`[+\-]?(?:\\infty|\u221e|\d+(?:[.,]\d+)?|[A-Za-z](?:_\{[^{}]+\})?)`;
const SIMPLE_INTERVAL_RE_SOURCE =
  String.raw`[\[(]\s*${SIMPLE_INTERVAL_ENDPOINT_RE_SOURCE}\s*,\s*${SIMPLE_INTERVAL_ENDPOINT_RE_SOURCE}\s*[\])]`;
const SIMPLE_INTERVAL_CHAIN_RE_SOURCE =
  String.raw`${SIMPLE_INTERVAL_RE_SOURCE}(?:\s*(?:\\cup|\\cap|\u222a|\u2229)\s*${SIMPLE_INTERVAL_RE_SOURCE})*`;
const ESCAPED_INTERVAL_ASSIGNMENT_RE = new RegExp(
  String.raw`\b([A-Za-z](?:_\{[^{}]+\})?)\s*=\s*\\\(\s*(${SIMPLE_INTERVAL_CHAIN_RE_SOURCE})\s*\\\)`,
  'g',
);
const INTERVAL_ASSIGNMENT_RE = new RegExp(
  String.raw`\b([A-Za-z](?:_\{[^{}]+\})?)\s*=\s*(${SIMPLE_INTERVAL_CHAIN_RE_SOURCE})`,
  'g',
);

function mapMathCodePoint(codePoint) {
  for (const [start, asciiStart, length] of MATH_RANGES) {
    if (codePoint >= start && codePoint < start + length) {
      return String.fromCharCode(asciiStart + codePoint - start);
    }
  }

  return null;
}

export function normalizeMathUnicode(input) {
  let out = '';

  for (const char of input) {
    const mapped = mapMathCodePoint(char.codePointAt(0) || 0);
    out += mapped || SYMBOL_REPLACEMENTS[char] || OCR_MATH_SYMBOL_REPLACEMENTS[char] || char;
  }

  return out;
}

export function normalizeEscapedLatexBackslashes(input) {
  return input.replace(
    /\\{2,}(?=(?:sin|cos|tan|cot|sec|csc|log|ln|lg|sqrt|lim|sum|int|vec|bar|hat|tilde|frac|binom|mathbb|mathrm|operatorname|text|begin|end|rightleftharpoons|leftrightharpoons|left|right|infty|emptyset|notin|setminus|cup|cap|times|div|cdot|quad|qquad|circ|pi|alpha|beta|gamma|delta|theta|lambda|mu|Delta|partial|pm|Rightarrow|Leftrightarrow|to|leq|geq|neq|approx)\b|\(|\)|\[(?![\s+-]*\d)|\]|\{|\}|[,;!:])/g,
    '\\',
  );
}

const LATEX_TWO_ARG_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'binom']);

function readLatexGroup(input, index) {
  let cursor = index;
  while (/\s/.test(input[cursor] || '')) cursor += 1;

  const escaped = input[cursor] === '\\' && input[cursor + 1] === '{';
  const normal = input[cursor] === '{';
  if (!escaped && !normal) return null;

  if (escaped) {
    const start = cursor + 2;
    let depth = 1;
    for (let i = start; i < input.length; i += 1) {
      if (input[i] === '\\' && input[i + 1] === '{') {
        depth += 1;
        i += 1;
        continue;
      }
      if (input[i] === '\\' && input[i + 1] === '}') {
        depth -= 1;
        if (depth === 0) return { body: input.slice(start, i), end: i + 2 };
        i += 1;
      }
    }
    return null;
  }

  const start = cursor + 1;
  let depth = 1;
  for (let i = start; i < input.length; i += 1) {
    if (input[i] === '\\') {
      i += 1;
      continue;
    }
    if (input[i] === '{') depth += 1;
    if (input[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: input.slice(start, i), end: i + 1 };
    }
  }
  return null;
}

function normalizeEscapedLatexGroupBraces(value) {
  const input = String(value || '');
  let out = '';

  for (let index = 0; index < input.length;) {
    const commandMatch = input.slice(index).match(/^\\(dfrac|tfrac|frac|binom|sqrt|mathbb|mathrm|mathbf|operatorname|text)\b/);
    if (!commandMatch) {
      out += input[index];
      index += 1;
      continue;
    }

    const command = commandMatch[1];
    const first = readLatexGroup(input, index + commandMatch[0].length);
    if (!first) {
      out += commandMatch[0];
      index += commandMatch[0].length;
      continue;
    }

    if (LATEX_TWO_ARG_COMMANDS.has(command)) {
      const second = readLatexGroup(input, first.end);
      if (!second) {
        out += commandMatch[0];
        index += commandMatch[0].length;
        continue;
      }
      out += `\\${command}{${first.body.trim()}}{${second.body.trim()}}`;
      index = second.end;
      continue;
    }

    const nextBody = command === 'text'
      ? first.body.replace(/^\s+/, ' ').replace(/\s+$/, ' ')
      : first.body.trim();
    out += `\\${command}{${nextBody}}`;
    index = first.end;
  }

  return out.replace(/([_^])\\\{([^\\{}]{1,180})\\\}/g, (_, marker, body) => `${marker}{${String(body).trim()}}`);
}

function normalizeSetOperators(input) {
  return input
    .replace(/(?:\\cup|\u222a)(?=[A-Za-z0-9])/g, '\\cup ')
    .replace(/\\cup|\u222a/g, '\\cup')
    .replace(/(?:\\cap|\u2229)(?=[A-Za-z0-9])/g, '\\cap ')
    .replace(/\\cap|\u2229/g, '\\cap')
    .replace(/(?:\\setminus|\u2216)(?=[A-Za-z0-9])/g, '\\setminus ')
    .replace(/\\setminus|\u2216/g, '\\setminus');
}

function repairSetBuilderAbsoluteValues(input) {
  const domain = String.raw`(?:\\mathbb\{[A-Z]\}|[A-Za-z]+)`;
  const comparison = String.raw`(?:[<>=]|\\(?:le|leq|ge|geq|ne|neq))`;
  const setBuilderAbsValuePattern = new RegExp(
    String.raw`(\\(?:notin|in)\s*${domain}\s*)(?:\\mid|\|)\s*([A-Za-z])\s*(?:\\mid|\|)\s*(${comparison})`,
    'g',
  );

  return input.replace(setBuilderAbsValuePattern, '$1\\mid |$2|$3');
}

function wrapIntervalAssignments(input) {
  return input.replace(INTERVAL_ASSIGNMENT_RE, (match, variable, intervals, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 2), offset);
    const after = whole.slice(offset + match.length, offset + match.length + 2);
    if (before === '\\(' || before.endsWith('$') || after === '\\)') return match;

    return `\\(${variable}=${intervals}\\)`;
  });
}

export function repairMathFormatArtifacts(
  input,
  options = {},
) {
  if (!input) return '';
  const shouldWrapIntervalAssignments = options.wrapIntervalAssignments ?? true;

  const repairedBase = normalizeSetOperators(repairOcrMathArtifacts(normalizeEscapedLatexBackslashes(input)))
    .replace(/([=:\uff1a]\s*)\$\$+(?=\s*[[(+\-\\A-Za-z0-9])/g, '$1')
    .replace(/\(\[\)\/\(([^)]*)\)\)/g, '[$1)')
    .replace(/\(\(\)\/\(([^)]*)\)\)/g, '($1)')
    .replace(/\bC\s*(?:\u211d|\\mathbb\{R\})\s*\(/g, 'C_{\\mathbb{R}}(')
    .replace(/\bC\s+R\s*\(/g, 'C_{\\mathbb{R}}(')
    .replace(/\bC\s*(?:\u211d|\\mathbb\{R\})\b/g, 'C_{\\mathbb{R}}')
    .replace(/\bC\s+R\b/g, 'C_{\\mathbb{R}}')
    .replace(
      /(\\(?:notin|in)\s*(?:\\mathbb\{[A-Z]\}|[A-Za-z]+)\s*\\mid\s+)([A-Za-z])\s*\\mid\s*([<>=])/g,
      '$1|$2|$3',
    );
  const repaired = repairSetBuilderAbsoluteValues(repairedBase);

  const withIntervalAssignments = shouldWrapIntervalAssignments
    ? wrapIntervalAssignments(repaired.replace(ESCAPED_INTERVAL_ASSIGNMENT_RE, (_, variable, intervals) => (
      `\\(${variable}=${normalizeSetOperators(intervals.trim())}\\)`
    )))
    : repaired;

  return withIntervalAssignments
    .replace(/\s+([,.;:\uff0c\u3002\uff1b\uff1a\uff09)\]])/g, '$1')
    .replace(/([\uff08([])\s+/g, '$1');
}

function normalizeLooseMathSyntax(input) {
  return repairLooseSqrtRadicands(normalizeOcrMathSyntax(normalizeEscapedLatexGroupBraces(input)))
    .replace(/\\sqrt\{\s*\(\(\s*([^{}()\n]+?)\s*\)\s*\/\s*([^{}()\n]+?)\s*\)\)+\s*\}/g, '\\sqrt{\\frac{$1}{$2}}')
    .replace(/([=:\uff1a]\s*)\$\$(?=\s*[[(+\-\\A-Za-z0-9])/g, '$1')
    .replace(LATEX_COMMAND_BOUNDARY_RE, (match, command, offset, whole) => {
      const commandText = whole.slice(offset + 1);
      if (
        (command === 'in' && (commandText.startsWith('infty') || commandText.startsWith('int'))) ||
        (command === 'le' && (commandText.startsWith('leq') || commandText.startsWith('left'))) ||
        (command === 'left' && /^left(?:arrow|rightarrow|leftarrows|rightarrows|rightharpoons|threetimes)/.test(commandText)) ||
        (command === 'right' && /^right(?:arrow|rightarrows|leftharpoons|arrowtail|squigarrow)/.test(commandText)) ||
        (command === 'ge' && commandText.startsWith('geq')) ||
        (command === 'ne' && commandText.startsWith('neq'))
      ) {
        return match;
      }

      return `\\${command} `;
    })
    .replace(
      /(^|[^\\A-Za-z])([A-Z0-9])\s*(sin|cos|tan|cot|sec|csc)(?=(?:\\[A-Za-z]+|[A-Za-z0-9]|\s*(?:[+\-*/=,.;)\]]|$)))/gi,
      (_, prefix, coefficient, fn) => `${prefix}${coefficient}\\${fn.toLowerCase()} `,
    )
    .replace(
      /\\sqrt\{\}\s*([0-9]+)\s*(sin|cos|tan|cot|sec|csc)(?=(?:\\[A-Za-z]+|[A-Za-z]))/gi,
      (_, radicand, fn) => `\\sqrt{${radicand}}\\${fn.toLowerCase()} `,
    )
    .replace(/\\(sin|cos|tan|cot|sec|csc)\s*-\s*1\b/g, (_, fn) => `\\${fn.toLowerCase()}^{-1}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)\s*-\s*1\b/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()}^{-1}`)
    .replace(/\\(sin|cos|tan|cot|sec|csc)\s*\^\s*\{?\s*([+-]?\d+)\s*\}?/g, (_, fn, power) => `\\${fn.toLowerCase()}^{${power}}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)\b(?=\s*(?:\^|\(|\\[A-Za-z]+|[A-Za-z0-9]))/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()}`)
    .replace(/(^|[^\\A-Za-z])(alpha|beta|gamma|delta|theta|lambda|mu|pi)\b/gi, (_, prefix, name) => `${prefix}\\${name.toLowerCase()}`)
    .replace(/\\sqrt\{\}\s*\(([^()]+)\)/g, '\\sqrt{$1}')
    .replace(/\\sqrt\{\}\s*((?:\\[A-Za-z]+|[A-Za-z0-9]+)(?:_\{[^{}]+\})?(?:\^\{[^{}]+\})?)/g, '\\sqrt{$1}')
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)(?=\s*\()/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)([0-9]+)(?=\s*\^?\\circ)/gi, (_, prefix, fn, degrees) => `${prefix}\\${fn.toLowerCase()} ${degrees}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)\s+([0-9]+)\s*(?=(?:\\[A-Za-z]+|[A-Za-z]))/gi, (_, prefix, fn, number) => `${prefix}\\${fn.toLowerCase()} ${number}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)([0-9]+)(?=(?:\\[A-Za-z]+|[A-Za-z]))/gi, (_, prefix, fn, number) => `${prefix}\\${fn.toLowerCase()} ${number}`)
    .replace(/(^|[^\\A-Za-z])(sin|cos|tan|cot|sec|csc)(?=(?:\\[A-Za-z]+|[A-Za-z]))/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()} `)
    .replace(/(^|[^\\A-Za-z])(ln|lg|log)(?=\s*\()/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()}`)
    .replace(/(^|[^\\A-Za-z])log\s*([0-9]+)\s*\/\s*([0-9]+)\s*([A-Za-z0-9\\]+)\b/gi, '$1\\log_{\\frac{$2}{$3}} $4')
    .replace(/(^|[^\\A-Za-z])log\s*\^\s*\{?([0-9]+)\}?\s*\/\s*([0-9]+)\s+([0-9]+)(?:\s+\3\s+\4)?/gi, '$1\\log_{\\frac{$3}{$2}} $4')
    .replace(/(^|[^\\A-Za-z])(ln|lg|log)\s+/gi, (_, prefix, fn) => `${prefix}\\${fn.toLowerCase()} `)
    .replace(/\\log\s*([0-9]+)\s*\/\s*([0-9]+)\s*([A-Za-z0-9\\]+)\b/g, '\\log_{\\frac{$1}{$2}} $3')
    .replace(/\\log\s*\^\s*\{?([0-9]+)\}?\s*\/\s*([0-9]+)\s+([0-9]+)(?:\s+\2\s+\3)?/gi, '\\log_{\\frac{$2}{$1}} $3')
    .replace(/\\log\s*\^\s*\{?([0-9]+)\}?\s*\/\s*1\s*\^\s*\{?([0-9]+)\}?/gi, '\\log_{\\frac{1}{$1}} $2')
    .replace(/\\log\s+([2-9])([0-9])\b/g, '\\log_{$1} $2')
    .replace(/([0-9]+)\s*\\pi\s*\/\s*([0-9]+)/g, '\\frac{$1\\pi}{$2}')
    .replace(/\\pi\s*\/\s*([0-9]+)/g, '\\frac{\\pi}{$1}')
    .replace(/\\frac\s*([0-9A-Za-z])\s*(\\[A-Za-z]+)\s*\}?\s*\{?([0-9A-Za-z]+)\}?/g, '\\frac{$1$2}{$3}')
    .replace(/\\frac\{((?:[^{}]|\{[^{}]*\})+)\}\s*([0-9A-Za-z]+)\b/g, '\\frac{$1}{$2}')
    .replace(/\\frac\s*([0-9A-Za-z])\s*\{([0-9A-Za-z]+)\}/g, '\\frac{$1}{$2}')
    .replace(/([A-Za-z0-9])\s*\\frac\{\s*\^\{?([^{}]+)\}?\s*\}\{/g, '\\frac{$1^{$2}}{')
    .replace(/\bC\s+(\\mathbb\{[A-Z]\})\s*\(/g, 'C_{$1}(');
}

function repairLooseSqrtRadicands(input) {
  return input.replace(/\\sqrt\{\}\s*([([{][^=。\n；;，,]+)(?=\s*=)/g, (_, radicand) => {
    const clean = String(radicand || '').trim();
    return clean ? `\\sqrt{${clean}}` : '\\sqrt{}';
  });
}

function findMatchingBackward(input, closeIndex) {
  const close = input[closeIndex];
  const open = close === ')' ? '(' : close === ']' ? '[' : '{';
  let depth = 0;

  for (let i = closeIndex; i >= 0; i--) {
    if (input[i] === close) depth++;
    if (input[i] === open) depth--;
    if (depth === 0) return i;
  }

  return -1;
}

function findMatchingForward(input, openIndex) {
  const open = input[openIndex];
  const close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let depth = 0;

  for (let i = openIndex; i < input.length; i++) {
    if (input[i] === open) depth++;
    if (input[i] === close) depth--;
    if (depth === 0) return i;
  }

  return -1;
}

function isTermSeparator(input, index) {
  const char = input[index];
  if (/[,;\n=<>]/.test(char)) return true;
  if (char !== '+' && char !== '-') return false;

  const before = input[index - 1] || '';
  const after = input[index + 1] || '';
  return /\s/.test(before) || /\s/.test(after);
}

function findAtomStart(input, end) {
  let cursor = end;
  while (cursor > 0 && /\s/.test(input[cursor - 1])) cursor--;
  if (cursor <= 0) return 0;

  const lastChar = input[cursor - 1];
  if (lastChar === ')' || lastChar === ']' || lastChar === '}') {
    const groupStart = findMatchingBackward(input, cursor - 1);
    if (groupStart >= 0) {
      const command = input.slice(0, groupStart).match(/\\[A-Za-z]+\s*$/);
      return command?.index !== undefined ? command.index : groupStart;
    }
  }

  const match = input.slice(0, cursor).match(/(?:\\[A-Za-z]+|[A-Za-z0-9]+)\s*$/);
  return match?.index ?? cursor - 1;
}

function stripOuterGroup(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const isWrapped =
    (first === '(' && last === ')') ||
    (first === '[' && last === ']') ||
    (first === '{' && last === '}');

  if (!isWrapped) return trimmed;

  const match = findMatchingForward(trimmed, 0);
  return match === trimmed.length - 1 ? trimmed.slice(1, -1).trim() : trimmed;
}

function isMostlyMath(value) {
  const withoutTextBlocks = value.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{[^{}]*\}/g, '');
  const withoutCommands = withoutTextBlocks
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\\([{}()[\],;|])/g, '$1');
  const words = (withoutCommands.match(/[A-Za-z]{2,}/g) || [])
    .filter(word => !MATH_WORD_RE.test(word))
    .filter(word => !/^(?:d[xyztun]|mg|kg|cm|mm|dm|km|ms|mol|rad|hz|pa|ev|kw|w|j|n|v|a|c)$/i.test(word));
  if (words.length > 0) return false;

  const leftovers = withoutCommands.replace(/[0-9A-Za-z\s{}()[\]^_+\-=*/<>.,;:|&'!−–⋅·]/g, '');
  return leftovers.length === 0;
}

function findNumeratorStart(input, end) {
  const lastChar = input[end - 1];

  if (lastChar === ')' || lastChar === ']' || lastChar === '}') {
    const groupStart = findMatchingBackward(input, end - 1);
    if (groupStart >= 0) {
      const markerIndex = groupStart - 1;
      if (input[markerIndex] === '^' || input[markerIndex] === '_') {
        return findAtomStart(input, markerIndex);
      }
      const command = input.slice(0, groupStart).match(/\\[A-Za-z]+\s*$/);
      if (command?.index !== undefined) return command.index;
      return groupStart;
    }
  }

  let depth = 0;
  for (let i = end - 1; i >= 0; i--) {
    const char = input[i];
    if (char === ')' || char === ']' || char === '}') depth++;
    if (char === '(' || char === '[' || char === '{') depth--;

    if (depth === 0 && (char === '+' || char === '-') && i > 0) {
      return i + 1;
    }

    if (depth === 0 && isTermSeparator(input, i)) {
      return i + 1;
    }
  }

  const left = input.slice(0, end);
  if (isMostlyMath(left)) return 0;

  const whitespace = left.search(/\S+\s*$/);
  return whitespace >= 0 ? whitespace : 0;
}

function splitDenominatorSuffix(raw) {
  const condition = raw.match(/^([\s\S]*?)(\s+\([^)]*(?:\\ne|\\le|\\ge|=|<|>)[^)]*\)\s*)$/);
  if (condition?.[1]?.trim()) {
    return {
      denominator: condition[1].trim(),
      suffix: condition[2],
    };
  }

  const trimmed = raw.trim();
  if (/[。．]$/.test(trimmed) || (trimmed.endsWith('.') && !/\d+\.\d+$/.test(trimmed))) {
    return {
      denominator: trimmed.slice(0, -1).trim(),
      suffix: trimmed.slice(-1),
    };
  }

  return { denominator: trimmed, suffix: '' };
}

function readDenominator(input, start) {
  let j = start;
  while (j < input.length && /\s/.test(input[j])) j++;
  if (j >= input.length) return null;

  if (input[j] === '(' || input[j] === '[' || input[j] === '{') {
    const end = findMatchingForward(input, j);
    if (end < 0) return null;

    return {
      end: end + 1,
      denominator: stripOuterGroup(input.slice(j, end + 1)),
      suffix: '',
    };
  }

  let depth = 0;
  let end = j;
  while (end < input.length) {
    const char = input[end];
    if (char === '(' || char === '[' || char === '{') depth++;
    if (char === ')' || char === ']' || char === '}') depth--;
    if (depth <= 0 && isTermSeparator(input, end) && !(end === j && /[+-]/.test(char))) break;
    end++;
  }

  const split = splitDenominatorSuffix(input.slice(j, end));
  return {
    end,
    denominator: split.denominator,
    suffix: split.suffix,
  };
}

function isUsableOperand(value) {
  if (!value || value.includes('://') || value.includes('/')) return false;
  if (!/[A-Za-z0-9\\]/.test(value)) return false;
  if (/^\\?(?:sin|cos|tan|cot|sec|csc|log|ln|lg|lim)$/i.test(value.trim())) return false;
  return isMostlyMath(value);
}

function convertOnePlainFraction(input) {
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '(' || char === '[' || char === '{') depth++;
    if (char === ')' || char === ']' || char === '}') depth--;

    if (char !== '/' || depth !== 0) continue;
    if (input[i - 1] === '\\' || input[i - 1] === ':' || input[i - 1] === '/' || input[i + 1] === '/') continue;

    let leftEnd = i;
    while (leftEnd > 0 && /\s/.test(input[leftEnd - 1])) leftEnd--;

    const numeratorStart = findNumeratorStart(input, leftEnd);
    const numerator = stripOuterGroup(input.slice(numeratorStart, leftEnd));
    const denominatorData = readDenominator(input, i + 1);
    if (!denominatorData) continue;

    const denominator = stripOuterGroup(denominatorData.denominator);
    if (!isUsableOperand(numerator) || !isUsableOperand(denominator)) continue;

    return {
      value: `${input.slice(0, numeratorStart)}\\frac{${numerator}}{${denominator}}${denominatorData.suffix}${input.slice(denominatorData.end)}`,
      changed: true,
    };
  }

  return { value: input, changed: false };
}

export function normalizePlainFractions(input) {
  let current = input;

  for (let i = 0; i < 10; i++) {
    const next = convertOnePlainFraction(current);
    if (!next.changed) return current;
    current = next.value;
  }

  return current;
}

export function normalizeMathText(input) {
  return normalizePlainFractions(
    normalizeLooseMathSyntax(
      normalizeMathUnicode(repairMathFormatArtifacts(input, { wrapIntervalAssignments: false })).replace(/\r\n?/g, '\n'),
    ),
  );
}

export function normalizeLatexMath(input) {
  const rowBreaks = [];
  const protectedInput = String(input || '').replace(/\\\\(?=\s*\[[^\]\n]{1,24}\])/g, (rowBreak) => {
    const token = `\uE002ROW_BREAK_${rowBreaks.length}\uE003`;
    rowBreaks.push(rowBreak);
    return token;
  });
  return repairEscapedMathWordsInProse(repairSetBuilderAbsoluteValues(escapeSetLiteralBraces(normalizeSuperscriptSyntax(
    normalizeLostSuperscripts(normalizeMathText(protectedInput)
      .replace(/\\d(?=\s*(?:\(|_))/g, 'd')
      .replace(/(^|[^\\])\\[ \t]+/g, '$1 ')
      .replace(/[ \t]*\n[ \t]*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()),
  )))).replace(/\uE002ROW_BREAK_(\d+)\uE003/g, (_, index) => rowBreaks[Number(index)] || '\\\\');
}

export function isLikelyLooseMathLine(input) {
  const normalized = normalizeLatexMath(input);
  if (!normalized) return false;
  if (!/[=+\-*/^_<>]|\\(?:frac|sqrt|ne|le|ge|times|div|cdot|sin|cos|tan|cot|sec|csc|log|ln|lg|lim|sum|int|mathbb|infty|emptyset|in|notin|setminus|cup|cap|binom|circ|Rightarrow|Leftrightarrow|to|approx)\b/.test(normalized)) return false;
  return isMostlyMath(normalized);
}

function isMathishChar(char) {
  return /[A-Za-z0-9\\{}()[\]^_+\-*/=<>.,;|\s'!−–⋅·]/.test(char) && !/[À-ỹ]/.test(char);
}

function isAsciiLetterBeforeVietnamese(input, index) {
  return /[A-Za-z]/.test(input[index] || '') && /[À-ỹ]/.test(input[index + 1] || '');
}

function isBoundaryAfterVietnameseWord(input, index) {
  if (!/\s/.test(input[index - 1] || '')) return false;
  const before = input.slice(0, index - 1).match(/(\S+)$/)?.[1] || '';
  return /[À-ỹ]/.test(before);
}

function hasBalancedMathGroups(input) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (input[i - 1] === '\\') continue;
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char);
    } else if (char === ')' || char === ']' || char === '}') {
      const open = stack.pop();
      const isIntervalClose =
        (char === ')' && open === '[') ||
        (char === ']' && open === '(');
      if (open !== pairs[char] && !isIntervalClose) return false;
    }
  }

  return stack.length === 0;
}

function wrapRawFormulaRuns(input) {
  return input
    .split(WRAPPED_MATH_RE)
    .map((part) => {
      if (
        !part ||
        part.startsWith('\\(') ||
        part.startsWith('\\[') ||
        part.startsWith('$$') ||
        part.startsWith('$')
      ) return part;

      return part.replace(
        /(^|[\s:：为是得])([A-Za-z][A-Za-z0-9_']*\s*(?:=|<|>|\\le|\\ge|\\ne|\\approx)\s*[^。；;，,\n]{1,180})/g,
        (match, prefix, formula) => {
          const raw = String(formula || '').trim();
          if (!/[=<>^_\\/]|\\[A-Za-z]+|\d|sin|cos|tan|log|sqrt|frac|theta|alpha|beta|gamma|mu|pi/i.test(raw)) {
            return match;
          }

          const normalized = normalizeLatexMath(raw);
          if (!normalized || !isMostlyMath(normalized) || !hasBalancedMathGroups(normalized)) return match;
          return `${prefix}\\(${normalized}\\)`;
        },
      );
    })
    .join('');
}

function escapeSetLiteralBraces(input) {
  let out = '';
  let cursor = 0;

  while (cursor < input.length) {
    const openIndex = input.indexOf('{', cursor);
    if (openIndex < 0) {
      out += input.slice(cursor);
      break;
    }

    const before = input[openIndex - 1] || '';
    const commandArgPrefix = input.slice(Math.max(0, openIndex - 240), openIndex);
    const isCommandArg =
      /\\(?:frac|dfrac|tfrac|binom|sqrt|mathbb|mathrm|mathbf|operatorname|text|vec|bar|hat|tilde)\s*$/.test(commandArgPrefix) ||
      /\\(?:frac|dfrac|tfrac|binom)\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*$/.test(commandArgPrefix);
    if (before === '\\' || before === '_' || before === '^' || isCommandArg) {
      out += input.slice(cursor, openIndex + 1);
      cursor = openIndex + 1;
      continue;
    }

    const closeIndex = findMatchingForward(input, openIndex);
    if (closeIndex < 0) {
      out += input.slice(cursor);
      break;
    }

    const content = input.slice(openIndex + 1, closeIndex);
    const normalizedSetBuilderContent = content
      .replace(/\\in\s*Z\b/g, '\\in \\mathbb{Z}')
      .replace(/\\in\s*N\b/g, '\\in \\mathbb{N}')
      .replace(/\\in\s*R\b/g, '\\in \\mathbb{R}')
      .replace(/(\\(?:notin|in)\s*(?:\\mathbb\{[A-Z]\}|[A-Za-z]+)\s*)\|/, '$1\\mid ');
    const hasPlainSetBuilderBar =
      /\|/.test(content) &&
      /[<>=]|\\(?:in|notin)\b/.test(content) &&
      !/\\(?:sqrt|frac|dfrac|tfrac|sin|cos|tan|cot|sec|csc|log|ln|lg|left|right)\b/.test(content);
    const looksLikeSetLiteral =
      ( /[,;\uff0c\uff1b]/.test(content) ||
        /(?:\\in|\\notin|\\mid)/.test(content) ||
        hasPlainSetBuilderBar
      ) &&
      /\S/.test(content);

    if (!looksLikeSetLiteral) {
      out += input.slice(cursor, closeIndex + 1);
      cursor = closeIndex + 1;
      continue;
    }

    out += `${input.slice(cursor, openIndex)}\\{${normalizedSetBuilderContent}\\}`;
    cursor = closeIndex + 1;
  }

  return out;
}

function normalizeLostSuperscripts(input) {
  return input
    .replace(/\bf\s*\^?\s*-\s*1\s*\(/gi, 'f^{-1}(')
    .replace(/\b([A-Za-z])([2-9])\b/g, '$1^{$2}');
}

function normalizeSuperscriptSyntax(input) {
  return input
    .replace(/\^\s*\{\s*([^{}]+?)\s*\}/g, '^{$1}')
    .replace(/\^\s*([+-]?\d+|[A-Za-z]|\\[A-Za-z]+)(?![A-Za-z])/g, '^{$1}');
}

function splitLeadingListMarker(raw) {
  const option = raw.match(/^(\s*(?:[A-H]|\d{1,3})[.．、]\s*(?:\\quad\s*)?)([\s\S]+)$/);
  if (option) {
    const prefix = option[1].replace(/\\quad\s*/g, '').replace(/\\[ \t]+/g, ' ').trimEnd();
    return {
      prefix: prefix ? `${prefix} ` : '',
      math: option[2],
    };
  }

  return { prefix: '', math: raw };
}

function wrapEqualMathInPlainText(input) {
  let out = '';
  let cursor = 0;

  while (cursor < input.length) {
    const relation = input.slice(cursor).match(/=|<|>|\\(?:le|leq|ge|geq|ne|neq)(?![A-Za-z])/);
    if (!relation || relation.index === undefined) break;

    const relationIndex = cursor + relation.index;
    const wrappedMathEnd = getWrappedMathEndAt(input, relationIndex);
    if (wrappedMathEnd > relationIndex) {
      out += input.slice(cursor, wrappedMathEnd);
      cursor = wrappedMathEnd;
      continue;
    }

    let start = relationIndex;
    while (
      start > cursor &&
      isMathishChar(input[start - 1]) &&
      !isBoundaryAfterVietnameseWord(input, start) &&
      !/[.!?]\s*$/.test(input.slice(Math.max(cursor, start - 3), start))
    ) start--;

    let end = relationIndex + relation[0].length;
    while (
      end < input.length &&
      isMathishChar(input[end]) &&
      !isAsciiLetterBeforeVietnamese(input, end) &&
      !/^[.!?]\s+[A-Z]/.test(input.slice(end, end + 4))
    ) end++;

    const rawCandidate = input.slice(start, end);
    const leadingWhitespace = rawCandidate.match(/^\s*/)?.[0] || '';
    const trailingWhitespace = rawCandidate.match(/\s*$/)?.[0] || '';
    const coreCandidate = rawCandidate.slice(leadingWhitespace.length, rawCandidate.length - trailingWhitespace.length);
    const { prefix, math } = splitLeadingListMarker(coreCandidate);
    const normalized = normalizeLatexMath(math);

    if (
      !normalized ||
      !/(?:=|<|>|\\(?:le|leq|ge|geq|ne|neq)(?![A-Za-z]))/.test(normalized) ||
      !isMostlyMath(normalized) ||
      !hasBalancedMathGroups(normalized)
    ) {
      out += input.slice(cursor, relationIndex + relation[0].length);
      cursor = relationIndex + relation[0].length;
      continue;
    }

    out += input.slice(cursor, start);
    out += `${leadingWhitespace}${prefix}\\(${normalized}\\)${trailingWhitespace}`;
    cursor = end;
  }

  return out + input.slice(cursor);
}

function wrapStandaloneFractions(input) {
  return input.replace(/\\frac\{(?:[^{}]|\{[^{}]*\})+\}\{(?:[^{}]|\{[^{}]*\})+\}/g, (match, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 3), offset);
    const after = whole.slice(offset + match.length, offset + match.length + 3);
    if (
      whole[offset - 1] === '\\' ||
      whole[offset - 1] === '$' ||
      latexGroupDepthAt(whole, offset) > 0 ||
      before.includes('\\(') ||
      before.includes('$') ||
      after.includes('\\)') ||
      after.includes('$') ||
      isInsideWrappedMath(whole, offset)
    ) return match;
    const normalized = normalizeLatexMath(match);
    return hasBalancedMathGroups(normalized) ? `\\(${normalized}\\)` : match;
  });
}

function isInsideWrappedMath(input, offset) {
  return getWrappedMathEndAt(input, offset) > offset;
}

function getWrappedMathEndAt(input, offset) {
  for (const match of input.matchAll(WRAPPED_MATH_RE)) {
    const start = match.index ?? -1;
    const end = start + match[0].length;
    if (start >= 0 && offset > start && offset < end) return end;
  }
  return -1;
}

function latexGroupDepthAt(input, offset) {
  let depth = 0;

  for (let i = 0; i < offset; i++) {
    if (input[i - 1] === '\\') continue;
    if (input[i] === '{') depth++;
    if (input[i] === '}') depth = Math.max(0, depth - 1);
  }

  return depth;
}

function wrapMathMatch(input, pattern) {
  return input.replace(pattern, (match, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 3), offset);
    const after = whole.slice(offset + match.length, offset + match.length + 3);
    if (
      whole[offset - 1] === '\\' ||
      whole[offset - 1] === '$' ||
      before.includes('\\(') ||
      before.includes('$') ||
      after.includes('\\)') ||
      after.includes('$') ||
      isInsideWrappedMath(whole, offset)
    ) return match;

    return `\\(${normalizeLatexMath(match)}\\)`;
  });
}

function wrapIntervalExpressions(input) {
  const endpoint = String.raw`[+\-]?(?:\\infty|(?:\\pi|[A-Za-z0-9]+)(?:\^\{?[\w+\-]+\}?)?)`;
  const interval = String.raw`[\[(]\s*${endpoint}\s*,\s*${endpoint}\s*[\])]`;
  const pattern = new RegExp(`${interval}(?:\\s*\\\\cup\\s*${interval})*`, 'g');
  return wrapMathMatch(input, pattern);
}

function wrapPowerExpressions(input) {
  return wrapMathMatch(
    input,
    /\b(?:[A-Za-z]|[0-9]+|\\[A-Za-z]+)\s*\^\s*(?:\{[^{}]+\}|[+-]?\d+|[A-Za-z])\b/g,
  );
}

function wrapSubscriptExpressions(input) {
  return wrapMathMatch(
    input,
    /\b[A-Za-z]\s*_\s*(?:\{[^{}]+\}|[A-Za-z0-9]+)/g,
  );
}

function wrapPointCoordinateExpressions(input) {
  return wrapMathMatch(
    input,
    /\b[A-Z]\s*\(\s*[^()（）;；]{1,80}[;；]\s*[^()（）]{1,80}\)/g,
  );
}

function wrapCommandExpressionsInSegment(segment) {
  let out = '';
  let cursor = 0;

  while (cursor < segment.length) {
    const rest = segment.slice(cursor);
    const match = rest.match(INLINE_MATH_COMMAND_RE);
    if (!match || match.index === undefined) {
      out += rest;
      break;
    }

    const commandIndex = cursor + match.index;
    let start = commandIndex;
    let end = commandIndex + match[0].length;

    while (start > cursor && isMathishChar(segment[start - 1]) && !isBoundaryAfterVietnameseWord(segment, start)) start--;
    while (end < segment.length && isMathishChar(segment[end]) && !isAsciiLetterBeforeVietnamese(segment, end)) end++;

    const raw = segment.slice(start, end);
    const leading = raw.match(/^\s*/)?.[0] || '';
    const trailing = raw.match(/\s*$/)?.[0] || '';
    const core = raw.slice(leading.length, raw.length - trailing.length);
    const normalized = normalizeLatexMath(core);

    out += segment.slice(cursor, start);
    out += normalized && isMostlyMath(normalized) && hasBalancedMathGroups(normalized)
      ? `${leading}\\(${normalized}\\)${trailing}`
      : raw;
    cursor = end;
  }

  return out;
}

function wrapCommandExpressions(input) {
  return input
    .split(WRAPPED_MATH_RE)
    .map(segment => {
      if (
        !segment ||
        segment.startsWith('\\(') ||
        segment.startsWith('\\[') ||
        segment.startsWith('$$') ||
        segment.startsWith('$')
      ) return segment;

      return wrapCommandExpressionsInSegment(segment);
    })
    .join('');
}

function applyUndelimitedMathWraps(input) {
  return wrapCommandExpressions(wrapSubscriptExpressions(wrapPowerExpressions(wrapIntervalExpressions(wrapStandaloneFractions(wrapPointCoordinateExpressions(input))))));
}

function mergeAdjacentInlineMath(input) {
  return input
    .replace(/(^|[^\w\\])-\s*\\\((\\frac[\s\S]*?)\\\)/g, '$1\\(-$2\\)')
    .replace(/\\\)\\\(,\s*/g, ', ')
    .replace(/\\\)[ \t]+\\\(/g, ' ');
}

function repairMalformedInlineDollarDelimiters(input) {
  return input
    .replace(/\$\$([^$\n]{1,240}?)\$(?!\$)/g, (_, formula) => `\\(${formula.trim()}\\)`)
    .replace(/\$\$([^$\n]{1,240}?)(?=(?:[。.;]|$|\n))/g, (_, formula) => `\\(${formula.trim()}\\)`)
    .replace(/\$\$?/g, (match, offset, whole) => {
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + match.length);
    const lineBefore = before.slice(before.lastIndexOf('\n') + 1);
    const nextNewline = after.indexOf('\n');
    const lineAfter = nextNewline >= 0 ? after.slice(0, nextNewline) : after;
    const isLineStart = lineBefore.trim().length === 0;
    const isLineEnd = lineAfter.trim().length === 0;

    if (match === '$$' && (isLineStart || isLineEnd)) return match;

    const prev = before.match(/\S\s*$/)?.[0]?.trim() || '';
    const next = after.match(/^\s*\S/)?.[0]?.trim() || '';
    const hasPairedDollarOnLine = match === '$' && (/^[^\n$]*\$/.test(after) || /\$[^\n$]*$/.test(before));
    if (hasPairedDollarOnLine) return match;

    const touchesMathOperator =
      /[=<>+\-*/({[,;:|]$/.test(prev) ||
      /^[=<>+\-*/)}\],.;:|]/.test(next) ||
      /\\(?:Rightarrow|Leftrightarrow|to)\s*$/.test(before) ||
      /^\\(?:Rightarrow|Leftrightarrow|to)\b/.test(after.trimStart());

    if (match === '$$' && touchesMathOperator) return '';
    if (match === '$' && touchesMathOperator) return '';

    return match;
  });
}

function cleanStackedMathLine(value) {
  return String(value || '').replace(/[\u200b-\u200f\ufeff\u2060]/g, '').trim();
}

function isStackedMathFragmentLine(value) {
  const text = cleanStackedMathLine(value);
  if (!text || text.length > 24) return false;
  if (/\\\(|\\\[|\$\$?/.test(text)) return false;
  if (/[\u4e00-\u9fff]/.test(text)) return false;

  const compact = text.replace(/\s+/g, '');
  if (!compact || compact.length > 24) return false;
  const mathOnly = /^(?:log|ln|lg|sin|cos|tan|cot|sec|csc|sqrt|lim|[A-Za-z0-9+\-−–*/=<>≤≥≠≈∈∉∩∪∖\\|∣()[\]{}.,;，；:_^⁡°∞!⋅·]+)$/iu.test(compact);
  if (!mathOnly) return false;
  return (
    /^(?:log|ln|lg|sin|cos|tan|cot|sec|csc|sqrt|lim)$/iu.test(compact) ||
    /^[A-Za-z]$/.test(compact) ||
    /^[0-9]+$/.test(compact) ||
    /^[+\-−–*/=<>≤≥≠≈∈∉∩∪∖\\|∣()[\]{}.,;，；:_^⁡°∞!⋅·]+$/u.test(compact)
  );
}

function compactStackedMathText(value) {
  return cleanStackedMathLine(value).replace(/[\s.,;:\u3001\uff0c\u3002\uff1b\uff1a]/g, '');
}

function hasRenderedDuplicateAfter(lines, cursor, signal) {
  const compactSignal = compactStackedMathText(signal);
  if (compactSignal.length < 2) return false;

  let checked = 0;
  for (let index = cursor; index < lines.length && checked < 3; index += 1) {
    const compactLine = compactStackedMathText(lines[index]);
    if (!compactLine) continue;
    checked += 1;
    if (
      compactLine.includes(compactSignal) ||
      (compactSignal.length >= 2 && compactLine.startsWith(compactSignal))
    ) {
      return true;
    }
  }

  return false;
}

function stripStackedOcrMathFragments(input) {
  const lines = String(input || '').split(/\r?\n/);
  const kept = [];

  for (let index = 0; index < lines.length;) {
    if (!isStackedMathFragmentLine(lines[index])) {
      kept.push(lines[index]);
      index += 1;
      continue;
    }

    const start = index;
    let cursor = index;
    let fragmentCount = 0;
    let signal = '';
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (!cleanStackedMathLine(line)) {
        cursor += 1;
        continue;
      }
      if (!isStackedMathFragmentLine(line)) break;
      fragmentCount += 1;
      signal += cleanStackedMathLine(line);
      cursor += 1;
    }

    const hasRenderedDuplicate = hasRenderedDuplicateAfter(lines, cursor, signal);
    const isShortPrefixDuplicate = fragmentCount === 1 && compactStackedMathText(signal).length >= 2;
    if ((fragmentCount >= 3 || isShortPrefixDuplicate) && hasRenderedDuplicate) {
      if (kept.length && cleanStackedMathLine(kept[kept.length - 1]) === '') kept.pop();
      index = cursor;
      continue;
    }

    kept.push(...lines.slice(start, cursor));
    index = cursor;
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function repairEscapedMathWordsInProse(input) {
  return String(input || '')
    .replace(/(^|[\s([{"'“‘:;,.!?-])U\\sin\s+g\b/g, '$1Using')
    .replace(/(^|[\s([{"'“‘:;,.!?-])u\\sin\s+g\b/g, '$1using')
    .replace(/(^|[\s([{"'“‘:;,.!?-])\\sin\s+ce\b/g, (match, prefix) => {
      return /(?:^|[\n.!?]\s*|:\s*)$/.test(prefix) ? `${prefix}Since` : `${prefix}since`;
    })
    .replace(/(^|[\s([{"'“‘:;,.!?-])\\tan\s+gent\b/g, '$1tangent')
    .replace(/(^|[\s([{"'“‘:;,.!?-])\\sec\s+ond\b/g, '$1second');
}

function repairGluedTransitionCommands(input) {
  return input
    .split(WRAPPED_MATH_RE)
    .map((part) => {
      if (
        !part ||
        part.startsWith('\\(') ||
        part.startsWith('\\[') ||
        part.startsWith('$$') ||
        part.startsWith('$')
      ) return part;

      return part
        .replace(
          /\\(Rightarrow|Leftarrow|Leftrightarrow|leftrightarrow|rightarrow|leftarrow|to)(?=[0-9+\-])/g,
          '\\$1 ',
        )
        .replace(
          /\\(Rightarrow|Leftarrow|Leftrightarrow|leftrightarrow|rightarrow|leftarrow|to)(?=[^\s\\()[\]{}$.,;:!?0-9+\-])/g,
          (_, command) => `\\(\\${command}\\) `,
        );
    })
    .join('');
}

function stripStandaloneFormattingPunctuation(input) {
  return input
    .split('\n')
    .filter((line) => !/^\s*[.:\uFF1A\u3002]\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function normalizeRichMathText(input) {
  if (!input) return '';

  const normalizeDisplayBlock = (block, isDollarBlock) => {
    const body = block.slice(2, -2);
    const rowBreaks = [];
    const protectedBody = body.replace(/\\\\(?=\s*\[[^\]\n]{1,24}\])/g, (rowBreak) => {
      const token = `\uE002ROW_BREAK_${rowBreaks.length}\uE003`;
      rowBreaks.push(rowBreak);
      return token;
    });
    const normalizedBody = normalizeLatexMath(protectedBody).replace(
      /\uE002ROW_BREAK_(\d+)\uE003/g,
      (_, index) => rowBreaks[Number(index)] || '\\\\',
    );
    return isDollarBlock ? `$$${normalizedBody}$$` : `\\[${normalizedBody}\\]`;
  };

  const displayBlocks = [];
  const protectedInput = String(input).replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g, (block) => {
    const token = `\uE000MATH_BLOCK_${displayBlocks.length}\uE001`;
    const isDollarBlock = block.startsWith('$$');
    displayBlocks.push(normalizeDisplayBlock(block, isDollarBlock));
    return token;
  });

  const unescapedInput = normalizeEscapedLatexBackslashes(protectedInput);
  const cleanedInput = stripStandaloneFormattingPunctuation(repairGluedTransitionCommands(unescapedInput));
  // Keep complete display blocks opaque. Applying prose math wrapping inside
  // aligned/cases/array environments inserts inline delimiters into LaTeX and
  // makes otherwise valid solutions render as broken text.
  const displayRuleInput = cleanedInput
    .split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\])/g)
    .map((part) => (part.startsWith('$$') || part.startsWith('\\[')
      ? part
      : applyDisplayLatexInputRules(repairEscapedMathWordsInProse(part))))
    .join('');
  const repairedInput = repairMalformedInlineDollarDelimiters(stripStackedOcrMathFragments(displayRuleInput));
  const normalized = repairedInput
    .split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]*\$|`[^`\n]*`)/g)
    .map((part) => {
      if (!part || part.startsWith('`')) return part;

      if (part.startsWith('\\(') && part.endsWith('\\)')) {
        return `\\(${normalizeLatexMath(part.slice(2, -2))}\\)`;
      }

      if (part.startsWith('\\[') && part.endsWith('\\]')) {
        return `\\[${normalizeLatexMath(part.slice(2, -2))}\\]`;
      }

      if (part.startsWith('$$') && part.endsWith('$$')) {
        return `$$${normalizeLatexMath(part.slice(2, -2))}$$`;
      }

      if (part.startsWith('$') && part.endsWith('$')) {
        return `$${normalizeLatexMath(part.slice(1, -1))}$`;
      }

      const normalizedText = repairEscapedMathWordsInProse(repairMathFormatArtifacts(part))
        .replace(/(^|[^\\])\\[ \t]+/g, '$1 ');
      const withEqualMath = wrapEqualMathInPlainText(wrapRawFormulaRuns(normalizedText));
      return withEqualMath
        .split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g)
        .map((segment) => {
          if (
            segment.startsWith('\\(') ||
            segment.startsWith('\\[') ||
            segment.startsWith('$$') ||
            segment.startsWith('$')
          ) return segment;

          return applyUndelimitedMathWraps(segment);
        })
        .join('');
    })
    .join('');

  const repairedUnmatchedDollars = normalized
    .replace(/(^|\n)([^\n$]*\\(?:sin|cos|tan|cot|sec|csc|log|ln|lg|sqrt|frac|left|right|pi|cap|cup|setminus)[^\n$]*)\$(?=\n|$)/g, (_, prefix, formula) => `${prefix}\\(${String(formula).trim()}\\)`)
    .replace(/(^|\n)\$([^\n$]*\\(?:sin|cos|tan|cot|sec|csc|log|ln|lg|sqrt|frac|left|right|pi|cap|cup|setminus)[^\n$]*)(?=\n|$)/g, (_, prefix, formula) => `${prefix}\\(${String(formula).trim()}\\)`);

  const output = applyDisplayLatexOutputRules(mergeAdjacentInlineMath(repairedUnmatchedDollars));
  return output.replace(/\uE000MATH_BLOCK_(\d+)\uE001/g, (_, index) => displayBlocks[Number(index)] || '');
}

export function normalizeAdminMathInputText(input) {
  if (!input) return '';

  return normalizeRichMathText(repairMathFormatArtifacts(input));
}
