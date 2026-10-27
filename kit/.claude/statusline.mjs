// Status line Claude Code: model · konteks % · limit 5 jam % · limit 7 hari %.
// + nama akun Claude (oauthAccount di ~/.claude.json).
// Data dari stdin (JSON statusLine); field bisa absen/null → ditampilkan "–".
let raw = '';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const akun = () => {
  try {
    const a = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')).oauthAccount ?? {};
    return a.displayName || a.emailAddress || null;
  } catch { return null; }
};
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let d = {};
  try { d = JSON.parse(raw || '{}'); } catch {}
  const warna = (p) => (p == null ? '' : p >= 85 ? '\x1b[31m' : p >= 60 ? '\x1b[33m' : '\x1b[32m');
  const R = '\x1b[0m';
  const pct = (p) => (p == null ? '–' : `${warna(p)}${Math.round(p)}%${R}`);
  const reset = (t) => {
    if (!t) return '';
    const s = t - Date.now() / 1000;
    if (s <= 0) return '';
    const j = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return j >= 24 ? ` (reset ${Math.floor(j / 24)}h${j % 24}j)` : ` (reset ${j}j${m}m)`;
  };
  const ctx = d.context_window ?? {};
  const rl = d.rate_limits ?? {};
  const bar = (p) => {
    const n = p == null ? 0 : Math.min(10, Math.round(p / 10));
    return warna(p) + '▓'.repeat(n) + R + '░'.repeat(10 - n);
  };
  const bagian = [
    `[${d.model?.display_name ?? '?'}]`,
    `ctx ${bar(ctx.used_percentage)} ${pct(ctx.used_percentage)}`,
  ];
  const nama = akun();
  if (nama) bagian.unshift(`\x1b[36m@${nama}${R}`);
  if (rl.five_hour) bagian.push(`5j ${pct(rl.five_hour.used_percentage)}${reset(rl.five_hour.resets_at)}`);
  if (rl.seven_day) bagian.push(`7h ${pct(rl.seven_day.used_percentage)}${reset(rl.seven_day.resets_at)}`);
  if (rl.spend_limit) bagian.push(`spend ${pct(rl.spend_limit.used_percentage)}`);
  if (!rl.five_hour && !rl.seven_day && !rl.spend_limit) bagian.push('limit –');
  process.stdout.write(bagian.join(' · '));
});
