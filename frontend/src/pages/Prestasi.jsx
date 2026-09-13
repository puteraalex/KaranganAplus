import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';
import { LoadingScreen, ErrorScreen } from '../components/LoadingScreen';

function MiniChart({ label, data, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-4">
      <p className="text-xs font-semibold text-[#0F172A]/50 mb-2">{label}</p>
      {data.length < 2 ? (
        <p className="text-xs text-[#0F172A]/40 text-center py-14">Perlukan sekurang-kurangnya 2 karangan {label}</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#0F172A80' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#0F172A80' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip formatter={(value) => [`${value}%`, 'Markah']} />
            <Line type="monotone" dataKey="markah" stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Prestasi() {
  const [submissions, setSubmissions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate('/login'); return; }
      const uid = data.session.user.id;
      try {
        const [subRes, insightRes] = await Promise.all([
          fetch(`${API_URL}/submissions/${uid}`).then((r) => r.json()),
          fetch(`${API_URL}/insights/${uid}`).then((r) => r.json()),
        ]);
        if (subRes.success) setSubmissions(subRes.submissions);
        if (insightRes.success) setInsights(insightRes);
      } catch (err) {
        setError(err.message || 'Gagal berhubung dengan pelayan');
      }
      setLoading(false);
    });
  }, [navigate]);

  if (loading) return <LoadingScreen message="Sedang memuatkan prestasi..." />;
  if (error) return <ErrorScreen message={error} />;

  const bahagianA = submissions.filter((s) => s.bahagian === 'A');
  const bahagianB = submissions.filter((s) => s.bahagian === 'B');
  const chartA = bahagianA.slice().reverse().map((s, i) => ({ name: `#${i + 1}`, markah: Math.round((s.markah / s.max_markah) * 100) }));
  const chartB = bahagianB.slice().reverse().map((s, i) => ({ name: `#${i + 1}`, markah: Math.round((s.markah / s.max_markah) * 100) }));
  const avgA = bahagianA.length > 0 ? Math.round(bahagianA.reduce((s, x) => s + (x.markah / x.max_markah) * 100, 0) / bahagianA.length) : null;
  const avgB = bahagianB.length > 0 ? Math.round(bahagianB.reduce((s, x) => s + (x.markah / x.max_markah) * 100, 0) / bahagianB.length) : null;

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-8">
        <p className="font-display text-xl font-semibold text-[#0F172A]">Prestasi</p>

        {submissions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8 text-center flex flex-col items-center gap-3">
            <p className="text-sm text-[#0F172A]/50 max-w-xs">Belum ada data yang mencukupi. Analisis beberapa karangan untuk melihat prestasi anda.</p>
            <button onClick={() => navigate('/upload')} className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 px-6 text-sm font-medium transition">Mula Analisis</button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 flex items-center justify-between">
              <p className="text-sm font-medium text-[#0F172A]/60">Jumlah Karangan Dianalisis</p>
              <p className="font-display text-3xl font-bold text-[#2563EB]">{submissions.length}</p>
            </div>

            <div>
              <p className="font-display font-semibold text-[#0F172A] mb-3">Perkembangan Markah</p>
              <div className="grid md:grid-cols-2 gap-3">
                <MiniChart label="Bahagian A" data={chartA} color="#2563EB" />
                <MiniChart label="Bahagian B" data={chartB} color="#0EA5A0" />
              </div>
            </div>

            <div>
              <p className="font-display font-semibold text-[#0F172A] mb-3">Purata Mengikut Bahagian</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 text-center">
                  <p className="font-display text-2xl font-bold text-[#2563EB]">{avgA !== null ? `${avgA}%` : '—'}</p>
                  <p className="text-xs text-[#0F172A]/50 mt-1">Bahagian A ({bahagianA.length} karangan)</p>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 text-center">
                  <p className="font-display text-2xl font-bold text-[#0EA5A0]">{avgB !== null ? `${avgB}%` : '—'}</p>
                  <p className="text-xs text-[#0F172A]/50 mt-1">Bahagian B ({bahagianB.length} karangan)</p>
                </div>
              </div>
            </div>

            {insights?.hasData && (
              <div>
                <p className="font-display font-semibold text-[#0F172A] mb-3">Pandangan AI</p>
                <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 flex flex-col gap-4">
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">✨</span>
                    <div><p className="text-xs font-semibold text-[#0EA5A0] uppercase tracking-wide">Kekuatan</p><p className="text-sm text-[#0F172A]/80 mt-0.5">{insights.kekuatan}</p></div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">🎯</span>
                    <div><p className="text-xs font-semibold text-[#F97362] uppercase tracking-wide">Perlu Diperbaiki</p><p className="text-sm text-[#0F172A]/80 mt-0.5">{insights.perluDiperbaiki}</p></div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-lg shrink-0">💡</span>
                    <div><p className="text-xs font-semibold text-[#2563EB] uppercase tracking-wide">Fokus Seterusnya</p><p className="text-sm text-[#0F172A]/80 mt-0.5">{insights.fokusSeterusnya}</p></div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

export default Prestasi;