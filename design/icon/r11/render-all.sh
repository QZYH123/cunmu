#!/bin/sh
# r11 icon candidates: the exact renders behind renders/candidate-N-1024.png (Blender 4.2.3, Cycles CPU)
# B=path/to/blender  PY=python with numpy+scipy+pillow   OUT=scratch dir
set -e
B=${B:-/home/box/tools/blender-4.2.3-linux-x64/blender}; PY=${PY:-/home/box/venv-icon/bin/python}; OUT=${OUT:-/tmp/r11/fin3}
D=$(cd "$(dirname "$0")" && pwd); mkdir -p "$OUT"
$B -b --factory-startup -P $D/s_book.py -- $OUT/1.png '{"samples":128,"lens":135,"cover":"#131A2C","cover2":"#22305A","look":"AgX - Medium High Contrast","exp":-0.3,"r":0.0052,"thread":"#E4DCCB","elev":70,"az":0,"dist":7.7,"rot":-7,"surface":"#E6D9C2","surface2":"#DCCBAE","text":"存目"}'
$B -b --factory-startup -P $D/s_stack.py -- $OUT/2.png '{"samples":128,"elev":32,"az":40,"dist":8.4,"marker":false,"paper_mid":false,"covers":[["#131A2C","#22305A"],["#A8362A","#BE4A33"],["#151D31","#25335A"]],"tz":0.17,"rots":[3,-4,1],"text":"存目","surface":"#E6D9C2","surface2":"#DCCBAE"}'
$PY $D/maps_press.py $OUT/p '{"size":0.6}'
$B -b --factory-startup -P $D/s_press.py -- $OUT/3.png $OUT/p '{"samples":128,"depth":0.006,"fibre":0.1,"paper":"#F2E9D8","paper2":"#E7DBC5","lel":26,"ink_rough":0.85,"ink":"#A4321C","ink2":"#8F2B18","inkvar":0.12}'
$B -b --factory-startup -P $D/s_cards.py -- $OUT/4.png '{"samples":128,"drough":0.6,"dspec":0.15,"lean":5,"elev":34,"az":-14,"dist":8.3,"DH":0.5,"CH":0.5,"tz":0.24,"n":12,"drawer":"#2B211C","drawer2":"#3A2C24","pick":4,"up":0.16,"redcard":true,"surface":"#E6D9C2"}'
for i in 1 2 3 4; do $PY -c "from PIL import Image; Image.open('$OUT/$i.png').convert('RGB').save('$D/renders/candidate-$i-1024.png')"; done
$PY $D/present.py $D/present.json
