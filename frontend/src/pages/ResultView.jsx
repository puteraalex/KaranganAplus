import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';
import ReportDisplay from '../components/ReportDisplay';
import { LoadingScreen, ErrorScreen } from '../components/LoadingScreen';

function ResultView() {
  const { id } = useParams();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/login'); return; }
      (async () => {
        try {
          const res = await fetch(`${API_URL}/submission/${id}`);
          const d = await res.json();
          if (d.success) setSubmission(d.submission);
        } catch (err) {
          setError(err.message || 'Gagal berhubung dengan pelayan');
        }
        setLoading(false);
      })();
    });
  }, [id, navigate]);

  const handleDownloadReport = async () => {
    if (!submission) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${API_URL}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentEmail: user?.email, bahagian: submission.bahagian, grade: submission.grade_data, feedback: submission.feedback_data }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'laporan-karangan.pdf'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !submission) return;
    const newMessages = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bahagian: submission.bahagian, soalanText: submission.soalan_text, karanganText: submission.karangan_text,
          grade: submission.grade_data, feedback: submission.feedback_data, messages: newMessages,
        }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, { role: 'assistant', content: data.success ? data.reply : `Ralat: ${data.error}` }]);
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Gagal berhubung dengan pelayan.' }]);
    }
    setChatLoading(false);
  };

  if (loading) return <LoadingScreen message="Sedang memuatkan laporan..." />;
  if (error) return <ErrorScreen message={error} />;
  if (!submission) return <Layout><p className="p-8 text-sm text-[#0F172A]/50">Karangan tidak dijumpai.</p></Layout>;

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <button onClick={() => navigate('/karangan')} className="text-sm text-[#0F172A]/40 hover:text-[#0F172A]/70 transition self-start">← Kembali</button>
        <p className="text-xs text-[#0F172A]/40">{new Date(submission.created_at).toLocaleDateString('ms-MY')}</p>
        <ReportDisplay bahagian={submission.bahagian} wordCount={submission.word_count} grade={submission.grade_data} feedback={submission.feedback_data} />

        <button onClick={handleDownloadReport}
          className="w-full bg-white border-2 border-[#2563EB] text-[#2563EB] hover:bg-[#EFF6FF] rounded-xl py-3 font-medium transition">
          📄 Muat Turun Laporan PDF
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5 flex flex-col gap-3">
          <p className="font-display font-semibold text-[#0F172A]">💬 Tanya Cikgu AI</p>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {chatMessages.length === 0 && <p className="text-sm text-[#0F172A]/40 text-center py-4">Ada soalan pasal result awak? Tanya di sini.</p>}
            {chatMessages.map((m, i) => (
              <div key={i} className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${m.role === 'user' ? 'bg-[#2563EB] text-white self-end rounded-br-sm' : 'bg-[#F8FAFC] self-start rounded-bl-sm'}`}>{m.content}</div>
            ))}
            {chatLoading && <p className="text-sm text-[#0F172A]/40">Sedang menaip...</p>}
          </div>
          <form onSubmit={handleSendChat} className="flex gap-2">
            <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Tanya pasal result awak..."
              className="flex-1 border border-black/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition" />
            <button type="submit" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl px-4 text-sm font-medium transition">Hantar</button>
          </form>
        </div>
      </div>
    </Layout>
  );
}

export default ResultView;