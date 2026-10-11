import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { supabase } from '../supabaseClient';

function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else navigate('/');
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setLoading(false);
    if (error) setError(error.message);
    else setInfo('Pautan reset kata laluan telah dihantar ke e-mel anda. Sila semak peti masuk.');
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-display text-2xl font-semibold text-[#0F2A5F]">Karangan A+</p>
          <p className="text-sm text-[#0F172A]/50 mt-1">Platform AI Penulisan Bahasa Melayu SPM</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">
          {mode === 'login' ? (
            <>
              <h1 className="font-display text-xl font-semibold mb-6 text-[#0F172A]">Log Masuk</h1>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">E-mel</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition"
                    required />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Kata Laluan</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition"
                    required />
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => switchMode('reset')}
                    className="text-xs font-medium text-[#2563EB] hover:underline">
                    Lupa kata laluan?
                  </button>
                </div>
                {error && <p className="text-[#F97362] text-sm">{error}</p>}
                <button type="submit" disabled={loading}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 font-medium transition disabled:opacity-60 mt-2">
                  {loading ? 'Sedang log masuk...' : 'Log Masuk'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold mb-2 text-[#0F172A]">Lupa Kata Laluan</h1>
              <p className="text-sm text-[#0F172A]/60 mb-6">Masukkan e-mel anda dan kami akan hantar pautan untuk reset kata laluan.</p>
              <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">E-mel</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition"
                    required />
                </div>
                {error && <p className="text-[#F97362] text-sm">{error}</p>}
                {info && <p className="text-[#2563EB] text-sm">{info}</p>}
                <button type="submit" disabled={loading}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 font-medium transition disabled:opacity-60 mt-2">
                  {loading ? 'Sedang menghantar...' : 'Hantar Pautan Reset'}
                </button>
                <button type="button" onClick={() => switchMode('login')}
                  className="text-sm text-[#0F172A]/60 hover:text-[#2563EB] transition">
                  ← Kembali ke log masuk
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-sm text-center text-[#0F172A]/60 mt-6">
          Tiada akaun? <Link to="/signup" className="text-[#2563EB] font-medium">Daftar</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
