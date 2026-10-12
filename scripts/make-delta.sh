#!/bin/bash
# יוצר ZIP של שינויים בלבד ביחס לגרסה האחרונה שנמסרה. שימוש: scripts/make-delta.sh <baseline-dir> <out.zip> [קבצים...]
# בלי רשימת קבצים: כל מה ששונה/נוסף. ברשימה: רק הקבצים הללו. מדפיס גם קבצים שנמחקו.
base="$1"; out="$2"; shift 2
EX='node_modules|dist|\.git|\.zip$|scripts/gcal-test/\.fn\.mjs|scripts/\.ai-fn\.mjs'
cd /home/claude/teacher-app
if [ $# -gt 0 ]; then list=("$@"); else
  mapfile -t list < <(find . -type f | sed 's|^\./||' | grep -Ev "^($EX)" | while read f; do cmp -s "$f" "$base/$f" || echo "$f"; done)
fi
rm -f "$out"; zip -q "$out" "${list[@]}"
echo "בקובץ: ${#list[@]} קבצים"; printf ' %s\n' "${list[@]}"
(cd "$base" && find . -type f | sed 's|^\./||' | grep -Ev "^($EX)" | while read f; do [ -e "/home/claude/teacher-app/$f" ] || echo "נמחק: $f"; done)
