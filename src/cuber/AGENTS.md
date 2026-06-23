# Cuber Core - 3D Visualization Engine

**Purpose**: Three.js-based cube rendering and animation

## Classes

| Class | Role |
|-------|------|
| `Cube` | Main cube object, serialization, state |
| `Twister` | Move execution, animation queue |
| `World` | Scene container, camera, rendering |
| `Cubelet` | Individual cube piece |
| `Tweener` | Animation tween system |
| `Group` | Layer rotation animation |

## Key Methods

### Cube (`cube.ts`)
- `serialize()` → 54-char state string
- `reset()` → solved state
- `complete` → boolean (solved check)
- `stick(index, face, value)` → set sticker
- `arrow` → enable/disable indicators

### Twister (`twister.ts`)
- `push(exp, reverse?, times?)` → animate algorithm
- `setup(exp)` → instant state change
- `undo()` → undo last move
- `finish()` → complete all animations
- `scrambler()` → generate scramble string

## State Format

`serialize()` returns 54 chars (9 per face):
- Order: U(0-8), R(9-17), F(18-26), D(27-35), L(36-44), B(45-53)
- Colors: U=White, R=Red, F=Green, D=Yellow, L=Orange, B=Blue

## Move Notation

Standard: R, R', R2, U, U', F, L, D, B
Cube rotations: x, y, z
Slice: M, E, S
Repeat: `(R U R')6`