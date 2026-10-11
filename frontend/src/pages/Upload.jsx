import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';
import ReportDisplay from '../components/ReportDisplay';

function Upload() {
  const [bahagian, setBahagian] = useState('A');
  const [soalanFiles, setSoalanFiles] = useState([]);
  const [karanganFiles, setKaranganFiles] = useState([]);
  const [bankSoalan, setBankSoalan] = useState([]);
  const [useBank, setUseBank] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
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

  useEffect(() => {
    fetch(`${API_URL}/soalan-bank`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setBankSoalan(data.bank || []); })
      .catch(() => setBankSoalan([]));
  }, []);

  const filteredBank = bankSoalan.filter((s) => s.bahagian === bahagian);
  const selectedBankSoalan = filteredBank.find((s) => s.id === selectedBankId) || null;

  const MAX_SIZE = 10 * 1024 * 1024;
  const handleFilesChange = (setter) => (e) => {
    const files = Array.from(e.target.files);
    const oversized = files.find((f) => f.size > MAX_SIZE);
    if (oversized) {
      setStatus(`❌ Fail "${oversized.name}" terlalu besar (max 10MB)`);
      setProgress(0);
      e.target.value = '';
      return;
    }
    setter(files);
  };

  const removeFile = (setter, files, index) => setter(files.filter((_, i) => i !== index));

  const toggleBank = () => {
    setUseBank((prev) => {
      if (!prev) setSoalanFiles([]); // bila aktif bank, kosongkan fail soalan
      return !prev;
    });
    setSelectedBankId(null);
    setStatus('');
    setProgress(0);
  };

  const switchBahagian = (next) => {
    setBahagian(next);
    setSelectedBankId(null); // soalan bank berbeza ikut bahagian
  };

  const handleReset = () => {
    setResult(null); setGrade(null); setFeedback(null); setChatMessages([]); setStatus('');
    setProgress(0);
    setSoalanFiles([]); setKaranganFiles([]);
    setSelectedBankId(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const bankSoalanSelected = useBank ? selectedBankSoalan : null;

    if (useBank) {
      if (!bankSoalanSelected) {
        setStatus('❌ Sila pilih satu soalan daripada Bank Soalan');
        setProgress(0);
        return;
      }
    } else if (soalanFiles.length === 0) {
      setStatus('❌ Sila pilih sekurang-kurangnya satu fail untuk Soalan dan Karangan');
      setProgress(0);
      return;
    }
    if (karanganFiles.length === 0) {
      setStatus('❌ Sila pilih sekurang-kurangnya satu fail Karangan');
      setProgress(0);
      return;
    }
    setResult(null); setGrade(null); setFeedback(null); setChatMessages([]);

    // Langkah 1: simpan fail karangan (dan soalan jika ada) ke Storage
    setStatus('Sedang memuat naik...');
    setProgress(10);
    const formData = new FormData();
    formData.append('bahagian', bahagian);
    if (!useBank) soalanFiles.forEach((f) => formData.append('soalan', f));
    karanganFiles.forEach((f) => formData.append('karangan', f));

    try {
      const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        setProgress(0);
        return setStatus(`Analisis tidak dapat dilakukan. ${uploadData.error}`);
      }

      // Langkah 2: SATU panggilan /process — validate, extract, markah, feedback
      setStatus('Sedang menganalisis dan menilai karangan anda... AI sedang menyemak kandungan, bahasa, struktur dan menjana maklum balas per-perenggan.');
      setProgress(50);
      const processRes = await fetch(`${API_URL}/process`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bahagian,
          soalanPaths: uploadData.soalanPaths || [],
          karanganPaths: uploadData.karanganPaths,
          ...(bankSoalanSelected ? { soalanTextOverride: bankSoalanSelected.teks } : {}),
        }),
      });
      const processData = await processRes.json();
      if (!processData.success) {
        setProgress(0);
        return setStatus(`Analisis tidak dapat dilakukan. ${processData.error}`);
      }
      if (!processData.valid) {
        setProgress(0);
        return setStatus(`Fail tidak sah: ${processData.reason}`);
      }

      const resultData = {
        soalanText: processData.soalanText,
        karanganText: processData.karanganText,
        wordCount: processData.wordCount,
      };
      const gradeData = {
        markah: processData.markah, peringkat: processData.peringkat, justifikasi: processData.justifikasi,
        kekuatan: processData.kekuatan, kelemahan: processData.kelemahan, fokusUtama: processData.fokusUtama, rumusan: processData.rumusan,
      };
      const feedbackData = { perenggan: processData.perenggan };
      setResult(resultData);
      setGrade(gradeData);
      setFeedback(feedbackData);
      setProgress(100);
      setStatus('');

      const { data: { user } } = await supabase.auth.getUser();
      fetch(`${API_URL}/save-submission`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id, bahagian, soalanText: processData.soalanText, karanganText: processData.karanganText,
          wordCount: processData.wordCount, grade: gradeData, feedback: feedbackData,
        }),
      });
    } catch {
      setProgress(0);
      setStatus('Gagal berhubung dengan pelayan. Sila cuba lagi.');
    }
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
                <button type="button" onClick={() => switchBahagian('A')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${bahagian === 'A' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#0F172A]/50'}`}>Bahagian A</button>
                <button type="button" onClick={() => switchBahagian('B')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${bahagian === 'B' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#0F172A]/50'}`}>Bahagian B</button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#0F172A]/60">
                    {useBank ? 'Soalan (dari Bank Soalan)' : 'Soalan (boleh pilih beberapa fail)'}
                  </label>
                  <button type="button" onClick={toggleBank}
                    className={`text-xs font-medium rounded-lg px-3 py-1.5 border transition ${useBank
                      ? 'bg-[#2563EB] border-[#2563EB] text-white'
                      : 'bg-white border-[#2563EB] text-[#2563EB] hover:bg-[#EFF6FF]'}`}>
                    {useBank ? '✓ Guna Soalan dari Bank' : 'Guna Soalan dari Bank'}
                  </button>
                </div>

                {!useBank ? (
                  <>
                    <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleFilesChange(setSoalanFiles)}
                      className="w-full text-sm border border-black/10 rounded-xl px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-[#EFF6FF] file:text-[#2563EB] file:text-xs file:font-medium" />
                    {soalanFiles.length > 0 && (
                      <div className="flex flex-col gap-1 mt-2">
                        {soalanFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-[#F8FAFC] rounded-lg px-3 py-1.5">
                            <span className="truncate">{i + 1}. {f.name}</span>
                            <button type="button" onClick={() => removeFile(setSoalanFiles, soalanFiles, i)} className="text-[#F97362] ml-2 shrink-0">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredBank.length === 0 && (
                      <p className="text-sm text-[#0F172A]/40">Tiada soalan tersedia untuk bahagian ini.</p>
                    )}
                    {filteredBank.map((s) => (
                      <button type="button" key={s.id} onClick={() => setSelectedBankId(s.id)}
                        className={`text-left rounded-xl border p-4 transition ${selectedBankId === s.id
                          ? 'border-[#2563EB] bg-[#EFF6FF] ring-1 ring-[#2563EB]'
                          : 'border-black/10 hover:border-[#2563EB]/40'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#2563EB] bg-[#EFF6FF] rounded-full px-2 py-0.5">{s.jenis}</span>
                          <span className="text-xs text-[#0F172A]/40">Bahagian {s.bahagian}</span>
                        </div>
                        {selectedBankId === s.id && (
                          <p className="text-sm text-[#0F172A]/70 whitespace-pre-line mt-2">{s.teks}</p>
                        )}
                        {selectedBankId !== s.id && (
                          <p className="text-sm text-[#0F172A]/50 line-clamp-2">{s.teks.slice(0, 120)}...</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Karangan (untuk karangan panjang, upload setiap muka surat berasingan ikut turutan)</label>
                <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFilesChange(setKaranganFiles)}
                  className="w-full text-sm border border-black/10 rounded-xl px-3 py-2 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-[#EFF6FF] file:text-[#2563EB] file:text-xs file:font-medium" />
                {karanganFiles.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {karanganFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-[#F8FAFC] rounded-lg px-3 py-1.5">
                        <span className="truncate">Muka {i + 1}: {f.name}</span>
                        <button type="button" onClick={() => removeFile(setKaranganFiles, karanganFiles, i)} className="text-[#F97362] ml-2 shrink-0">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" disabled={isProcessing}
                className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-3 font-medium transition disabled:opacity-60">
                Mula Analisis
              </button>

              {isProcessing && (
                <div className="w-full h-2 bg-[#EFF6FF] rounded-full overflow-hidden">
                  <div className="h-full bg-[#2563EB] rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }} />
                </div>
              )}

              {status && (
                <div className="flex items-center justify-center gap-2 text-sm text-[#0F172A]/60 text-center">
                  {isProcessing && <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse shrink-0" />}
                  <span>{status}</span>
                  {isProcessing && <span className="font-medium text-[#2563EB] shrink-0">{progress}%</span>}
                </div>
              )}
            </form>
          </>
        )}

        {feedback && result && grade && (
          <>
            <ReportDisplay bahagian={bahagian} wordCount={result.wordCount} grade={grade} feedback={feedback} onNewAnalysis={handleReset} />

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
