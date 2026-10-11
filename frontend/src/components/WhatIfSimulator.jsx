import { useState } from 'react';
import { FlaskConical, Sparkles, GraduationCap, GitCompare, RefreshCw, X } from 'lucide-react';
import { API_URL } from '../config';

const EXPERIMENTS = [
  { value: 'perdalam_huraian', label: 'Perdalam Huraian', desc: 'Tambah lapisan sebab-akibat dan contoh yang lebih konkrit' },
  { value: 'tambah_kbat', label: 'Tambah Unsur KBAT', desc: 'Tambah pemikiran kritis, penilaian dan sebab-akibat yang lebih mendalam' },
  { value: 'kukuhkan_contoh', label: 'Kukuhkan Contoh', desc: 'Perkukuh contoh dengan detail yang lebih spesifik dan kena dengan isi' },
  { value: 'perbaiki_logik', label: 'Perbaiki Logik Hujah', desc: 'Perbaiki aliran fikiran supaya hujah lebih tersusun' },
  { value: 'perjelas_ayat', label: 'Perjelas Ayat', desc: 'Perjelas ayat yang berbelit supaya maksud lebih mudah difahami' },
];

function badgeStyle(nilai) {
  if (nilai === 'lebih kukuh') return 'bg-[#0EA5A0]/10 text-[#0EA5A0] border border-[#0EA5A0]/30';
  if (nilai === 'setanding') return 'bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/30';
  return 'bg-[#F97362]/10 text-[#F97362] border border-[#F97362]/30';
}

function badgeSimbol(nilai) {
  if (nilai === 'lebih kukuh') return '✓';
  if (nilai === 'setanding') return '=';
  return '!';
}

function renderMarked(text) {
  const parts = String(text || '').split(/(\[\[[\s\S]*?\]\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      return (
        <mark key={i} className="bg-[#2563EB]/10 text-[#2563EB] rounded px-1">{part.slice(2, -2)}</mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function WhatIfSimulator({ originalText, soalanText, onClose }) {
  const [experimentType, setExperimentType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runExperiment = async (type) => {
    setExperimentType(type);
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${API_URL}/whatif`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText, experimentType: type, soalanText }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'AI tak dapat menjana versi baharu sekarang. Sila cuba lagi.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Gagal berhubung dengan pelayan. Sila semak internet anda dan cuba lagi.');
    }
    setLoading(false);
  };

  const reset = () => {
    setResult(null);
    setError('');
    setExperimentType(null);
    setLoading(false);
  };

  const perbandingan = result?.perbandingan || [];
  const kemahiran = result?.kemahiran || [];

  return (
    <div className="bg-[#F8FAFC] border border-black/5 rounded-2xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display font-semibold text-[#0F172A] text-sm flex items-center gap-1.5">
          <FlaskConical size={16} className="text-[#2563EB]" />
          Simulator What-If A+
        </p>
        <button onClick={onClose} className="text-xs text-[#0F172A]/40 hover:text-[#0F172A]/70 transition flex items-center gap-1">
          <X size={14} /> Tutup
        </button>
      </div>

      <p className="text-xs text-[#0F172A]/50">
        Versi asal anda kekal tidak berubah — di bawah hanya satu eksperimen untuk dibandingkan.
      </p>

      {!experimentType && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-[#0F172A]/50 uppercase tracking-wide">Pilih jenis eksperimen penambahbaikan</p>
          {EXPERIMENTS.map((e) => (
            <button
              key={e.value}
              onClick={() => runExperiment(e.value)}
              className="text-left bg-white rounded-2xl border border-black/5 px-4 py-3 hover:border-[#2563EB]/40 hover:bg-[#EFF6FF]/50 transition"
            >
              <p className="text-sm font-medium text-[#0F172A]">{e.label}</p>
              <p className="text-xs text-[#0F172A]/50 mt-0.5">{e.desc}</p>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#0F172A]/60">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
          Sedang menjana versi baharu perenggan...
        </div>
      )}

      {error && (
        <div className="bg-[#F97362]/10 border border-[#F97362]/30 rounded-2xl px-4 py-3 text-sm text-[#F97362]">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-black/5 p-4">
              <p className="text-xs font-semibold text-[#0F172A]/40 uppercase tracking-wide mb-2">Asal</p>
              <p className="text-sm text-[#0F172A]/70 whitespace-pre-wrap leading-relaxed">{originalText}</p>
            </div>
            <div className="bg-white rounded-2xl border border-black/5 p-4">
              <p className="text-xs font-semibold text-[#2563EB] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Sparkles size={14} /> Versi Baharu
              </p>
              <p className="text-sm text-[#0F172A]/70 whitespace-pre-wrap leading-relaxed">{renderMarked(result.newTextMarked)}</p>
              <p className="text-[10px] text-[#0F172A]/40 mt-2">Bahagian bertanda biru = bahagian baru atau yang berubah.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-4">
            <p className="text-xs font-semibold text-[#0F172A]/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <GraduationCap size={14} /> Penjelasan Pedagogi
            </p>
            <p className="text-sm text-[#0F172A]/70 whitespace-pre-wrap">{result.penjelasan}</p>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-4">
            <p className="text-xs font-semibold text-[#0F172A]/40 uppercase tracking-wide mb-2">Kemahiran Dipelajari</p>
            <ul className="flex flex-col gap-1.5">
              {kemahiran.length > 0 ? kemahiran.map((k, i) => (
                <li key={i} className="text-sm flex gap-2"><span className="text-[#2563EB] shrink-0">→</span>{k}</li>
              )) : <li className="text-sm text-[#0F172A]/50">Tiada maklumat.</li>}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-black/5 p-4">
            <p className="text-xs font-semibold text-[#0F172A]/40 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <GitCompare size={14} /> Perbandingan Kualitatif
            </p>
            <div className="flex flex-col gap-3">
              {perbandingan.length > 0 ? perbandingan.map((c, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-[#0F172A]">{c.kriteria}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeStyle(c.nilai)}`}>
                      {badgeSimbol(c.nilai)} {c.nilai}
                    </span>
                  </div>
                  <p className="text-xs text-[#0F172A]/60">{c.sebab}</p>
                </div>
              )) : <p className="text-sm text-[#0F172A]/50">Tiada perbandingan dibekalkan.</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 px-4 text-sm font-medium transition flex items-center justify-center gap-1.5"
            >
              <RefreshCw size={15} /> Cuba Eksperimen Lain
            </button>
            <button
              onClick={onClose}
              className="bg-white border border-black/5 text-[#0F172A]/60 hover:text-[#0F172A] rounded-xl py-2.5 px-5 text-sm font-medium transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatIfSimulator;
