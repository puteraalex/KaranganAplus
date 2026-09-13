import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';
import { LoadingScreen, ErrorScreen } from '../components/LoadingScreen';

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

function MiniChart({ label, data, color }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-4">
      <p className="text-xs font-semibold text-[#0F172A]/50 mb-2">{label}</p>
      {data.length < 2 ? (
        <p className="text-xs text-[#0F172A]/40 text-center py-10">Belum cukup data</p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#0F172A80' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#0F172A80' }} axisLine={false} tickLine={false} width={26} />
            <Tooltip formatter={(value) => [`${value}%`, 'Markah']} />
            <Line type="monotone" dataKey="markah" stroke={color} strokeWidth={2} dot={{ fill: color, r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Home() {
  const [user, setUser] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate('/login'); return; }
      setUser(data.session.user);
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

  if (loading) return <LoadingScreen message="Sedang memuatkan papan utama..." />;
  if (error) return <ErrorScreen message={error} />;
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0];

  const chartA = submissions.filter((s) => s.bahagian === 'A').slice().reverse().map((s, i) => ({ name: `#${i + 1}`, markah: Math.round((s.markah / s.max_markah) * 100) }));
  const chartB = submissions.filter((s) => s.bahagian === 'B').slice().reverse().map((s, i) => ({ name: `#${i + 1}`, markah: Math.round((s.markah / s.max_markah) * 100) }));

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-8">

        <div>
          <p className="font-display text-2xl font-semibold text-[#0F172A]">Selamat datang, {displayName} 👋</p>
          <p className="text-sm text-[#0F172A]/50 mt-1">Jom tingkatkan penulisan anda hari ini.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8 flex flex-col items-center text-center gap-2">
          <p className="text-xs font-semibold text-[#2563EB] tracking-wide">✨ ANALISIS KARANGAN</p>
          <p className="font-display text-lg font-semibold text-[#0F172A]">Nilai dan fahami kekuatan penulisan anda</p>
          <p className="text-sm text-[#0F172A]/50 max-w-xs">Dapatkan maklum balas AI berdasarkan keperluan Bahasa Melayu KSSM.</p>
          <button onClick={() => navigate('/upload')}
            className="mt-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 px-8 text-sm font-medium transition">
            Mula Analisis →
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 flex items-center justify-between">
          <p className="text-sm font-medium text-[#0F172A]/60">Jumlah Karangan Dianalisis</p>
          <p className="font-display text-2xl font-bold text-[#2563EB]">{submissions.length}</p>
        </div>

        <div>
          <p className="font-display font-semibold text-[#0F172A] mb-3">Perkembangan Anda</p>
          <div className="grid md:grid-cols-2 gap-3">
            <MiniChart label="Bahagian A" data={chartA} color="#2563EB" />
            <MiniChart label="Bahagian B" data={chartB} color="#0EA5A0" />
          </div>
        </div>

        <div>
          <p className="font-display font-semibold text-[#0F172A] mb-3">Pandangan AI</p>
          {!insights?.hasData ? (
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 text-center">
              <p className="text-sm text-[#0F172A]/40">Belum ada data yang mencukupi. Analisis beberapa karangan untuk melihat pandangan AI.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 flex flex-col gap-4">
              <div className="flex gap-3">
                <span className="text-lg shrink-0">✨</span>
                <div>
                  <p className="text-xs font-semibold text-[#0EA5A0] uppercase tracking-wide">Kekuatan</p>
                  <p className="text-sm text-[#0F172A]/80 mt-0.5">{insights.kekuatan}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-lg shrink-0">🎯</span>
                <div>
                  <p className="text-xs font-semibold text-[#F97362] uppercase tracking-wide">Perlu Diperbaiki</p>
                  <p className="text-sm text-[#0F172A]/80 mt-0.5">{insights.perluDiperbaiki}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-lg shrink-0">💡</span>
                <div>
                  <p className="text-xs font-semibold text-[#2563EB] uppercase tracking-wide">Fokus Seterusnya</p>
                  <p className="text-sm text-[#0F172A]/80 mt-0.5">{insights.fokusSeterusnya}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-display font-semibold text-[#0F172A]">Karangan Terkini</p>
            {submissions.length > 3 && (
              <button onClick={() => navigate('/karangan')} className="text-xs text-[#2563EB] font-medium">Lihat Semua</button>
            )}
          </div>
          {submissions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 text-center">
              <p className="text-sm text-[#0F172A]/50 mb-3">Belum ada karangan dianalisis.</p>
              <button onClick={() => navigate('/upload')} className="text-sm text-[#2563EB] font-medium">Mula Analisis →</button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {submissions.slice(0, 3).map((s) => {
                const badge = getBadgeColor(s.peringkat);
                return (
                  <button key={s.id} onClick={() => navigate(`/result/${s.id}`)}
                    className="w-full bg-white rounded-2xl shadow-sm border border-black/5 p-4 flex items-center gap-3 text-left hover:border-[#2563EB]/30 transition">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0"
                      style={{ backgroundColor: badge.bg, color: badge.text }}>
                      {s.markah}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0F172A]">Karangan Bahagian {s.bahagian}</p>
                      <p className="text-xs text-[#0F172A]/40 mt-0.5">{s.markah} / {s.max_markah} · {s.peringkat} · {relativeDate(s.created_at)}</p>
                    </div>
                    <span className="text-[#0F172A]/20">→</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default Home;