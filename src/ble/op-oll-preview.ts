import { OpItem, OpSimulator } from './op-case';
import { parseOpFormula } from './op-formula';

/** Fixed yellow-top/green-front case for recognising an OLL algorithm. */
export function previewOllFacelets(oll: OpItem, simulate: OpSimulator): string {
  return simulate(['z2', ...parseOpFormula(oll.origin).inverse]);
}
