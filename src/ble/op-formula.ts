import { TwistNode } from '../cuber/twister';

export type ParsedOpFormula = { moves: string[]; inverse: string[]; openingAuf: string | null };

/** TwistNode tolerates unknown text; reject it before passing user input to that parser. */
export function parseOpFormula(source: string): ParsedOpFormula {
  const expression = source.replace(/[‘＇’]/g, "'").trim();
  if (!expression) throw Error('公式为空');
  if (expression.length > 500) throw Error('公式过长');
  const tokens = expression.match(/(?:[URFDLBMESxyzurfdlbmes][wW]?(?:'?[1-9]?'?)?|[()[\],:]|[1-9]'?)/g) || [];
  if (tokens.join('') !== expression.replace(/\s/g, '')) throw Error('公式包含不支持的符号或转动');
  const stack: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^[1-9]'?$/.test(token) && tokens[i - 1] !== ')' && tokens[i - 1] !== ']')
      throw Error('公式重复次数只能跟在括号后');
    if (token === '(' || token === '[') stack.push(token);
    if (token === ')' || token === ']') {
      if (stack.pop() !== (token === ')' ? '(' : '[')) throw Error('公式括号不匹配');
    }
  }
  if (stack.length) throw Error('公式括号不匹配');
  const node = new TwistNode(expression);
  const moves = node.parse().map(action => action.value).filter(Boolean);
  const inverse = node.parse(true).map(action => action.value).filter(Boolean);
  if (!moves.length || !inverse.length || moves.length > 250) throw Error('公式未解析出有效转动或过长');
  const openingAuf = /^(?:U|U'|U2)$/.test(moves[0]) ? moves[0] : null;
  return { moves, inverse, openingAuf };
}
