# F2L Trainer Mode Design Doc

> **Date:** 2026-06-23
> **Status:** Approved
> **Feature:** Independent `?mode=f2l` F2L Trainer with piece-tracking and slot highlighting

---

## 1. Problem

Users want to learn F2L (First Two Layers) by studying standard cases. The existing `?mode=algs` can display and play F2L algorithms, but it lacks:

1. **Randomized training flow** — no drill mode, no progression
2. **Slot-specific highlighting** — cannot emphasize which F2L slot a case targets
3. **Piece-origin tracking** — cannot show where the corner/edge pieces *inside* a slot came from or where they go after the algorithm

## 2. Goal

Build a dedicated `?mode=f2l` page that:

- Loads F2L cases from `src/vue/Algs/algs.json`
- Shows a scramble state, then plays the algorithm with animation
- After animation, highlights:
  - The target F2L slot (if filled)
  - The original pieces that were in that slot and where they ended up

## 3. Architecture

### 3.1 New Files

```
src/
├── cuber/
│   └── f2l.ts                    # F2L_SLOTS definitions + helpers
├── vue/
│   └── F2LTrainer/
│       ├── index.ts              # Vue component + training state machine
│       ├── index.html            # Template
│       └── tracker.ts            # PieceTracker: before/after diff
└── index.ts                      # Modified: register case 'f2l'
```

### 3.2 Reused Infrastructure

| Component | Source | Role |
|-----------|--------|------|
| `World` / `Cube` | `src/cuber/world.ts`, `cube.ts` | 3D rendering, cube state |
| `Twister` | `src/cuber/twister.ts` | Animation queue |
| `Playbar` | `src/vue/Playbar/` | Playback controls |
| `Viewport` | `src/vue/Viewport/` | Three.js canvas |
| F2L cases | `src/vue/Algs/algs.json` | 41 cases with `name`, `origin`, `scramble` |

## 4. F2L Slot Model (`src/cuber/f2l.ts`)

Four slots, each with solver-layer indices and 3D engine `initial` indices:

```typescript
export interface F2LSlot {
  name: string;
  solverCorner: number;   // CubieCube corner index (0-7)
  solverEdge: number;     // CubieCube edge index (0-11)
  cornerIndex: number;    // 3D cubelet initial index
  edgeIndex: number;      // 3D cubelet initial index
}

export const F2L_SLOTS: F2LSlot[] = [
  {
    name: 'FR',
    solverCorner: 4,   // DFR
    solverEdge: 8,     // FR
    cornerIndex: 2,    // z=0,y=0,x=2 → 0*9+0*3+2 = 2
    edgeIndex: 5,      // z=0,y=1,x=2 → 0*9+1*3+2 = 5
  },
  {
    name: 'FL',
    solverCorner: 5,   // DFL
    solverEdge: 9,     // FL
    cornerIndex: 0,    // z=0,y=0,x=0
    edgeIndex: 3,      // z=0,y=1,x=0
  },
  {
    name: 'BL',
    solverCorner: 6,   // DBL
    solverEdge: 10,    // BL
    cornerIndex: 6,    // verified at implementation time
    edgeIndex: 9,      // verified at implementation time
  },
  {
    name: 'BR',
    solverCorner: 7,   // DBR
    solverEdge: 11,    // BR
    cornerIndex: 8,    // verified at implementation time
    edgeIndex: 7,      // verified at implementation time
  }
];
```

> Note: BL/BR 3D indices must be verified against `cubelet.ts`'s `index = z*order^2 + y*order + x` formula during implementation.

## 5. PieceTracker (`src/vue/F2LTrainer/tracker.ts`)

Records piece positions before and after an algorithm, then computes diffs.

```typescript
export interface PieceState {
  slot: number;
  visibleFaces: number[];
}

export interface PieceDiff {
  type: 'corner' | 'edge';
  fromSlot: number;
  toSlot: number;
  moved: boolean;
}

export class PieceTracker {
  private before: Map<number, PieceState> = new Map();

  snapshot(cube: Cube, slot: F2LSlot): void {
    this.before.clear();
    this.record(slot.cornerIndex, cube);
    this.record(slot.edgeIndex, cube);
  }

  diff(cube: Cube, slot: F2LSlot): PieceDiff[] {
    const diffs: PieceDiff[] = [];
    for (const [initialIndex] of this.before) {
      const before = this.before.get(initialIndex)!;
      const after = this.getState(cube.initials[initialIndex]);
      diffs.push({
        type: initialIndex === slot.cornerIndex ? 'corner' : 'edge',
        fromSlot: before.slot,
        toSlot: after.slot,
        moved: before.slot !== after.slot,
      });
    }
    return diffs;
  }

  private record(initialIndex: number, cube: Cube): void { /* ... */ }
  private getState(cubelet: Cubelet): PieceState { /* ... */ }
}
```

## 6. Highlight Mechanism

Use `cube.stick(initialIndex, face, color)` to temporarily recolor stickers. Because `Cubelet.LAMBERS`/`BASICS` are shared static materials, create per-highlight material instances to avoid global side effects.

```typescript
function highlightPiece(world: World, initialIndex: number, duration = 2000): void {
  const cubelet = world.cube.initials[initialIndex];
  const highlightMat = new THREE.MeshLambertMaterial({ color: 0xFF0080 });
  const highlightBasic = new THREE.MeshBasicMaterial({ color: 0xFF0080 });
  const saved: { sticker: THREE.Material; mirror: THREE.Material }[] = [];

  for (let f = 0; f < 6; f++) {
    const s = cubelet.stickers[f];
    const m = cubelet.mirrors[f];
    if (s.visible) {
      saved.push({ sticker: s.material, mirror: m.material });
      s.material = highlightMat;
      m.material = highlightBasic;
    }
  }

  setTimeout(() => {
    saved.forEach((orig, i) => {
      const faceIndex = cubelet.stickers.findIndex(s => s.visible && s.material === highlightMat);
      if (faceIndex >= 0) {
        cubelet.stickers[faceIndex].material = orig.sticker;
        cubelet.mirrors[faceIndex].material = orig.mirror;
      }
    });
    highlightMat.dispose();
    highlightBasic.dispose();
    world.dirty = true;
  }, duration);
}
```

## 7. Training State Machine

```
IDLE → SCRAMBLE_SHOWN → PLAYING → HIGHLIGHTING → IDLE
```

| State | Entry Action | Transitions |
|-------|-------------|-------------|
| IDLE | — | `randomCase()` / `loadCase()` → SCRAMBLE_SHOWN |
| SCRAMBLE_SHOWN | `twister.setup(scramble)` | `play()` → PLAYING |
| PLAYING | `tracker.snapshot()` then `twister.push(origin)` | animation end → HIGHLIGHTING |
| HIGHLIGHTING | `highlightResults(diffs)` | after 2s → IDLE |

## 8. UI Layout

```
┌──────────────────────────────────────────────┐
│              Viewport (3D)                     │
├──────────────────────────────────────────────┤
│  F2L Trainer                    [随机] [设置]  │
│  ┌──────────────────────────────────────┐    │
│  │  F2L-17  |  插槽: [FR ▼]             │    │
│  │          |  R U R' U'                │    │
│  └──────────────────────────────────────┘    │
│  Scramble: R U R' U'                         │
│  [▶ 播放]  [↺ 重播]  [⏭ 下一题]  [📋 随机]   │
│                                              │
│  Diff结果:                                    │
│  corner: slot 2 → slot X  (moved)            │
│  edge:   slot 5 → slot Y  (moved)            │
└──────────────────────────────────────────────┘
```

## 9. Integration Points

| Point | Mechanism |
|-------|-----------|
| 3D access | `@Inject('world') world: World` |
| Animation | `world.cube.twister.push(exp)` / `.setup(exp)` |
| Completion callback | `world.callbacks.push(() => { ... })` |
| URL routing | `src/index.ts` add `case 'f2l'` |
| Data loading | `import algs from '../Algs/algs.json'` |

## 10. Edge Cases

- **Scramble missing**: `algs.json` may lack `scramble`; fallback to `invertFormula(origin)`
- **Slot not filled after algo**: Display "该 case 未解决此插槽" instead of highlight
- **Piece didn't move**: Highlight same position, note "(未移动)"
- **Rapid case switching**: Call `twister.finish()` before `setup()` to skip pending animation
- **Highlight memory leak**: Always `dispose()` per-highlight materials

## 11. Implementation Order

1. `src/cuber/f2l.ts` — F2L_SLOTS definitions
2. `src/vue/F2LTrainer/tracker.ts` — PieceTracker
3. `src/vue/F2LTrainer/index.ts` + `index.html` — Vue component
4. `src/index.ts` — route registration
5. Verify BL/BR 3D indices
6. Manual test: random → play → highlight → next
