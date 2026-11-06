// v1.19.2 — titre Modèles IA, plus de PC IA (Ollama) en dur
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const check = (ok, msg) => { if (!ok) fail++; console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); return ok; };
const html = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8');
const ver = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
check(ver === '1.19.2', `VERSION ${ver}`);
check(/aiWatchCard/.test(html) && /Modèles IA/.test(html), 'Modèles IA + veille');
check(html.includes(`?v=${ver}`), `?v=${ver}`);
check(!/>PC IA \(Ollama\)</.test(html), 'plus de titre PC IA (Ollama)');
check(/Tester le directeur/.test(html) && /Tester la veille/.test(html), 'boutons');
console.log(fail ? fail + ' échec(s)' : 'v1.19.2 : OK');
process.exit(fail ? 1 : 0);
