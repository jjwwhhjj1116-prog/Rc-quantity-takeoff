import React, { useState, useMemo } from "react";

// ───────────────────────────────────────────────
// 철근 단위중량 (kg/m) — KS D 3504 이형철근
// ───────────────────────────────────────────────
const REBAR_W = {
  D10: 0.56, D13: 0.995, D16: 1.56, D19: 2.25,
  D22: 3.04, D25: 3.98, D29: 5.04, D32: 6.23,
};
const DIAS = Object.keys(REBAR_W);

const TYPE_META = {
  column: { label: "기둥", short: "C", color: "bg-blue-700" },
  beam:   { label: "보",   short: "G", color: "bg-indigo-700" },
  slab:   { label: "슬래브", short: "S", color: "bg-teal-700" },
  wall:   { label: "벽체", short: "W", color: "bg-cyan-700" },
  footing:{ label: "기초", short: "F", color: "bg-slate-700" },
};

const DEFAULTS = {
  column: { name: "C1", floor: "1F", b: 500, h: 500, H: 3.3, count: 4, mainDia: "D22", mainN: 8, tieDia: "D10", tieSp: 200 },
  beam:   { name: "G1", floor: "1F", b: 400, h: 600, L: 8.0, count: 4, topDia: "D22", topN: 4, botDia: "D22", botN: 3, stDia: "D10", stSp: 200 },
  slab:   { name: "S1", floor: "1F", W: 8.0, L: 10.0, t: 150, count: 1, dia: "D13", sp: 200, doubleLayer: true },
  wall:   { name: "W1", floor: "1F", L: 6.0, H: 3.3, t: 200, count: 2, vDia: "D13", vSp: 200, hDia: "D10", hSp: 250, doubleFace: true },
  footing:{ name: "F1", floor: "기초", A: 2.0, B: 2.0, h: 600, count: 4, dia: "D16", sp: 150, doubleLayer: false },
};

const fmt = (n, d = 2) =>
  Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });

// ───────────────────────────────────────────────
// 부재별 산출 로직 (간략식 — 정착·이음·피복 미고려)
// ───────────────────────────────────────────────
function calc(m) {
  const basis = { conc: "", form: "", rebar: [] };
  let conc = 0, form = 0;
  const rebar = {}; // { D13: kg, ... }
  const add = (dia, kg, line) => {
    rebar[dia] = (rebar[dia] || 0) + kg;
    basis.rebar.push(line);
  };

  if (m.type === "column") {
    const b = m.b / 1000, h = m.h / 1000;
    conc = b * h * m.H * m.count;
    form = 2 * (b + h) * m.H * m.count;
    basis.conc = `${b}×${h}×${m.H}m×${m.count}개 = ${fmt(conc)}㎥`;
    basis.form = `2×(${b}+${h})×${m.H}m×${m.count}개 = ${fmt(form)}㎡`;
    const mainKg = m.H * m.mainN * m.count * REBAR_W[m.mainDia];
    add(m.mainDia, mainKg, `주근 ${m.mainDia}: ${m.H}m×${m.mainN}본×${m.count}개×${REBAR_W[m.mainDia]} = ${fmt(mainKg)}kg`);
    const tieLen = 2 * (b + h);
    const tieN = Math.floor((m.H * 1000) / m.tieSp) + 1;
    const tieKg = tieLen * tieN * m.count * REBAR_W[m.tieDia];
    add(m.tieDia, tieKg, `띠철근 ${m.tieDia}@${m.tieSp}: ${fmt(tieLen)}m×${tieN}개×${m.count}개×${REBAR_W[m.tieDia]} = ${fmt(tieKg)}kg`);
  }

  if (m.type === "beam") {
    const b = m.b / 1000, h = m.h / 1000;
    conc = b * h * m.L * m.count;
    form = (b + 2 * h) * m.L * m.count;
    basis.conc = `${b}×${h}×${m.L}m×${m.count}개 = ${fmt(conc)}㎥`;
    basis.form = `(${b}+2×${h})×${m.L}m×${m.count}개 = ${fmt(form)}㎡ (바닥+양측면)`;
    const topKg = m.L * m.topN * m.count * REBAR_W[m.topDia];
    add(m.topDia, topKg, `상부근 ${m.topDia}: ${m.L}m×${m.topN}본×${m.count}개×${REBAR_W[m.topDia]} = ${fmt(topKg)}kg`);
    const botKg = m.L * m.botN * m.count * REBAR_W[m.botDia];
    add(m.botDia, botKg, `하부근 ${m.botDia}: ${m.L}m×${m.botN}본×${m.count}개×${REBAR_W[m.botDia]} = ${fmt(botKg)}kg`);
    const stLen = 2 * (b + h);
    const stN = Math.floor((m.L * 1000) / m.stSp) + 1;
    const stKg = stLen * stN * m.count * REBAR_W[m.stDia];
    add(m.stDia, stKg, `스터럽 ${m.stDia}@${m.stSp}: ${fmt(stLen)}m×${stN}개×${m.count}개×${REBAR_W[m.stDia]} = ${fmt(stKg)}kg`);
  }

  if (m.type === "slab") {
    const t = m.t / 1000, A = m.W * m.L;
    conc = A * t * m.count;
    form = A * m.count;
    basis.conc = `${m.W}×${m.L}×${t}m×${m.count}개 = ${fmt(conc)}㎥`;
    basis.form = `${m.W}×${m.L}m×${m.count}개 = ${fmt(form)}㎡ (하부)`;
    const nX = Math.floor((m.L * 1000) / m.sp) + 1;
    const nY = Math.floor((m.W * 1000) / m.sp) + 1;
    const layer = m.doubleLayer ? 2 : 1;
    const len = (nX * m.W + nY * m.L) * layer * m.count;
    const kg = len * REBAR_W[m.dia];
    add(m.dia, kg, `양방향 ${m.dia}@${m.sp}${m.doubleLayer ? " 상·하 2단" : " 1단"}: (${nX}본×${m.W}m + ${nY}본×${m.L}m)×${layer}×${m.count}개 = ${fmt(len, 1)}m → ${fmt(kg)}kg`);
  }

  if (m.type === "wall") {
    const t = m.t / 1000;
    conc = m.L * m.H * t * m.count;
    form = 2 * m.L * m.H * m.count;
    basis.conc = `${m.L}×${m.H}×${t}m×${m.count}개 = ${fmt(conc)}㎥`;
    basis.form = `2×${m.L}×${m.H}m×${m.count}개 = ${fmt(form)}㎡ (양면)`;
    const face = m.doubleFace ? 2 : 1;
    const nV = Math.floor((m.L * 1000) / m.vSp) + 1;
    const vKg = nV * m.H * face * m.count * REBAR_W[m.vDia];
    add(m.vDia, vKg, `수직근 ${m.vDia}@${m.vSp}×${face}면: ${nV}본×${m.H}m×${face}×${m.count}개×${REBAR_W[m.vDia]} = ${fmt(vKg)}kg`);
    const nH = Math.floor((m.H * 1000) / m.hSp) + 1;
    const hKg = nH * m.L * face * m.count * REBAR_W[m.hDia];
    add(m.hDia, hKg, `수평근 ${m.hDia}@${m.hSp}×${face}면: ${nH}본×${m.L}m×${face}×${m.count}개×${REBAR_W[m.hDia]} = ${fmt(hKg)}kg`);
  }

  if (m.type === "footing") {
    const h = m.h / 1000;
    conc = m.A * m.B * h * m.count;
    form = 2 * (m.A + m.B) * h * m.count;
    basis.conc = `${m.A}×${m.B}×${h}m×${m.count}개 = ${fmt(conc)}㎥`;
    basis.form = `2×(${m.A}+${m.B})×${h}m×${m.count}개 = ${fmt(form)}㎡ (측면)`;
    const nX = Math.floor((m.B * 1000) / m.sp) + 1;
    const nY = Math.floor((m.A * 1000) / m.sp) + 1;
    const layer = m.doubleLayer ? 2 : 1;
    const len = (nX * m.A + nY * m.B) * layer * m.count;
    const kg = len * REBAR_W[m.dia];
    add(m.dia, kg, `양방향 ${m.dia}@${m.sp}${m.doubleLayer ? " 상·하 2단" : ""}: (${nX}본×${m.A}m + ${nY}본×${m.B}m)×${layer}×${m.count}개 = ${fmt(len, 1)}m → ${fmt(kg)}kg`);
  }

  const rebarTotal = Object.values(rebar).reduce((a, b) => a + b, 0);
  return { conc, form, rebar, rebarTotal, basis };
}

// ───────────────────────────────────────────────
// 입력 필드 정의
// ───────────────────────────────────────────────
const FIELDS = {
  column: [
    ["b", "단면 b (mm)"], ["h", "단면 h (mm)"], ["H", "높이 H (m)"], ["count", "개수"],
    ["mainDia", "주근 규격", "dia"], ["mainN", "주근 본수"],
    ["tieDia", "띠철근 규격", "dia"], ["tieSp", "띠철근 간격 (mm)"],
  ],
  beam: [
    ["b", "폭 b (mm)"], ["h", "춤 h (mm)"], ["L", "길이 L (m)"], ["count", "개수"],
    ["topDia", "상부근 규격", "dia"], ["topN", "상부근 본수"],
    ["botDia", "하부근 규격", "dia"], ["botN", "하부근 본수"],
    ["stDia", "스터럽 규격", "dia"], ["stSp", "스터럽 간격 (mm)"],
  ],
  slab: [
    ["W", "단변 W (m)"], ["L", "장변 L (m)"], ["t", "두께 t (mm)"], ["count", "개수"],
    ["dia", "철근 규격", "dia"], ["sp", "간격 (mm)"], ["doubleLayer", "상·하 2단 배근", "bool"],
  ],
  wall: [
    ["L", "길이 L (m)"], ["H", "높이 H (m)"], ["t", "두께 t (mm)"], ["count", "개수"],
    ["vDia", "수직근 규격", "dia"], ["vSp", "수직근 간격 (mm)"],
    ["hDia", "수평근 규격", "dia"], ["hSp", "수평근 간격 (mm)"],
    ["doubleFace", "복배근 (양면)", "bool"],
  ],
  footing: [
    ["A", "가로 A (m)"], ["B", "세로 B (m)"], ["h", "두께 h (mm)"], ["count", "개수"],
    ["dia", "철근 규격", "dia"], ["sp", "간격 (mm)"], ["doubleLayer", "상·하 2단 배근", "bool"],
  ],
};

let nextId = 100;

const SAMPLE = [
  { id: 1, type: "footing", ...DEFAULTS.footing },
  { id: 2, type: "column", ...DEFAULTS.column },
  { id: 3, type: "beam", ...DEFAULTS.beam },
  { id: 4, type: "slab", ...DEFAULTS.slab },
];

export default function RcTakeoff() {
  const [members, setMembers] = useState(SAMPLE);
  const [formType, setFormType] = useState("column");
  const [form, setForm] = useState({ ...DEFAULTS.column });
  const [editId, setEditId] = useState(null);
  const [openRow, setOpenRow] = useState(null);
  const [tab, setTab] = useState("member"); // member | floor | rebar
  const [waste, setWaste] = useState({ conc: 0, form: 0, rebar: 3 });

  const switchType = (t) => {
    setFormType(t);
    setForm({ ...DEFAULTS[t] });
    setEditId(null);
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const numeric = {};
    for (const [k, , kind] of FIELDS[formType]) {
      if (kind === "dia" || kind === "bool") numeric[k] = form[k];
      else numeric[k] = Number(form[k]) || 0;
    }
    const m = { type: formType, name: form.name || TYPE_META[formType].label, floor: form.floor || "-", ...numeric };
    if (editId != null) {
      setMembers((ms) => ms.map((x) => (x.id === editId ? { ...m, id: editId } : x)));
      setEditId(null);
    } else {
      setMembers((ms) => [...ms, { ...m, id: nextId++ }]);
    }
    setForm({ ...DEFAULTS[formType] });
  };

  const startEdit = (m) => {
    setFormType(m.type);
    setForm({ ...m });
    setEditId(m.id);
  };

  const remove = (id) => {
    setMembers((ms) => ms.filter((m) => m.id !== id));
    if (editId === id) { setEditId(null); setForm({ ...DEFAULTS[formType] }); }
  };

  const rows = useMemo(() => members.map((m) => ({ m, r: calc(m) })), [members]);

  const totals = useMemo(() => {
    const t = { conc: 0, form: 0, rebar: 0, byType: {}, byFloor: {}, byDia: {} };
    for (const { m, r } of rows) {
      t.conc += r.conc; t.form += r.form; t.rebar += r.rebarTotal;
      const ty = (t.byType[m.type] ||= { conc: 0, form: 0, rebar: 0, n: 0 });
      ty.conc += r.conc; ty.form += r.form; ty.rebar += r.rebarTotal; ty.n += m.count;
      const fl = (t.byFloor[m.floor] ||= { conc: 0, form: 0, rebar: 0 });
      fl.conc += r.conc; fl.form += r.form; fl.rebar += r.rebarTotal;
      for (const [d, kg] of Object.entries(r.rebar)) t.byDia[d] = (t.byDia[d] || 0) + kg;
    }
    return t;
  }, [rows]);

  const withWaste = (v, kind) => v * (1 + (Number(waste[kind]) || 0) / 100);

  const exportCSV = () => {
    const L = [];
    L.push("RC 골조 적산 집계표 (프로토타입)");
    L.push("");
    L.push("부재명,종류,층,콘크리트(㎥),거푸집(㎡),철근(kg)");
    for (const { m, r } of rows)
      L.push(`${m.name},${TYPE_META[m.type].label},${m.floor},${r.conc.toFixed(2)},${r.form.toFixed(2)},${r.rebarTotal.toFixed(1)}`);
    L.push("");
    L.push("철근 규격별 집계,kg,할증 후(kg)");
    for (const [d, kg] of Object.entries(totals.byDia))
      L.push(`${d},${kg.toFixed(1)},${withWaste(kg, "rebar").toFixed(1)}`);
    L.push("");
    L.push(`총계,콘크리트 ${withWaste(totals.conc, "conc").toFixed(2)}㎥,거푸집 ${withWaste(totals.form, "form").toFixed(2)}㎡,철근 ${(withWaste(totals.rebar, "rebar") / 1000).toFixed(3)}ton`);
    const blob = new Blob(["\uFEFF" + L.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "RC_적산_집계표.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const input = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono focus:border-blue-600 focus:outline-none";
  const label = "mb-1 block text-xs font-medium text-slate-500";

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      {/* 헤더 */}
      <header className="border-b-4 border-blue-800 bg-slate-900 px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs tracking-widest text-blue-300">QUANTITY TAKE-OFF · PROTOTYPE</div>
            <h1 className="text-lg font-bold sm:text-xl">RC 골조 적산 프로그램</h1>
          </div>
          <div className="flex items-end gap-3 text-xs">
            {[["conc", "콘크리트 할증%"], ["form", "거푸집 할증%"], ["rebar", "철근 할증%"]].map(([k, lb]) => (
              <div key={k}>
                <div className="mb-0.5 text-slate-400">{lb}</div>
                <input
                  type="number" value={waste[k]}
                  onChange={(e) => setWaste((w) => ({ ...w, [k]: e.target.value }))}
                  className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right font-mono text-white"
                />
              </div>
            ))}
            <button onClick={exportCSV} className="rounded bg-blue-700 px-3 py-1.5 font-semibold hover:bg-blue-600">
              CSV 내보내기
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-3">
        {/* ── 입력 패널 ── */}
        <section className="rounded-lg border border-slate-300 bg-white shadow-sm lg:col-span-1">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-bold">{editId != null ? "부재 수정" : "부재 입력"}</h2>
          </div>
          <div className="p-4">
            <div className="mb-4 flex flex-wrap gap-1">
              {Object.entries(TYPE_META).map(([t, meta]) => (
                <button key={t} onClick={() => switchType(t)}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${formType === t ? meta.color + " text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {meta.label}
                </button>
              ))}
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <span className={label}>부재명</span>
                <input className={input} value={form.name || ""} onChange={(e) => setF("name", e.target.value)} />
              </div>
              <div>
                <span className={label}>층</span>
                <input className={input} value={form.floor || ""} onChange={(e) => setF("floor", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {FIELDS[formType].map(([k, lb, kind]) => (
                <div key={k} className={kind === "bool" ? "col-span-2" : ""}>
                  {kind === "bool" ? (
                    <label className="mt-1 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!!form[k]} onChange={(e) => setF(k, e.target.checked)} />
                      {lb}
                    </label>
                  ) : kind === "dia" ? (
                    <>
                      <span className={label}>{lb}</span>
                      <select className={input} value={form[k]} onChange={(e) => setF(k, e.target.value)}>
                        {DIAS.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </>
                  ) : (
                    <>
                      <span className={label}>{lb}</span>
                      <input type="number" className={input} value={form[k]} onChange={(e) => setF(k, e.target.value)} />
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={submit} className="flex-1 rounded bg-slate-900 py-2 text-sm font-bold text-white hover:bg-slate-700">
                {editId != null ? "수정 저장" : "부재 추가"}
              </button>
              {editId != null && (
                <button onClick={() => { setEditId(null); setForm({ ...DEFAULTS[formType] }); }}
                  className="rounded border border-slate-300 px-3 text-sm hover:bg-slate-50">
                  취소
                </button>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              간략식 기준: 정착·이음길이, 피복공제, 개구부 공제는 미반영. 실무 적용 전 검증 필요.
            </p>
          </div>
        </section>

        {/* ── 부재 목록 + 집계 ── */}
        <section className="space-y-4 lg:col-span-2">
          {/* 총계 카드 */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              ["콘크리트", withWaste(totals.conc, "conc"), "㎥", "text-blue-800"],
              ["거푸집", withWaste(totals.form, "form"), "㎡", "text-indigo-800"],
              ["철근", withWaste(totals.rebar, "rebar") / 1000, "ton", "text-amber-700"],
            ].map(([lb, v, u, c]) => (
              <div key={lb} className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
                <div className="text-xs text-slate-500">{lb} <span className="text-slate-400">(할증 포함)</span></div>
                <div className={`font-mono text-xl font-bold sm:text-2xl ${c}`}>{fmt(v, u === "ton" ? 3 : 2)}</div>
                <div className="text-xs text-slate-400">{u}</div>
              </div>
            ))}
          </div>

          {/* 부재 목록 */}
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold">부재 목록 <span className="font-normal text-slate-400">({members.length}건 · 행을 누르면 산출근거 표시)</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">부재</th>
                    <th className="px-3 py-2 text-left">층</th>
                    <th className="px-3 py-2 text-right">콘크리트(㎥)</th>
                    <th className="px-3 py-2 text-right">거푸집(㎡)</th>
                    <th className="px-3 py-2 text-right">철근(kg)</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">왼쪽에서 부재를 추가하면 여기에 산출 결과가 표시됩니다.</td></tr>
                  )}
                  {rows.map(({ m, r }) => (
                    <React.Fragment key={m.id}>
                      <tr onClick={() => setOpenRow(openRow === m.id ? null : m.id)}
                        className="cursor-pointer border-t border-slate-100 hover:bg-blue-50">
                        <td className="px-3 py-2">
                          <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-bold text-white ${TYPE_META[m.type].color}`}>
                            {TYPE_META[m.type].short}
                          </span>
                          <span className="font-semibold">{m.name}</span>
                          <span className="ml-1 text-xs text-slate-400">×{m.count}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{m.floor}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.conc)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.form)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.rebarTotal, 1)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={(e) => { e.stopPropagation(); startEdit(m); }}
                            className="mr-1 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">수정</button>
                          <button onClick={(e) => { e.stopPropagation(); remove(m.id); }}
                            className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">삭제</button>
                        </td>
                      </tr>
                      {openRow === m.id && (
                        <tr className="border-t border-slate-100 bg-slate-50">
                          <td colSpan={6} className="px-5 py-3 font-mono text-xs leading-relaxed text-slate-600">
                            <div>· 콘크리트 = {r.basis.conc}</div>
                            <div>· 거푸집 = {r.basis.form}</div>
                            {r.basis.rebar.map((line, i) => <div key={i}>· {line}</div>)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 집계표 */}
          <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
            <div className="flex border-b border-slate-200">
              {[["member", "부재종류별"], ["floor", "층별"], ["rebar", "철근 규격별"]].map(([k, lb]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-3 text-sm font-semibold ${tab === k ? "border-b-2 border-blue-700 text-blue-800" : "text-slate-400 hover:text-slate-600"}`}>
                  {lb}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              {tab !== "rebar" ? (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">{tab === "member" ? "부재종류" : "층"}</th>
                      <th className="px-3 py-2 text-right">콘크리트(㎥)</th>
                      <th className="px-3 py-2 text-right">거푸집(㎡)</th>
                      <th className="px-3 py-2 text-right">철근(kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(tab === "member" ? totals.byType : totals.byFloor).map(([k, v]) => (
                      <tr key={k} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold">{tab === "member" ? TYPE_META[k].label : k}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(v.conc)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(v.form)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(v.rebar, 1)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-3 py-2">합계 (순물량)</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.conc)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.form)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.rebar, 1)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">규격</th>
                      <th className="px-3 py-2 text-right">단위중량(kg/m)</th>
                      <th className="px-3 py-2 text-right">순물량(kg)</th>
                      <th className="px-3 py-2 text-right">할증 후(kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(totals.byDia).sort().map(([d, kg]) => (
                      <tr key={d} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono font-semibold text-amber-700">{d}</td>
                        <td className="px-3 py-2 text-right font-mono">{REBAR_W[d]}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(kg, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(withWaste(kg, "rebar"), 1)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                      <td className="px-3 py-2">합계</td>
                      <td></td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.rebar, 1)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(withWaste(totals.rebar, "rebar"), 1)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
