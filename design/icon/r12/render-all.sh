#!/bin/sh
# r12 cartoon candidates: rebuild renders/candidate-N-1024.png and the sheets.
# 1 喜鹊 and 4 千层蛋糕 are SVG (flat.mjs); 2 寄居蟹 and 3 仓鼠 are Blender vinyl-toy renders,
# two passes each (toy alone + caught shadow) composited onto a gradient tile by comp.py.
set -e
B=${B:-/home/box/tools/blender-4.2.3-linux-x64/blender}; PY=${PY:-/home/box/venv-icon/bin/python}; OUT=${OUT:-/tmp/r12/fin}
D=$(cd "$(dirname "$0")" && pwd); mkdir -p "$OUT"
node $D/flat.mjs magpie $D/renders/candidate-1-1024.png '{"sx":-24,"sy":-20,"k":1.1}'
node $D/flat.mjs cake $D/renders/candidate-4-1024.png '{"x0":226,"w":390,"sw":190,"sk":0.85,"y0":456,"h":380}'
H='{"samples":96,"bg":"#C6DDD2","fur":"#E08A3C","exp":-1.0,"dist":10.2,"tz":0.85,"view":"Standard","look":"None","fill":110}'
C='{"samples":96,"elev":32,"dist":9.0,"tz":0.72,"az":-14,"bg":"#F6E4C6","view":"Standard","look":"None","exp":-1.0,"fill":160}'
TOY_PASS=catch $B -b --factory-startup -P $D/s_hamster.py -- $OUT/h-catch.png "$H"
TOY_PASS=obj   $B -b --factory-startup -P $D/s_hamster.py -- $OUT/h.png "$H"
TOY_PASS=catch $B -b --factory-startup -P $D/s_crab.py -- $OUT/c-catch.png "$C"
TOY_PASS=obj   $B -b --factory-startup -P $D/s_crab.py -- $OUT/c.png "$C"
$PY $D/comp.py $OUT/c.png $D/renders/candidate-2-1024.png '{"top":"#F8EBD6","bottom":"#EFD6B2","dx":-43,"dy":-92}'
$PY $D/comp.py $OUT/h.png $D/renders/candidate-3-1024.png '{"top":"#D3E6DC","bottom":"#B5D0C4","dy":10}'
$PY $D/present.py $D/present.json
node $D/sketches.mjs /workspace/cunmu-shots/compare/r12/sketches.png
