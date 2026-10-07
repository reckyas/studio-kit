// Test logika murni penjaga wilayah Mode Tim. Jalankan: node --test .claude/hooks/
import { test } from "node:test";
import assert from "node:assert/strict";
import { globToRegExp, relatifKeRoot, tentukanPeran, periksa } from "./wilayah-lib.mjs";

const ATURAN = {
  singleWriter: ["docs/PROGRESS.md", "docs/BUGLOG.md", "docs/plans/IMPLEMENTATION_PLAN*.md", "**/CLAUDE.md", ".claude/**"],
  peran: {
    cto: { tulis: ["**"], bolehSingleWriter: true },
    "backend-engineer": { tulis: ["server/**", "integrations/**", "docs/tim/laporan/**"] },
    "qa-engineer": { tulis: ["**/test/**", "**/*.test.*", "docs/tim/laporan/**"] },
    "code-reviewer": { tulis: [] },
  },
};

test("glob: ** melintasi folder, * tidak", () => {
  assert.ok(globToRegExp("server/**").test("server/src/a/b.ts"));
  assert.ok(globToRegExp("**/test/**").test("server/test/x.test.ts"));
  assert.ok(globToRegExp("**/test/**").test("site/test/a.mjs"));
  assert.ok(globToRegExp("**/*.test.*").test("admin/src/lib/api.test.ts"));
  assert.ok(globToRegExp("docs/plans/IMPLEMENTATION_PLAN*.md").test("docs/plans/IMPLEMENTATION_PLAN_KOMERSIAL.md"));
  assert.ok(!globToRegExp("docs/*.md").test("docs/plans/PRD.md"));
  assert.ok(globToRegExp("**/CLAUDE.md").test("CLAUDE.md"));
  assert.ok(globToRegExp("**/CLAUDE.md").test("server/CLAUDE.md"));
  assert.ok(!globToRegExp("server/**").test("serverx/a.ts"));
});

test("glob: tidak peka huruf besar (Windows) & titik literal", () => {
  assert.ok(globToRegExp("docs/PROGRESS.md").test("Docs/progress.md"));
  assert.ok(!globToRegExp("docs/PROGRESS.md").test("docs/PROGRESSxmd"));
});

test("relatifKeRoot menormalkan path Windows", () => {
  const root = "D:\\KERJA\\PROJECT\\APLIKASI CONTOH";
  assert.equal(relatifKeRoot("D:\\KERJA\\PROJECT\\APLIKASI CONTOH\\server\\src\\a.ts", root), "server/src/a.ts");
  assert.equal(relatifKeRoot("d:/kerja/project/aplikasi contoh/admin/x.tsx", root), "admin/x.tsx");
  assert.equal(relatifKeRoot("server/src/a.ts", root), "server/src/a.ts");
  assert.equal(relatifKeRoot("D:\\KERJA\\PROJECT\\worktrees\\x\\a.ts", root), null);
  assert.equal(relatifKeRoot("D:\\KERJA\\PROJECT\\APLIKASI CONTOH-lain\\a.ts", root), null);
});

test("tentukanPeran: agent_type dikenal > meja > solo", () => {
  assert.equal(tentukanPeran("backend-engineer", "qa-engineer", ATURAN), "backend-engineer");
  assert.equal(tentukanPeran("Explore", "qa-engineer", ATURAN), "qa-engineer");
  assert.equal(tentukanPeran("general-purpose", null, ATURAN), null);
  assert.equal(tentukanPeran(undefined, undefined, ATURAN), null);
  assert.equal(tentukanPeran(undefined, "peran-asing", ATURAN), null);
});

test("Mode Solo (tanpa peran) selalu diizinkan", () => {
  assert.equal(periksa({ peran: null, rel: "docs/PROGRESS.md", diLuarRepo: false, aturan: ATURAN }).izin, true);
});

test("engineer di wilayahnya diizinkan, di luar ditolak", () => {
  assert.equal(periksa({ peran: "backend-engineer", rel: "server/src/app.ts", aturan: ATURAN }).izin, true);
  assert.equal(periksa({ peran: "backend-engineer", rel: "docs/tim/laporan/T-001.md", aturan: ATURAN }).izin, true);
  const r = periksa({ peran: "backend-engineer", rel: "admin/src/App.tsx", aturan: ATURAN });
  assert.equal(r.izin, false);
  assert.match(r.alasan, /wilayah backend-engineer/);
});

test("berkas single-writer ditolak untuk worker walau cocok glob wilayahnya", () => {
  const r = periksa({ peran: "backend-engineer", rel: "server/CLAUDE.md", aturan: ATURAN });
  assert.equal(r.izin, false);
  assert.match(r.alasan, /CTO/);
  assert.equal(periksa({ peran: "qa-engineer", rel: "docs/BUGLOG.md", aturan: ATURAN }).izin, false);
  assert.equal(periksa({ peran: "qa-engineer", rel: ".claude/hooks/test/x.mjs", aturan: ATURAN }).izin, false);
});

test("CTO boleh menulis berkas single-writer", () => {
  assert.equal(periksa({ peran: "cto", rel: "docs/PROGRESS.md", aturan: ATURAN }).izin, true);
  assert.equal(periksa({ peran: "cto", rel: ".claude/settings.json", aturan: ATURAN }).izin, true);
});

test("berkas terlarang (keystore) ditolak untuk semua peran, termasuk CTO", () => {
  const aturan = { ...ATURAN, terlarang: ["**/keystore.properties", "**/*.jks"] };
  aturan.peran = { ...ATURAN.peran, "android-engineer": { tulis: ["android/**"] } };
  assert.equal(periksa({ peran: "android-engineer", rel: "android/keystore.properties", aturan }).izin, false);
  assert.equal(periksa({ peran: "cto", rel: "android/app/rilis.jks", aturan }).izin, false);
  assert.equal(periksa({ peran: "android-engineer", rel: "android/app/build.gradle.kts", aturan }).izin, true);
  assert.equal(periksa({ peran: null, rel: "android/keystore.properties", aturan }).izin, true);
});

test("reviewer read-only ditolak di mana pun", () => {
  assert.equal(periksa({ peran: "code-reviewer", rel: "server/src/a.ts", aturan: ATURAN }).izin, false);
});

test("berkas di checkout/repo lain ditolak untuk peran, di luar repo diizinkan", () => {
  const r = periksa({ peran: "backend-engineer", rel: null, diLuarRepo: false, aturan: ATURAN });
  assert.equal(r.izin, false);
  assert.match(r.alasan, /checkout lain/);
  assert.equal(periksa({ peran: "backend-engineer", rel: null, diLuarRepo: true, aturan: ATURAN }).izin, true);
});
