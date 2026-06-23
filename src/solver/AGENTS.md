# Solver - Kociemba Algorithm

**Purpose**: Two-phase algorithm for optimal cube solving

## Classes

| Class | Role |
|-------|------|
| `Solver` | Main solver entry |
| `CubieCube` | Cubie-level state representation |
| `CoordCube` | Coordinate-level encoding |

## Usage

```typescript
const solver = new Solver();
const solution = solver.solve(stateString);
// Returns: "R U R' F' D L2..."
```

## State Format

Same as `Cube.serialize()`: 54 chars

## WASM

`src/wasm/` contains compiled solver WASM for performance.