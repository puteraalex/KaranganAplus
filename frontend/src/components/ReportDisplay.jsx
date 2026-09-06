import { useState } from 'react';

function ScoreRing({ score, max }) {
  const percentage = Math.min(100, (score / max) * 100);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative w-40 h-40">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#EFF6FF" strokeWidth="12" />
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#2563EB" strokeWidth="12"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold text-[#0F172A]">{score}</span>
        <span className="text-xs text-[#0F172A]/50">/ {max}</span>
      </div>
    </div>
  );
}

function ReportDisplay({ bahagian, wordCount, grade, feedback, onNewAnalysis }) {
  const [expanded, setExpanded] = useState({});
  const maxMarkah = bahagian === 'A' ? 30 : 70;
  const toggleExpand = (n) => setExpanded((prev) => ({ ...prev, [n]: !prev[n] }));

  const totalKesalahan = feedback?.perenggan?.reduce((sum, p) => sum + (p.kesalahanBahasa?.length || 0), 0) || 0;
  const totalCadangan = feedback?.perenggan?.reduce((sum, p) =>
    sum + (p.cadanganKosaKata?.length || 0) + (p.cadanganPeribahasa?.length || 0) + (p.cadanganAyat ? 1 : 0), 0) || 0;

  const semakanBahasa = feedback?.perenggan?.filter((p) => p.cadanganAyat).map((p) => ({ perenggan: p.nombor, ...p.cadanganAyat })) || [];
  const cadanganList = feedback?.perenggan?.flatMap((p) => [
    ...(p.cadanganKosaKata || []).map((c) => ({ type: 'Kosa Kata', text: c })),
    ...(p.cadanganPeribahasa || []).map((c) => ({ type: 'Peribahasa', text: c })),
  ]) || [];

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 bg-[#F8FAFC]/95 backdrop-blur-sm py-2 flex gap-4 overflow-x-auto text-xs font-medium text-[#0F172A]/50 border-b border-black/5">
        <button onClick={() => scrollTo('ringkasan')} className="whitespace-nowrap hover:text-[#2563EB] transition">Ringkasan</button>
        <button onClick={() => scrollTo('kekuatan')} className="whitespace-nowrap hover:text-[#2563EB] transition">Kekuatan</button>
        <button onClick={() => scrollTo('perenggan')} className="whitespace-nowrap hover:text-[#2563EB] transition">Perenggan</button>
        <button onClick={() => scrollTo('bahasa')} className="whitespace-nowrap hover:text-[#2563EB] transition">Bahasa</button>
        <button onClick={() => scrollTo('cadangan')} className="whitespace-nowrap hover:text-[#2563EB] transition">Cadangan</button>
      </div>

      <div id="ringkasan" className="bg-white rounded-2xl shadow-sm border border-black/5 p-8 flex flex-col items-center text-center gap-3">
        <p className="text-xs font-semibold text-[#2563EB] tracking-wide">ANALISIS KARANGAN</p>
        <p className="text-xs text-[#0F172A]/40">Bahagian {bahagian} · {wordCount} patah perkataan</p>
        <ScoreRing score={grade.markah} max={maxMarkah} />
        <span className="bg-[#EFF6FF] text-[#2563EB] text-sm font-semibold px-4 py-1 rounded-full uppercase tracking-wide">{grade.peringkat}</span>
        <p className="text-sm text-[#0F172A]/60 max-w-sm mt-1">{grade.rumusan}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-4 text-center">
          <p className="font-display text-xl font-bold text-[#0F172A]">{wordCount}</p>
          <p className="text-xs text-[#0F172A]/50 mt-1">Patah Perkataan</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-4 text-center">
          <p className="font-display text-xl font-bold text-[#F97362]">{totalKesalahan}</p>
          <p className="text-xs text-[#0F172A]/50 mt-1">Kesalahan Bahasa</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-4 text-center">
          <p className="font-display text-xl font-bold text-[#2563EB]">{totalCadangan}</p>
          <p className="text-xs text-[#0F172A]/50 mt-1">Cadangan</p>
        </div>
      </div>

      <div id="kekuatan" className="grid md:grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5">
          <p className="text-xs font-semibold text-[#0EA5A0] uppercase tracking-wide mb-3">✨ Kekuatan</p>
          <ul className="flex flex-col gap-2">
            {grade.kekuatan?.map((k, i) => <li key={i} className="text-sm flex gap-2"><span className="text-[#0EA5A0] shrink-0">✓</span>{k}</li>)}
          </ul>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5">
          <p className="text-xs font-semibold text-[#F97362] uppercase tracking-wide mb-3">🎯 Boleh Diperbaiki</p>
          <ul className="flex flex-col gap-2">
            {grade.kelemahan?.map((k, i) => <li key={i} className="text-sm flex gap-2"><span className="text-[#F97362] shrink-0">⚠</span>{k}</li>)}
          </ul>
        </div>
      </div>

      {grade.fokusUtama?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5">
          <p className="text-xs font-semibold text-[#0F172A]/50 uppercase tracking-wide mb-4">🎯 Fokus Utama</p>
          <div className="flex flex-col gap-4">
            {grade.fokusUtama.map((f, i) => (
              <div key={i} className="flex gap-3">
                <span className="font-display font-bold text-[#2563EB] shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <div><p className="text-sm font-medium text-[#0F172A]">{f.tajuk}</p><p className="text-xs text-[#0F172A]/50 mt-0.5">{f.penerangan}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="perenggan">
        <p className="font-display font-semibold text-[#0F172A] mb-3">📝 Feedback Mengikut Perenggan</p>
        <div className="flex flex-col gap-2">
          {feedback?.perenggan?.map((p) => {
            const ok = !p.kesalahanBahasa || p.kesalahanBahasa.length === 0;
            return (
              <div key={p.nombor} className="bg-white rounded-2xl shadow-sm border border-black/5 p-4">
                <button onClick={() => toggleExpand(p.nombor)} className="flex items-center justify-between w-full text-left">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span className={ok ? 'text-[#0EA5A0]' : 'text-[#F97362]'}>{ok ? '✓' : '⚠'}</span>
                    {String(p.nombor).padStart(2, '0')} {p.jenisPerenggan}
                  </span>
                  <span className="text-xs text-[#2563EB] font-medium">{expanded[p.nombor] ? 'Tutup' : 'Lihat →'}</span>
                </button>
                {expanded[p.nombor] && (
                  <div className="mt-3 pt-3 border-t border-black/5 flex flex-col gap-3 text-sm">
                    <p className="text-[#0F172A]/70">{p.komen}</p>
                    {p.kesalahanBahasa?.length > 0 && (
                      <div><p className="text-xs font-semibold text-[#0F172A]/40 uppercase mb-1">Kesalahan Bahasa</p>
                        {p.kesalahanBahasa.map((k, i) => <p key={i} className="text-[#F97362] text-xs">• {k}</p>)}</div>
                    )}
                    {p.cadanganAyat && (
                      <div><p className="text-xs font-semibold text-[#0F172A]/40 uppercase mb-1">Contoh Penambahbaikan</p>
                        <p className="text-[#0F172A]/40 line-through text-xs">{p.cadanganAyat.asal}</p>
                        <p className="text-[#2563EB] font-medium text-xs">{p.cadanganAyat.baharu}</p></div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {semakanBahasa.length > 0 && (
        <div id="bahasa">
          <p className="font-display font-semibold text-[#0F172A] mb-3">🔤 Semakan Bahasa</p>
          <div className="flex flex-col gap-3">
            {semakanBahasa.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm border border-black/5 p-4">
                <p className="text-xs text-[#0F172A]/40 mb-2">Kesalahan {String(i + 1).padStart(2, '0')} · Perenggan {s.perenggan}</p>
                <p className="text-xs text-[#0F172A]/40 uppercase font-semibold">Ayat Asal</p>
                <p className="text-sm text-[#0F172A]/50 line-through mb-2">{s.asal}</p>
                <p className="text-xs text-[#0F172A]/40 uppercase font-semibold">Cadangan</p>
                <p className="text-sm text-[#2563EB] font-medium mb-2">{s.baharu}</p>
                <p className="text-xs text-[#0F172A]/40 uppercase font-semibold">Sebab</p>
                <p className="text-sm text-[#0F172A]/60">{s.sebab}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {cadanganList.length > 0 && (
        <div id="cadangan">
          <p className="font-display font-semibold text-[#0F172A] mb-3">✍️ Cadangan Penambahbaikan</p>
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 flex flex-col gap-2">
            {cadanganList.map((c, i) => (
              <p key={i} className="text-sm"><span className="text-[#2563EB] font-medium">{c.type}:</span> <span className="text-[#0F172A]/70">{c.text}</span></p>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#0F2A5F] rounded-2xl p-6 text-center flex flex-col items-center gap-3">
        <p className="text-white/90 text-xs font-semibold tracking-wide">🎯 LANGKAH SETERUSNYA</p>
        <p className="text-white/60 text-sm">Berdasarkan analisis ini, fokus pada:</p>
        <div className="flex flex-col gap-1.5 text-left w-full max-w-xs">
          {grade.fokusUtama?.map((f, i) => (
            <p key={i} className="text-white text-sm"><span className="text-[#60A5FA]">{String(i + 1).padStart(2, '0')}</span> {f.tajuk}</p>
          ))}
        </div>
        {onNewAnalysis && (
          <button onClick={onNewAnalysis} className="mt-2 bg-white text-[#0F2A5F] rounded-xl py-2.5 px-6 text-sm font-medium hover:bg-white/90 transition">
            Analisis Karangan Baharu →
          </button>
        )}
      </div>
    </div>
  );
}

export default ReportDisplay;