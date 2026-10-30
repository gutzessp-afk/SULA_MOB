#!/usr/bin/env node

/**
 * migrar-planos.mjs
 * ─────────────────
 * Sube una carpeta de planos PDF al sistema SULA MOB, uno por uno, a /api/analizar-plano.
 * Cada BOM queda guardado en plantilla_despiece (Catálogo de claves).
 *
 * Uso:
 *   node scripts/migrar-planos.mjs ./PLANOS --simular
 *   node scripts/migrar-planos.mjs ./PLANOS --url=https://sula-mob.vercel.app --cookie='{"id":"…","rol":"admin",…}'
 *
 * Opciones:
 *   --url=…      servidor (por defecto http://localhost:3000)
 *   --cookie=…   valor de la cookie sula_session de un administrador (ver abajo)
 *   --force      volver a analizar con IA aunque la clave ya tenga despiece
 *   --delay=ms   espera entre planos (por defecto 3000)
 *   --simular    solo lista qué se subiría y con qué clave; no gasta nada
 *
 * La clave sale del nombre del archivo (2-1-0072-0003 …pdf). Los PDF sin clave en el nombre
 * se saltan y se listan al final: renómbralos y vuelve a correr el script.
 *
 * Se manda versionar=true: el servidor guarda la huella de cada PDF. Una clave que ya tiene
 * despiece no vuelve a la IA (salvo con --force), así que se puede correr varias veces.
 *
 * Cookie: inicia sesión como administrador en el navegador → DevTools → Application →
 * Cookies → copia el VALOR de "sula_session" (empieza con %7B o con {).
 *
 * RUTA: scripts/migrar-planos.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

/* ── Argumentos ── */

const args = process.argv.slice(2);
const opcion = (nombre) => args.find(a => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? '';
const carpeta = args.find(a => !a.startsWith('--'));
if (!carpeta) {
  console.error('Uso: node scripts/migrar-planos.mjs <carpeta> [--url=…] [--cookie=…] [--force] [--delay=ms] [--simular]');
  process.exit(1);
}

const BASE_URL = (opcion('url') || 'http://localhost:3000').replace(/\/+$/, '');
const FORCE = args.includes('--force');
const SIMULAR = args.includes('--simular');
const DELAY = Number(opcion('delay') || 3000);
// Se acepta el valor solo o "sula_session=valor"; el JSON se codifica como lo guarda el navegador
const valorCookie = opcion('cookie').replace(/^sula_session=/, '');
const COOKIE = valorCookie ? `sula_session=${valorCookie.startsWith('{') ? encodeURIComponent(valorCookie) : valorCookie}` : '';
const MAX_BYTES = 4.4 * 1024 * 1024; // lo más que acepta una función de Vercel

/* ── Buscar todos los PDF (con subcarpetas por cliente) ── */

function buscarPDFs(dir) {
  const resultados = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) resultados.push(...buscarPDFs(ruta));
    else if (entrada.name.toLowerCase().endsWith('.pdf')) resultados.push(ruta);
  }
  return resultados;
}

/** "2-1-0072-0003 VITRINA.pdf" → "2-1-0072-0003"; null si el nombre no trae clave */
const extraerClave = (nombre) => nombre.match(/\d+-\d+-\d+-\d+/)?.[0] ?? null;

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ── Enviar un plano ── */

async function enviarPlano({ ruta, clave }, indice, total) {
  const nombre = path.basename(ruta);
  console.log(`\n[${indice + 1}/${total}] ${nombre}`);
  console.log(`  Clave: ${clave} | Carpeta: ${path.basename(path.dirname(ruta))}`);

  const form = new FormData();
  form.append('plano', new Blob([fs.readFileSync(ruta)], { type: 'application/pdf' }), nombre);
  form.append('clave', clave);
  form.append('descripcion', '');
  form.append('versionar', 'true');
  if (FORCE) form.append('force', 'true');

  const inicio = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/analizar-plano`, { method: 'POST', body: form, headers: COOKIE ? { Cookie: COOKIE } : {} });
    const texto = await res.text();
    let data = null;
    try { data = JSON.parse(texto); } catch { /* Vercel responde HTML cuando se acaba el tiempo */ }
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

    if (!res.ok || !data) {
      const error = data?.error || `respuesta ${res.status}${res.status === 504 ? ' (tardó demasiado)' : ''}`;
      console.log(`  ❌ ${error}`);
      return { clave, ok: false, error, detener: res.status === 403 };
    }
    const piezas = (data.bom?.subensambles ?? []).reduce((n, s) => n + (s.componentes?.length ?? 0), 0);
    const origen = data.source === 'cache' ? 'ya estaba (sin IA)' : data.source === 'ia' ? 'analizado con IA' : data.source;
    console.log(`  ✅ ${origen} | ${data.bom?.subensambles?.length ?? 0} subensambles, ${piezas} piezas | ${segundos}s`);
    if (data.advertencias?.length) console.log(`  ⚠️  ${data.advertencias.join(' ')}`);
    return { clave, ok: true, source: data.source };
  } catch (err) {
    console.log(`  ❌ ${err.message}`);
    return { clave, ok: false, error: err.message };
  }
}

/* ── Main ── */

async function main() {
  const raiz = path.resolve(carpeta);
  if (!fs.existsSync(raiz)) {
    console.error(`No existe la carpeta: ${raiz}`);
    process.exit(1);
  }

  const todos = buscarPDFs(raiz).sort().map(ruta => ({ ruta, clave: extraerClave(path.basename(ruta)), bytes: fs.statSync(ruta).size }));
  const sinClave = todos.filter(p => !p.clave);
  const pesados = todos.filter(p => p.clave && p.bytes > MAX_BYTES);
  // Dos PDF con la misma clave: se sube solo el primero (el segundo reemplazaría al primero)
  const vistas = new Set();
  const repetidos = [];
  const planos = todos.filter(p => {
    if (!p.clave || p.bytes > MAX_BYTES) return false;
    if (vistas.has(p.clave)) { repetidos.push(p); return false; }
    vistas.add(p.clave);
    return true;
  });

  console.log('\n═══════════════════════════════════════');
  console.log('  MIGRACIÓN DE PLANOS — SULA MOB');
  console.log('═══════════════════════════════════════');
  console.log(`Carpeta: ${raiz}`);
  console.log(`PDF encontrados: ${todos.length} · a subir: ${planos.length}`);
  console.log(`Servidor: ${BASE_URL}`);
  console.log(`Volver a analizar los que ya existen (--force): ${FORCE ? 'SÍ' : 'NO'}`);
  console.log('═══════════════════════════════════════\n');

  for (const p of planos) console.log(`  📄 ${path.relative(raiz, p.ruta)} → ${p.clave}`);
  const avisar = (titulo, lista, motivo) => {
    if (!lista.length) return;
    console.log(`\n${titulo} (${lista.length}):`);
    for (const p of lista) console.log(`  ⏭️  ${path.relative(raiz, p.ruta)}${motivo(p)}`);
  };
  avisar('Se saltan: el nombre no trae la clave (ej. 2-1-0072-0003)', sinClave, () => '');
  avisar('Se saltan: pesan más de 4.4 MB', pesados, p => ` (${(p.bytes / 1024 / 1024).toFixed(1)} MB)`);
  avisar('Se saltan: clave repetida en otro PDF', repetidos, p => ` (${p.clave})`);

  if (SIMULAR) {
    console.log('\nSimulación: no se subió nada. Quita --simular para migrar.\n');
    return;
  }
  if (!COOKIE) {
    console.error('\nFalta --cookie con el valor de "sula_session" de un administrador (ver el inicio del script).');
    process.exit(1);
  }
  if (!planos.length) return;

  const resultados = [];
  for (let i = 0; i < planos.length; i++) {
    const r = await enviarPlano(planos[i], i, planos.length);
    resultados.push(r);
    if (r.detener) {
      console.error('\nEl servidor no aceptó la sesión (403): revisa la cookie sula_session. Se detiene la migración.');
      break;
    }
    if (i < planos.length - 1) await esperar(DELAY);
  }

  const exitosos = resultados.filter(r => r.ok);
  const yaEstaban = exitosos.filter(r => r.source === 'cache');
  const fallidos = resultados.filter(r => !r.ok);
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMEN');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Listos: ${exitosos.length} (${exitosos.length - yaEstaban.length} analizados + ${yaEstaban.length} ya estaban)`);
  if (fallidos.length) {
    console.log(`❌ Fallidos: ${fallidos.length} (vuelve a correr el script: los listos no se repiten)`);
    for (const f of fallidos) console.log(`   - ${f.clave}: ${f.error}`);
  }
  const saltados = sinClave.length + pesados.length + repetidos.length
  if (saltados) console.log(`⏭️  Saltados: ${saltados} (ver la lista al inicio)`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
