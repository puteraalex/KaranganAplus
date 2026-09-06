import { BrowserRouter, Routes, Route } from 'react-router';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Upload from './pages/Upload';
import Profile from './pages/Profile';
import ResultView from './pages/ResultView';
import KaranganList from './pages/KaranganList';
import Prestasi from './pages/Prestasi';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/result/:id" element={<ResultView />} />
        <Route path="/karangan" element={<KaranganList />} />
        <Route path="/prestasi" element={<Prestasi />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;