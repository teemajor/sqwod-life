# CoachThinking — drop-in

Sqwod Coach "thinking" indicator. Diamond-seeded abstract morph; **motion + pace match the query intent**. Zero dependencies (React only), no animation libraries — one `<svg>`/`<path>` driven by a `requestAnimationFrame` loop.

## Install
Copy `CoachThinking.jsx` into your components folder. No packages to add.

## Use
```jsx
import CoachThinking from './CoachThinking';

// while the coach is composing, where the reply will render:
{isThinking && <CoachThinking intent={intent} size={24} />}
```

## Props
| prop | type | default | notes |
|------|------|---------|-------|
| `intent` | `'recover' \| 'lift' \| 'burn' \| 'nourish' \| 'plan' \| 'idle'` | `'idle'` | picks the shape family + pace. Live-updates if you change it mid-think. |
| `size` | number (px) | `24` | square. |
| `className` / `style` | — | — | forwarded to the `<svg>`. |

## Color (dark/light)
The mark is `fill="currentColor"` — it inherits the text color of its container. No theme prop needed:
```jsx
<div style={{ color: 'var(--mark)' }}><CoachThinking intent="lift" /></div>
// dark UI: --mark: #FAFAFA   ·   light UI: --mark: #111113
```

## Intent map (motion matches the action)
| intent | query type | shapes | pace |
|--------|-----------|--------|------|
| `recover` | sleep · mobility · rest | circle ⇄ seed | slow breath · 3.4s |
| `lift` | strength · power | seed (squash/stretch) | heavy rep · 2.3s |
| `burn` | cardio · conditioning | circle → heart | fast pulse · 1.3s |
| `nourish` | nutrition · hydration | leaf → drop → circle | organic flow · 2.6s |
| `plan` | schedule · admin | seed → triangle → square | crisp · 1.8s |
| `idle` | (default / resting) | seed | calm breath |

Map your router/classifier's result to one of these strings. `INTENTS` is also exported if you want to read or tune the families/loops.

## Notes
- Respects `prefers-reduced-motion` (renders a static seed, no loop).
- Shapes are computed once at module load; the loop only lerps points + sets one `d` per frame.
- Accessible: `role="img"`, `aria-label="Coach is thinking"`.
