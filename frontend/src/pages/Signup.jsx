import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { supabase } from '../supabaseClient';

function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else setSuccess(true);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">
            <p className="text-3xl mb-3">✅</p>
            <h1 className="font-display text-lg font-semibold mb-2 text-[#0F172A]">Akaun Berjaya Dicipta</h1>
            <p className="text-sm text-[#0F172A]/60 mb-6">Sila log masuk untuk mula guna Karangan A+.</p>
            <Link to="/login" className="inline-block bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 px-6 font-medium transition">
              Log Masuk
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-display text-2xl font-semibold text-[#0F2A5F]">Karangan A+</p>
          <p className="text-sm text-[#0F172A]/50 mt-1">Platform AI Penulisan Bahasa Melayu SPM</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">
          <h1 className="font-display text-xl font-semibold mb-6 text-[#0F172A]">Daftar Akaun</h1>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
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
                placeholder="Minimum 6 aksara" required />
            </div>
            {error && <p className="text-[#F97362] text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 font-medium transition disabled:opacity-60 mt-2">
              {loading ? 'Sedang daftar...' : 'Daftar'}
            </button>
          </form>
        </div>

        <p className="text-sm text-center text-[#0F172A]/60 mt-6">
          Dah ada akaun? <Link to="/login" className="text-[#2563EB] font-medium">Log Masuk</Link>
        </p>
      </div>
    </div>
  );
}

export default Signup;