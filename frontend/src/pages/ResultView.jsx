import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { supabase } from '../supabaseClient';
import { API_URL } from '../config';
import Layout from '../components/Layout';
import ReportDisplay from '../components/ReportDisplay';

function ResultView() {
  const { id } = useParams();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/login'); return; }
      fetch(`${API_URL}/submission/${id}`).then((r) => r.json())
        .then((d) => { if (d.success) setSubmission(d.submission); setLoading(false); });
    });
  }, [id, navigate]);

  if (loading) return null;
  if (!submission) return <Layout><p className="p-8 text-sm text-[#0F172A]/50">Karangan tidak dijumpai.</p></Layout>;

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <button onClick={() => navigate('/karangan')} className="text-sm text-[#0F172A]/40 hover:text-[#0F172A]/70 transition self-start">← Kembali</button>
        <p className="text-xs text-[#0F172A]/40">{new Date(submission.created_at).toLocaleDateString('ms-MY')}</p>
        <ReportDisplay bahagian={submission.bahagian} wordCount={submission.word_count} grade={submission.grade_data} feedback={submission.feedback_data} />
      </div>
    </Layout>
  );
}

export default ResultView;