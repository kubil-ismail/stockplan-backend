#!/usr/bin/env node
'use strict';

// Builds seeders/data/idx-companies.json from the crawler's minify output, keeping only the fields the
// seeder reads (same shape as the crawler, so lib/sync.fromCrawler maps it).
// Usage: node bin/build-idx-companies.js ../stockplan-crawler/dist/idx/minify/company/detail
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Usage: node bin/build-idx-companies.js <crawler>/dist/idx/minify/company/detail');
  process.exit(1);
}

const pick = (list, keys) => (Array.isArray(list) ? list.map((x) => Object.fromEntries(keys.map((k) => [k, x[k]]))) : []);
const out = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const { data: d } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!d || !d.ticker) continue;
  out.push({
    ticker: d.ticker,
    name: d.name,
    sector: d.sector && { slug: d.sector.slug, sub_sector: d.sector.sub_sector && { name: d.sector.sub_sector.name } },
    industry: d.industry && { name: d.industry.name },
    board: d.board,
    ipo_date: d.ipo_date,
    directors: pick(d.directors, ['name', 'position']),
    commissioners: pick(d.commissioners, ['name', 'position']),
    shareholders: pick(d.shareholders, ['name', 'type', 'percentage']),
    // fromCrawler keeps the 30 largest anyway; trimming here keeps the file small.
    subsidiaries: pick([...(d.subsidiaries || [])].sort((a, b) => (b.total_assets || 0) - (a.total_assets || 0)).slice(0, 30), ['name', 'type', 'total_assets', 'ownership_percentage']),
  });
}

const target = path.join(__dirname, '..', 'seeders', 'data', 'idx-companies.json');
fs.writeFileSync(target, JSON.stringify({ source: 'stockplan-crawler (IDX profil perusahaan tercatat)', builtAt: new Date().toISOString(), data: out }));
console.log(`${out.length} emiten → ${path.relative(process.cwd(), target)} (${(fs.statSync(target).size / 1e6).toFixed(1)} MB)`);
