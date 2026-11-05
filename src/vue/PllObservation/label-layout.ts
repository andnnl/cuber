export type PllLabelAnchor = { key: string; text: string; x: number; y: number };
export type PllLabelBox = PllLabelAnchor & {
  left: number; top: number; width: number; height: number; lines: string[]; anchorX: number; anchorY: number;
};

function textWidth(text: string): number {
  return [...text].reduce((total,character) => total + (character.charCodeAt(0) > 255 ? 14 : 8), 0);
}

function wrapLabel(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const character of text) {
    if (line && textWidth(line + character) > width) { lines.push(line); line = ''; }
    line += character;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export function layoutPllLabels(anchors: PllLabelAnchor[], width: number, height: number): PllLabelBox[] {
  if (width < 40 || height < 40) return [];
  const margin = 8, gap = 6;
  const prepared = anchors.map((anchor,index) => {
    const lines = wrapLabel(anchor.text,width - margin * 2 - 16);
    return {...anchor,index,lines,width:Math.min(width - margin * 2,Math.max(32,...lines.map(textWidth)) + 16),
      height:lines.length * 18 + 10};
  }).sort((first,second) => second.width - first.width || first.index - second.index);
  const placed: PllLabelBox[] = [];
  for (const label of prepared) {
    const clampX = (center: number) => Math.max(margin + label.width / 2,Math.min(width - margin - label.width / 2,center));
    const clampY = (center: number) => Math.max(margin + label.height / 2,Math.min(height - margin - label.height / 2,center));
    const horizontal = [clampX(label.x),clampX(0),clampX(width)];
    const vertical = [clampY(label.y),clampY(0),clampY(height)];
    for (const other of placed) {
      horizontal.push(clampX(other.left - gap - label.width / 2),clampX(other.left + other.width + gap + label.width / 2));
      vertical.push(clampY(other.top - gap - label.height / 2),clampY(other.top + other.height + gap + label.height / 2));
    }
    let best: PllLabelBox | null = null;
    let bestScore = Infinity;
    for (const centerX of horizontal) for (const centerY of vertical) {
      const left = centerX - label.width / 2, top = centerY - label.height / 2;
      if (placed.some(other => left < other.left + other.width + gap && left + label.width + gap > other.left &&
        top < other.top + other.height + gap && top + label.height + gap > other.top)) continue;
      const score = (centerX - label.x) ** 2 + (centerY - label.y) ** 2;
      if (score < bestScore) {
        bestScore = score;
        best = {key:label.key,text:label.text,x:centerX,y:centerY,left,top,width:label.width,height:label.height,
          lines:label.lines,anchorX:label.x,anchorY:label.y};
      }
    }
    if (!best) {
      const centerX = clampX(label.x), centerY = clampY(label.y);
      best = {key:label.key,text:label.text,x:centerX,y:centerY,left:centerX - label.width / 2,top:centerY - label.height / 2,
        width:label.width,height:label.height,lines:label.lines,anchorX:label.x,anchorY:label.y};
    }
    placed.push(best);
  }
  return anchors.map(anchor => placed.find(label => label.key === anchor.key)!);
}
