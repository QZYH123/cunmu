#!/usr/bin/env bash
# r13 minimal-flat icon candidates -> renders/*.png|svg, then sheets in cunmu-shots/compare/r13
set -e
cd "$(dirname "$0")"
export PATH=/opt/spike-tools/node22/bin:$PATH
mkdir -p renders
node design.mjs mu     renders/c1-mu-ribbon.png '{"scheme":"red"}'
node design.mjs shu    renders/c2-shuminghao.png '{"bgA":"#2B3A5C","bgB":"#1A253D","ink":"#FBF6EC","sw":62,"h":190,"dx":92,"gap":128,"inner":112,"r":56}'
node design.mjs cun    renders/c3-cun.png '{}'
node design.mjs covers renders/c4-covers.png '{"bgA":"#A3C2B1","bgB":"#7FA390"}'
# alternates kept for reference
node design.mjs mu     renders/alt-mu-ink.png '{"scheme":"ink"}'
node design.mjs shu    renders/alt-shuminghao-paper.png '{"sw":62,"h":190,"dx":92,"gap":128,"inner":112,"r":56}'
node design.mjs cun    renders/alt-cun-indigo.png '{"dark":true}'
node design.mjs all    /workspace/cunmu-shots/compare/r13/sketches.png
/home/box/venv-icon/bin/python present.py present.json
