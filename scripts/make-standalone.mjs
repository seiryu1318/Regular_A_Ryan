import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const releaseRoot = path.join(projectRoot, 'release');
const inputPath = path.join(releaseRoot, 'index.html');
const outputPath = path.join(projectRoot, '2027학년도_정시모집_전형변화와_입시결과.html');
const pagesOutputPath = path.join(projectRoot, 'index.html');

let html = fs.readFileSync(inputPath, 'utf8');

for (const match of html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)) {
  const assetPath = path.join(releaseRoot, match[1].replace(/^\.\//, ''));
  const css = fs.readFileSync(assetPath, 'utf8');
  html = html.replace(match[0], () => `<style>${css}</style>`);
}

for (const match of html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)) {
  const assetPath = path.join(releaseRoot, match[1].replace(/^\.\//, ''));
  const javascript = fs.readFileSync(assetPath, 'utf8').replaceAll('</script', '<\\/script');
  html = html.replace(match[0], () => `<script type="module">${javascript}</script>`);
}

html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replaceAll('·', ', ').replaceAll('・', ', ');
fs.writeFileSync(outputPath, html, 'utf8');
fs.writeFileSync(pagesOutputPath, html, 'utf8');
console.log(`${outputPath}\n${fs.statSync(outputPath).size} bytes\n${pagesOutputPath}\n${fs.statSync(pagesOutputPath).size} bytes`);
