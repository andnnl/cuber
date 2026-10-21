import {applyFaceletMove} from '../../ble/move-diff';
import {mapStep, orientationAt} from './notation';

export type FollowStatus = 'blocked' | 'ready' | 'paused' | 'view' | 'complete';
export interface FollowRoute {
  moves: string[];
  frames: {facelets: string}[];
}
export interface FollowState {
  route: FollowRoute;
  status: FollowStatus;
  cursor: number;
  confirmed: string;
  actual: string;
  generation: number;
  lastSerial: number | null;
  expected?: string;
  received?: string;
  reason?: string;
  partial?: boolean;
}

function stepStatus(route: FollowRoute, cursor: number): FollowStatus {
  if (cursor >= route.moves.length) return 'complete';
  const move = route.moves[cursor];
  if (move === 'y' || move === "y'") return 'view';
  return 'ready';
}

export function startFollow(route: FollowRoute,
  snapshot: {facelets: string | null; generation: number; lastMoveSerial?: number | null}): FollowState {
  const start = route.frames[0]?.facelets || '';
  const blocked = !start || start !== snapshot.facelets || route.frames.length !== route.moves.length + 1;
  return {route, status: blocked ? 'blocked' : stepStatus(route, 0), cursor: 0,
    confirmed: start, actual: snapshot.facelets || '', generation: snapshot.generation,
    lastSerial: snapshot.lastMoveSerial ?? null,
    reason: blocked ? '实体魔方状态与解法起点不一致' : undefined};
}

export function reduceFollow(state: FollowState,
  event: {type: string; move: string; serial?: number; recovered?: boolean}): FollowState {
  if (event.type !== 'move' || event.recovered || state.status === 'blocked' || state.status === 'complete') return state;
  if (typeof event.serial === 'number' && state.lastSerial !== null && event.serial <= state.lastSerial) return state;
  const lastSerial = typeof event.serial === 'number' ? event.serial : state.lastSerial;
  const actual = applyFaceletMove(state.actual, event.move);
  if (!actual) return {...state, status:'paused', reason:`设备动作无法识别：${event.move}`, lastSerial};
  if (state.partial && actual === state.confirmed) return {...state, actual, lastSerial, partial:false,
    status:stepStatus(state.route, state.cursor), reason:undefined, expected:undefined, received:undefined};
  if (state.status === 'paused') {
    if (actual === state.confirmed) return {...state, actual, lastSerial, status:stepStatus(state.route, state.cursor),
      expected:undefined, received:undefined, reason:undefined, partial:false};
    return {...state, actual, lastSerial};
  }
  if (state.status === 'view') return {...state, actual, lastSerial, status:'paused',
    reason:'请先确认持方视角', expected:state.route.moves[state.cursor], received:event.move};
  const expected = mapStep(state.route.moves[state.cursor], orientationAt(state.route.moves, state.cursor));
  if (expected.requiresPhysicalSnapshot) return {...state, status:'blocked', reason:'切片无法由设备动作验证，仅支持 3D 播放'};
  const next = state.route.frames[state.cursor + 1].facelets;
  const double = expected.physicalMove?.endsWith('2');
  const quarter = double ? expected.physicalMove!.slice(0, -1) : '';
  if (double && !state.partial && event.move === quarter) return {...state, actual, lastSerial,
    partial:true, reason:`${expected.physicalMove} 已转半程，请再转一次 ${quarter}`};
  const matchingMove = event.move === expected.physicalMove || double && state.partial && event.move === quarter;
  if (!matchingMove || actual !== next) return {...state, actual, lastSerial, partial:false,
    status:'paused', expected:expected.physicalMove, received:event.move, reason:'实际转动与推荐步骤不一致'};
  const cursor = state.cursor + 1;
  return {...state, actual, confirmed:actual, cursor, lastSerial, partial:false, status:stepStatus(state.route, cursor),
    expected:undefined, received:undefined, reason:undefined};
}

export function confirmView(state: FollowState): FollowState {
  if (state.status !== 'view') throw new Error('当前不在视角确认步骤');
  const cursor = state.cursor + 1;
  if (state.actual !== state.route.frames[cursor].facelets) throw new Error('视角变化不能改变实体块状态');
  return {...state, cursor, confirmed:state.actual, status:stepStatus(state.route, cursor)};
}

export function pauseFollow(state: FollowState, reason: string): FollowState {
  return {...state, status:'paused', reason};
}
