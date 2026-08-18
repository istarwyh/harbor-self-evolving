import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const temporary = path.join(root, 'lib', '_client.cjs')
const output = path.join(root, 'lib', 'client.js')

await build({
  entryPoints: [path.join(root, 'src', 'client', 'index.jsx')],
  outfile: temporary,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: ['es2022'],
  external: ['react'],
  loader: { '.jpg': 'dataurl' },
  define: { __HSE_VERSION__: JSON.stringify(packageJson.version) },
  logOverride: { 'commonjs-variable-in-esm': 'silent' },
})

const source = await readFile(temporary, 'utf8')
await rm(temporary)
const bundle = [
  '/* dsh-harbor-evolution Web client — generated from src/client. */',
  'window.__ModuleLoader__.load({',
  `  id: ${JSON.stringify(packageJson.name)},`,
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  source.replace(/\s+$/, ''),
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')

new Function(bundle)
await writeFile(output, bundle)
console.log(`built ${path.relative(root, output)}`)
