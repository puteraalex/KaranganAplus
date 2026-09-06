import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';

function relativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hari ini';
  if (diffDays === 1) return 'Semalam';
  if (diffDays < 7) return `${diffDays} hari lepas`;
  return date.toLocaleDateString('ms-MY');
}

function getBadgeColor(peringkat) {
  if (peringkat === 'Cemerlang' || peringkat === 'Kepujian') return { bg: '#0EA5A020', text: '#0EA5A0' };
  if (peringkat === 'Baik' || peringkat === 'Memuaskan') return { bg: '#2563EB20', text: '#2563EB' };
  return { bg: '#F9736220', text: '#F97362' };
}

function KaranganList() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate('/login'); return; }
      const res = await fetch(`${API_URL}/submissions/${data.session.user.id}`);
      const subData = await res.json();
      if (subData.success) setSubmissions(subData.submissions);
      setLoading(false);
    });
  }, [navigate]);

  if (loading) return null;

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <p className="font-display text-xl font-semibold text-[#0F172A]">Sejarah</p>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8 text-center flex flex-col items-center gap-3">
            <p className="font-display font-semibold text-[#0F172A]">Tiada Karangan</p>
            <p className="text-sm text-[#0F172A]/50 max-w-xs">Belum ada karangan dianalisis. Hantar karangan pertama anda untuk mula melihat perkembangan.</p>
            <button onClick={() => navigate('/upload')} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 px-6 text-sm font-medium transition">Mula Analisis</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {submissions.map((s) => {
              const badge = getBadgeColor(s.peringkat);
              return (
                <button key={s.id} onClick={() => navigate(`/result/${s.id}`)}
                  className="w-full bg-white rounded-2xl shadow-sm border border-black/5 p-4 flex items-center gap-3 text-left hover:border-[#2563EB]/30 transition">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0" style={{ backgroundColor: badge.bg, color: badge.text }}>{s.markah}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#0F172A]">Karangan Bahagian {s.bahagian} — {s.peringkat}</p>
                    <p className="text-xs text-[#0F172A]/40 mt-0.5">{s.markah} / {s.max_markah} · {relativeDate(s.created_at)}</p>
                  </div>
                  <span className="text-[#0F172A]/20">→</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default KaranganList;