import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';

function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Kata laluan mesti sekurang-kurangnya 6 aksara.');
      return;
    }
    if (password !== confirm) {
      setError('Kata laluan tidak sepadan.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else setSuccess(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-display text-2xl font-semibold text-[#0F2A5F]">Karangan A+</p>
          <p className="text-sm text-[#0F172A]/50 mt-1">Platform AI Penulisan Bahasa Melayu SPM</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">
          {success ? (
            <>
              <h1 className="font-display text-xl font-semibold mb-4 text-[#0F172A]">Kata Laluan Berjaya Dikemas Kini</h1>
              <p className="text-sm text-[#0F172A]/60 mb-6">
                Kata laluan baharu anda telah disimpan. Sila log masuk semula dengan kata laluan baharu.
              </p>
              <button onClick={() => navigate('/login')}
                className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 font-medium transition">
                Kembali ke Log Masuk
              </button>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold mb-6 text-[#0F172A]">Tetapkan Kata Laluan Baharu</h1>
              <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Kata Laluan Baharu</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition"
                    required />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Sahkan Kata Laluan</label>
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition"
                    required />
                </div>
                {error && <p className="text-[#F97362] text-sm">{error}</p>}
                <button type="submit" disabled={loading}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 font-medium transition disabled:opacity-60 mt-2">
                  {loading ? 'Sedang menyimpan...' : 'Simpan Kata Laluan'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-sm text-center text-[#0F172A]/60 mt-6">
          <Link to="/login" className="text-[#2563EB] font-medium">Kembali ke log masuk</Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
