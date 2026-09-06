import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../supabaseClient';
import Layout from '../components/Layout';

function Profile() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { navigate('/login'); return; }
      setEmail(data.user.email);
      setName(data.user.user_metadata?.full_name || '');
      setLoading(false);
    });
  }, [navigate]);

  const handleSave = async (e) => {
    e.preventDefault();
    setStatus('Sedang menyimpan...');
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
    setStatus(error ? `Ralat: ${error.message}` : 'Profil dikemas kini!');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (loading) return null;

  return (
    <Layout>
      <div className="flex-1 px-4 md:px-8 py-6 max-w-md w-full mx-auto flex flex-col gap-6">
        <p className="font-display text-xl font-semibold text-[#0F172A]">Tetapan</p>

        <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border border-black/5 p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">E-mel</label>
            <p className="text-sm text-[#0F172A]/50 px-4 py-2.5 bg-[#F8FAFC] rounded-xl">{email}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-[#0F172A]/60 block mb-1.5">Nama Panggilan</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Alex"
              className="w-full border border-black/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition" />
          </div>
          {status && <p className="text-sm text-center text-[#0F172A]/60">{status}</p>}
          <button type="submit" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl py-2.5 font-medium transition">Simpan</button>
        </form>

        <button onClick={handleLogout}
          className="bg-white border border-[#F97362]/30 text-[#F97362] rounded-xl py-2.5 font-medium text-sm hover:bg-[#F97362]/5 transition">
          Log Keluar
        </button>
      </div>
    </Layout>
  );
}

export default Profile;