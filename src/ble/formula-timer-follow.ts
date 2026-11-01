/** 蓝牙记号始终以实体魔方中心为基准；题面/鼠标整体转后须换成画面所在层。 */
import Cube from '../cuber/cube';
import { TwistAction } from '../cuber/twister';
const faces = 'URFDLB';
const centers = [4, 13, 22, 31, 40, 49];

export function displayPhysicalMove(move: string, facelets: string): string | null {
  if (!/^[URFDLBurfdlb](?:2|')?$/.test(move) || !/^[URFDLB]{54}$/.test(facelets)) return null;
  const displayedCenters = centers.map(index => facelets[index]);
  if (new Set(displayedCenters).size !== 6) return null;
  const physical = move[0].toUpperCase();
  const display = faces[displayedCenters.indexOf(physical)];
  if (!display) return null;
  return (move[0] === physical ? display : display.toLowerCase()) + move.slice(1);
}

/** 独立于动画队列推进显示题面；连续快拧时映射仍基于最新逻辑状态。 */
export function advanceDisplayedCube(cube: Cube, physicalMove: string): string | null {
  const displayedMove = displayPhysicalMove(physicalMove, cube.serialize());
  if (!displayedMove) return null;
  cube.twister.twist(new TwistAction(displayedMove), true, true);
  return displayedMove;
}
