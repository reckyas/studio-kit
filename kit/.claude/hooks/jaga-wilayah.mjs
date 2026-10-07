#!/usr/bin/env node
// Hook PreToolUse (Edit|Write|NotebookEdit): menolak agent Mode Tim mengedit berkas di luar wilayah jabatannya.
// Peran: agent_type dari input hook (subagent / `claude --agent`), lalu .claude/tim/meja.local.json di worktree.
// Tanpa peran = Mode Solo → diizinkan. Exit 2 + stderr = tool diblokir, alasan dikirim ke Claude.
// Galat tak terduga di hook ini TIDAK memblokir (exit 0) agar sesi tidak macet; peringatan ditulis ke stderr.
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { relatifKeRoot, tentukanPeran, periksa } from "./wilayah-lib.mjs";

const bacaJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Apakah path berada di dalam repo git mana pun (cari `.git` ke atas dari folder terdekat yang ada). */
function diDalamRepoGit(p) {
  let d = resolve(p);
  while (!existsSync(d)) {
    const up = dirname(d);
    if (up === d) return false;
    d = up;
  }
  if (!statSync(d).isDirectory()) d = dirname(d);
  for (;;) {
    if (existsSync(join(d, ".git"))) return true;
    const up = dirname(d);
    if (up === d) return false;
    d = up;
  }
}

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!filePath) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const aturanPath = join(root, ".claude/tim/wilayah.json");
  if (!existsSync(aturanPath)) process.exit(0);
  const aturan = bacaJson(aturanPath);

  const mejaPath = join(root, ".claude/tim/meja.local.json");
  const peranMeja = existsSync(mejaPath) ? bacaJson(mejaPath).peran : null;
  const peran = tentukanPeran(input.agent_type, peranMeja, aturan);
  if (!peran) process.exit(0);

  const absolut = resolve(root, filePath);
  const rel = relatifKeRoot(absolut, root);
  const diLuarRepo = rel === null ? !diDalamRepoGit(absolut) : false;
  const hasil = periksa({ peran, rel, diLuarRepo, aturan });
  if (hasil.izin) process.exit(0);

  process.stderr.write(`[jaga-wilayah] DITOLAK: ${hasil.alasan}\n`);
  process.exit(2);
} catch (e) {
  process.stderr.write(`[jaga-wilayah] peringatan: hook gagal (${e?.message ?? e}); edit tidak diblokir.\n`);
  process.exit(0);
}

