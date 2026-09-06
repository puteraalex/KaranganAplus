import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';
import ReportDisplay from '../components/ReportDisplay';

function Upload() {
  const [bahagian, setBahagian] = useState('A');
  const [soalanFile, setSoalanFile] = useState(null);
  const [karanganFile, setKaranganFile] = useState(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [grade, setGrade] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [checking, setChecking] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate('/login');
      setChecking(false);
    });
  }, [navigate]);

  const MAX_SIZE = 10 * 1024 * 1024;
  const handleFileChange = (setter) => (e) => {
    const file = e.target.files[0];
    if (file && file.size > MAX_SIZE) { setStatus('❌ Fail terlalu besar (max 10MB)'); e.target.value = ''; return; }
    setter(file);
  };

  const handleReset = () => {
    setResult(null); setGrade(null); setFeedback(null); setChatMessages([]); setStatus('');
    setSoalanFile(null); setKaranganFile(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!soalanFile || !karanganFile) return;
    handleReset();
    setStatus('Sedang memuat naik...');
    const formData = new FormData();
    formData.append('bahagian', bahagian);
    formData.append('soalan', soalanFile);
    formData.append('karangan', karanganFile);

    try {
      const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) return setStatus(`Analisis tidak dapat dilakukan. ${uploadData.error}`);

      setStatus('Sedang menganalisis karangan anda... AI sedang menyemak kandungan, bahasa dan struktur penulisan.');
      const analyzeRes = await fetch(`${API_URL}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soalanPath: uploadData.soalanPath, karanganPath: uploadData.karanganPath }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) return setStatus(`Analisis tidak dapat dilakukan. ${analyzeData.error}`);
      if (!analyzeData.valid) return setStatus(`Fail tidak sah: ${analyzeData.reason}`);
      setResult(analyzeData);

      const understandRes = await fetch(`${API_URL}/understand`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bahagian, soalanText: analyzeData.soalanText, karanganText: analyzeData.karanganText, wordCount: analyzeData.wordCount }),
      });
      await understandRes.json();

      const gradeRes = await fetch(`${API_URL}/grade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bahagian, soalanText: analyzeData.soalanText, karanganText: analyzeData.karanganText, wordCount: analyzeData.wordCount }),
      });
      const gradeData = await gradeRes.json();
      if (!gradeData.success) return setStatus(`Analisis tidak dapat dilakukan. ${gradeData.error}`);
      setGrade(gradeData);

      const feedbackRes = await fetch(`${API_URL}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bahagian, karanganText: analyzeData.karanganText, wordCount: analyzeData.wordCount }),
      });
      const feedbackData = await feedbackRes.json();
      if (!feedbackData.success) return setStatus(`Analisis tidak dapat dilakukan. ${feedbackData.error}`);
      setFeedback(feedbackData);
      setStatus('');

      const { data: { user } } = await supabase.auth.getUser();
      fetch(`${API_URL}/save-submission`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id, bahagian, soalanText: analyzeData.soalanText, karanganText: analyzeData.karanganText,
          wordCount: analyzeData.wordCount, grade: gradeData, feedback: feedbackData,
        }),
      });
    } catch {
      setStatus('Gagal berhubung dengan pelayan. Sila cuba lagi.');
    }
  };

  const handleDownloadReport = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch(`${API_URL}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentEmail: user?.email, bahagian, grade, feedback }),
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
    if (!chatInput.trim()) return;
    const newMessages = [...chatMessages, { role: 'user', content: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bahagian, soalanText: result.soalanText, karanganText: result.karanganText, grade, feedback, messages: newMessages }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, { role: 'assistant', content: data.success ? data.reply : `Ralat: ${data.error}` }]);
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: 'Gagal berhubung dengan pelayan.' }]);
    }
    setChatLoading(false);
  };

  if (checking) return null;
  const isProcessing = status && !status.startsWith('❌') && !status.startsWith('Analisis tidak') && !status.startsWith('Fail tidak') && !status.startsWith('Gagal') && status !== '';

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-6">

        {!feedback && (
          <>
            <p className="font-display text-xl font-semibold text-[#0F172A]">Analisis Karangan</p>
            <form onSubmit={handleUpload} className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 flex flex-col gap-4">
              <div className="flex gap-1 bg-[#F8FAFC] rounded-xl p-1">
                <button type="button" onClick={() => setBahagian('A')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${bahagian === 'A' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#0F172A]/50'}`}>Bahagian A</button>
                <button type="button" onClick={() => setBahagian('B')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${bahagian === 'B' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#0F172A]/50'}`}>Bahagian B</button>
              </div>

              <div className="border-2 border-dashed border-black/10 rounded-xl p-6 flex flex-col items-center gap-2 text-center">
                <span className="text-3xl">📄</span>
                <p className="text-sm font-medium text-[#0F172A]">Muat naik karangan anda</p>
                <p className="text-xs text-[#0F172A]/40">Format disokong: PDF / Imej</p>
              </div>

              <div>
                <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Soalan</label>
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange(setSoalanFile)}
                  className="w-full text-sm border border-black/10 rounded-xl px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-[#EFF6FF] file:text-[#2563EB] file:text-xs file:font-medium" required />
              </div>
              <div>
                <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Karangan</label>
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange(setKaranganFile)}
                  className="w-full text-sm border border-black/10 rounded-xl px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-[#EFF6FF] file:text-[#2563EB] file:text-xs file:font-medium" required />
              </div>

              <button type="submit" disabled={isProcessing}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-3 font-medium transition disabled:opacity-60">
                Mula Analisis
              </button>
              {status && (
                <div className="flex items-center justify-center gap-2 text-sm text-[#0F172A]/60 text-center">
                  {isProcessing && <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse shrink-0" />}
                  <span>{status}</span>
                </div>
              )}
            </form>
          </>
        )}

        {feedback && result && grade && (
          <>
            <ReportDisplay bahagian={bahagian} wordCount={result.wordCount} grade={grade} feedback={feedback} onNewAnalysis={handleReset} />

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
          </>
        )}
      </div>
    </Layout>
  );
}

export default Upload;