import type { GripRoute } from './recommendations';

/** The WASM grip scorer uses Move names rather than the UI's wide-turn notation. */
export function gripTokens(moves: string[]): string[] {
  return moves.map(move => /^[ud](?:')?$/.test(move) ? `Uw${move.slice(1)}` : move);
}

/** Keep every step tied to the displayed/playable move, including white-bottom d turns. */
export function displayWideGripRoute(route: GripRoute, moves: string[]): GripRoute {
  if (route.steps.length !== moves.length) throw new Error('宽转指法步数与公式不一致');
  return { ...route, estimated: moves.some(move => move[0] === 'd'),
    steps: route.steps.map((step, index) => {
      const movement = moves[index];
      if (movement[0] !== 'd') return { ...step, movement };
      const action = movement.endsWith("'") ? '逆向' : '顺向';
      return { ...step, movement, thumb_instruction: '',
        instruction: `下两层${action}转动 ${movement}；双手扶稳上层，使用下层手指配合转动（触点待核验）` };
    }) };
}
