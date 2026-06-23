# Cuber - 3D Rubik's Cube Visualization

**Tech**: TypeScript + Vue 2 + Vuetify + Three.js
**Build**: webpack 5

## Structure

```
src/
├── cuber/        # Core 3D engine (Three.js)
├── solver/       # Kociemba algorithm
├── vue/          # UI components (5 apps)
├── wasm/         # WASM bindings
└── index.ts      # Entry (mode-based routing)
```

## Entry Point

Single webpack entry: `src/index.ts`

URL `?mode=` switches between 5 apps:
- `playground` (default) - Interactive cube
- `director` - Algorithm editor
- `player` - Algorithm player
- `helper` - Tutorial helper
- `algs` - Algorithm library

## Core APIs

### Display State
```typescript
cube.serialize() → string  // 54 chars: UUU...RRR...FFF...
cube.reset()               // Solved state
cube.complete → boolean    // Is solved
```

### Animate Moves
```typescript
twister.push("R U R' U'")  // Play with animation
twister.setup("R U R'")    // Instant state change
twister.undo()             // Undo last move
twister.finish()           // Skip animations
```

### Generate Scramble
```typescript
twister.scrambler() → string  // e.g. "R U2 F' D L2..."
```

## Commands

```bash
npm run watch   # Dev server (localhost:8080)
npm run build   # Production build
```

## Non-Standard

- No `.vue` SFC files - uses `@Component` decorator with `require("./index.html")`
- No Vue Router - mode switching at entry level
- Uses `vue-property-decorator` class components

## Integration Example

```typescript
// Create cube
const world = new World();
world.order = 3;

// Apply solver output
world.cube.twister.push("R U R' F'");
```