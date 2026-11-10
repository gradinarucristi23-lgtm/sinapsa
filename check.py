"""Verifică sintaxa codului client: lipește public/js/*.js ca serverul (/app.js) și îl compilează cu quickjs."""
import json
import os
import sys

import quickjs

folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "js")
src = '"use strict";\n' + "\n".join(
    open(os.path.join(folder, n), encoding="utf-8").read().replace('"use strict";', "", 1)
    for n in sorted(x for x in os.listdir(folder) if x.endswith(".js"))
)
try:
    quickjs.Context().eval("var src=" + json.dumps(src) + "; new Function(src); 1")
except Exception as e:
    print("EROARE DE SINTAXĂ:", e)
    sys.exit(1)
print("Sintaxă OK,", len(src.encode()) // 1024, "KB")
