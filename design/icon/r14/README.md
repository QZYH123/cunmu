# r14 — refining 「一叠封面」

The chosen r13 candidate 4, refined in three rounds; the result is drawn in `../mark.mjs`.

- `stack.mjs` — the parametric stack: `node stack.mjs out.png '<json overrides>'` (tile colours, covers' colour/angle/centre, size, radius, shadow, slip).
- `measure.py` — bbox, mass and contrast-weighted centre of the stack in a render (optical centring).
- `check-mark.mjs` — renders mark.mjs's pieces and measures the adaptive foreground against the 66dp safe circle.
- `review.py`, `present.py`, `sheets.py` — review strips and the sheets in cunmu-shots/compare/r14 (home rows use App Store icons from compare/r13/refs as neighbours).
- `renders/` — the step SVGs (PNGs are not committed).

Steps: r13 (sat high-left, contrast-weighted centre 504,474) → 1 centred, radius 44→30, soft sage-tinted shadows, light from the top left
→ 2 angles −12°/−2°/8°, scale 0.95, navy and ochre separated from the cinnabar → 3 even slivers, lighter shadow, slip 58×196.
