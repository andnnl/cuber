// Change observer notation only. Never rotate the actual puzzle or modify its F2L target.
const FACE_MAP = {
    F: {F:'F',R:'R',B:'B',L:'L'},
    L: {F:'L',R:'F',B:'R',L:'B'},
    B: {F:'B',R:'L',B:'F',L:'R'},
    R: {F:'R',R:'B',B:'L',L:'F'},
};
const FRONTS = ['F','L','B','R'];
export function relativeMove(move, front) {
    const face = move[0];
    return (FACE_MAP[front]?.[face] ?? face) + move.slice(1);
}
export function moveInView(move, front) {
    const face = move[0];
    const mapped = FACE_MAP[front];
    if (!mapped) throw new Error(`无效观察正面：${front}`);
    return (Object.keys(mapped).find(key => mapped[key] === face) ?? face) + move.slice(1);
}
export function slotInView(slot, front) {
    const faces = [...slot].map(face => moveInView(face,front)).sort();
    const name = faces.join('');
    if (!['FR','FL','BR','BL'].includes(name)) throw new Error(`无效 F2L 槽位：${slot}`);
    return name;
}

// Scores only the solver-returned paths; never claims to enumerate every valid solution.
export function recommendExistingViews(solutions, scoreGrip) {
    return FRONTS.map(front => {
        const ranked = [];
        const byFormula = new Map();
        solutions.forEach((solution, sourceIndex) => {
            const physical = solution.moves;
            const slots = solution.slots ?? (solution.slot ? [solution.slot] : []);
            const viewed = physical.map(move => moveInView(move,front));
            const viewSlots = slots.map(slot => slotInView(slot,front));
            const key = viewed.join(' ');
            const previous = byFormula.get(key);
            if (previous) {
                for (const slot of viewSlots) if (!previous.slots.includes(slot)) previous.slots.push(slot);
                previous.sourceIndices.push(sourceIndex);
                return;
            }
            const route = scoreGrip(viewed);
            if (!route) return;
            const entry = {sourceIndex, sourceIndices:[sourceIndex], moves:viewed, slots:viewSlots, route};
            byFormula.set(key, entry);
            ranked.push(entry);
        });
        ranked.sort((a,b) => a.route.score - b.route.score
            || a.route.regrips - b.route.regrips
            || a.moves.length - b.moves.length
            || a.moves.join(' ').localeCompare(b.moves.join(' '))
            || a.sourceIndex - b.sourceIndex);
        return {front, solutions:ranked};
    });
}
