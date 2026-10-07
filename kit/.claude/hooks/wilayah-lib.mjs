// Logika murni penjaga wilayah Mode Tim (tanpa I/O). Dipakai jaga-wilayah.mjs; diuji wilayah-lib.test.mjs.
// Aturan & peta wilayah: .claude/tim/wilayah.json. SOP: docs/tim/SOP_TIM.md.

/** Glob sederhana → RegExp: `**` = apa saja (lintas folder), `*` = apa saja kecuali `/`. Tidak peka huruf besar (Windows). */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // `**/` di awal/tengah juga cocok dengan nol folder (`**/CLAUDE.md` cocok `CLAUDE.md`).
      if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}

const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/** Path berkas → path relatif terhadap root proyek (garis miring `/`), atau null bila di luar root. */
export function relatifKeRoot(filePath, root) {
  const f = norm(filePath);
  const r = norm(root);
  const absolut = /^[a-zA-Z]:\//.test(f) || f.startsWith("/");
  if (!absolut) return f.replace(/^\.\//, "");
  if (f.toLowerCase() === r.toLowerCase()) return "";
  if (f.toLowerCase().startsWith(r.toLowerCase() + "/")) return f.slice(r.length + 1);
  return null;
}

/** Peran efektif: agent_type yang terdaftar di wilayah.json, lalu peran meja (worktree), selain itu null = Mode Solo. */
export function tentukanPeran(agentType, peranMeja, aturan) {
  if (agentType && aturan.peran[agentType]) return agentType;
  if (peranMeja && aturan.peran[peranMeja]) return peranMeja;
  return null;
}

const cocok = (globs, rel) => (globs ?? []).some((g) => globToRegExp(g).test(rel));

/**
 * @param {{peran: string|null, rel: string|null, diLuarRepo?: boolean, aturan: any}} p
 *   rel = path relatif ke root proyek (null bila di luar root); diLuarRepo = berkas tidak berada di repo git mana pun.
 * @returns {{izin: boolean, alasan?: string}}
 */
export function periksa({ peran, rel, diLuarRepo = false, aturan }) {
  if (!peran) return { izin: true };
  const def = aturan.peran[peran];
  if (rel === null) {
    if (diLuarRepo) return { izin: true }; // scratchpad, memori, berkas sementara
    return {
      izin: false,
      alasan: `Peran ${peran} hanya boleh mengedit worktree mejanya sendiri, bukan checkout lain. Sampaikan kebutuhan lewat laporan tiket ke CTO.`,
    };
  }
  if (cocok(aturan.terlarang, rel)) {
    return { izin: false, alasan: `"${rel}" berisi rahasia (keystore/kunci): hanya CEO yang mengubahnya secara manual.` };
  }
  if (cocok(aturan.singleWriter, rel) && !def.bolehSingleWriter) {
    return {
      izin: false,
      alasan: `"${rel}" berkas single-writer: hanya CTO yang mengedit saat integrasi. Tulis usulan/draf di docs/tim/laporan/<tiket>.md.`,
    };
  }
  if (cocok(def.tulis, rel)) return { izin: true };
  return {
    izin: false,
    alasan: `"${rel}" di luar wilayah ${peran} (boleh: ${(def.tulis ?? []).join(", ") || "tidak ada — peran read-only"}). Minta CTO membuka tiket untuk jabatan yang tepat.`,
  };
}
