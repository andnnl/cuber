export interface CfopFrame {
  facelets: string;
  slots: string[];
  cross_solved: boolean;
}

export interface CfopStage {
  target: string;
  moves: string[];
  segments?: {start_step: number; end_step: number; completed_slots: string[]; restored_slots: string[]}[];
}

export interface CfopSegment {
  label: string;
  start: number;
  end: number;
  moves: string[];
  slot?: string;
}

export interface CfopRoute {
  input: string;
  moves: string[];
  frames: CfopFrame[];
  segments: CfopSegment[];
}

const VALID_MOVE = /^(?:[URFDLBS](?:2|')?|y'?)$/;
const VALID_STATE = /^[URFDLB]{54}$/;
const SLOTS = ['FR', 'FL', 'BL', 'BR'];

export function buildRoute(input: string, stages: CfopStage[], frames: CfopFrame[]): CfopRoute {
  if (!stages.length) throw new Error('没有首阶段');
  const moves = stages.reduce((out, stage) => out.concat(stage.moves), [] as string[]);
  if (frames.length !== moves.length + 1) throw new Error('路线帧数与动作数不一致');
  if (moves.some(move => !VALID_MOVE.test(move))) throw new Error('路线包含不支持的动作');
  for (const frame of frames) {
    if (!VALID_STATE.test(frame.facelets) || !Array.isArray(frame.slots) ||
        frame.slots.some(slot => SLOTS.indexOf(slot) < 0)) throw new Error('无效的路线状态帧');
  }
  const segments: CfopSegment[] = [];
  const crossEnd = stages[0].moves.length;
  segments.push({label: '十字', start: 0, end: crossEnd, moves: moves.slice(0, crossEnd)});
  const solved = new Set<string>();
  let group = 0;
  for (const slot of frames[crossEnd].slots) {
    if (solved.has(slot)) continue;
    solved.add(slot);
    group++;
    segments.push({label: `第 ${group} 组 F2L · ${slot}（首阶段已完成）`, slot,
      start: crossEnd, end: crossEnd, moves: []});
  }
  let offset = crossEnd;
  for (const stage of stages.slice(1)) {
    const boundaries = stage.segments && stage.segments.length ? stage.segments.map(segment => {
      const start = offset + segment.start_step - 1;
      const end = offset + segment.end_step;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < offset || end > offset + stage.moves.length || end <= start)
        throw new Error('F2L 阶段动作边界越界');
      return {start, end, slots: segment.completed_slots};
    }) : [{start: offset, end: offset + stage.moves.length, slots: frames[offset + stage.moves.length].slots}];
    for (const boundary of boundaries) {
      const completed = boundary.slots.filter(slot => frames[boundary.end].slots.indexOf(slot) >= 0 && !solved.has(slot));
      for (const slot of completed) {
        group++;
        const others = completed.filter(other => other !== slot);
        segments.push({label: `第 ${group} 组 F2L · ${slot}${others.length ? `（同时完成 ${others.join('、')}）` : ''}`, slot,
          start: boundary.start, end: boundary.end, moves: moves.slice(boundary.start, boundary.end)});
        solved.add(slot);
      }
    }
    offset += stage.moves.length;
  }
  return {input, moves, frames, segments};
}
