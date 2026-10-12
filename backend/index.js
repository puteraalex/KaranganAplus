const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const supabase = require('./supabaseClient');
const { RUBRIK_BAHAGIAN_A, RUBRIK_BAHAGIAN_B } = require('./rubric');
const OpenAI = require('openai');
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const PORT = process.env.PORT || 5000;

const PDFDocument = require('pdfkit');

app.use(cors());
app.use(express.json());

// ===== Jelajah Idea: helper =====
const ZON_SAHA = ['huraian', 'contoh', 'kbat', 'ayat'];
const STRATEGI_SAHA = ['sebab_akibat', 'contoh', 'kbat', 'ayat'];
const KEPUTUSAN_SAHA = ['terima', 'tolak', 'edit', 'guna_sendiri'];
const AMBANG_XP = [0, 30, 80, 150, 250];
const LENCANA = [
  { id: 'pakar_huraian', nama: 'Pakar Huraian', zon: 'huraian' },
  { id: 'pemburu_hujah', nama: 'Pemburu Hujah', zon: 'contoh' },
  { id: 'penguasa_kbat', nama: 'Penguasa KBAT', zon: 'kbat' },
  { id: 'penggilap_ayat', nama: 'Penggilap Ayat', zon: 'ayat' },
];
const LABEL_STRATEGI = {
  sebab_akibat: 'Sebab-Akibat: perkukuh hubungan sebab dan akibat dalam hujah',
  contoh: 'Contoh: tambah contoh yang konkrit dan kena dengan isi',
  kbat: 'KBAT: tambah pemikiran kritis, penilaian dan andaian berasaskan teks',
  ayat: 'Ayat: perjelas dan kemas ayat supaya maksud lebih mudah difahami',
};

function normalisasiRuang(teks) {
  return String(teks || '').replace(/\s+/g, ' ').trim();
}

// Sahkan akses token Supabase. Pulangkan user.id, atau hantar 401 dan pulangkan null.
async function requireUser(req, res) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ success: false, error: 'Sesi anda telah tamat. Sila log masuk semula.' });
      return null;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) {
      res.status(401).json({ success: false, error: 'Sesi anda telah tamat. Sila log masuk semula.' });
      return null;
    }
    return data.user.id;
  } catch {
    res.status(401).json({ success: false, error: 'Sesi anda telah tamat. Sila log masuk semula.' });
    return null;
  }
}

// Buang misi yang tak sah: zon bukan salah satu zon sah, petikan bukan salinan tepat
// daripada teksAsal perenggan itu, atau lebih daripada satu misi bagi zon yang sama.
function sahkanMisi(result) {
  const senaraiMisi = Array.isArray(result?.misi) ? result.misi : [];
  const perenggan = Array.isArray(result?.perenggan) ? result.perenggan : [];
  const digunakan = new Set();
  const ditapis = [];

  for (const m of senaraiMisi) {
    if (!m || typeof m !== 'object') continue;
    if (!ZON_SAHA.includes(m.zon)) continue;
    const nombor = Number(m.perenggan);
    if (!Number.isInteger(nombor)) continue;
    const kunci = `${m.zon}:${nombor}`;
    if (digunakan.has(kunci)) continue;

    const p = perenggan.find((x) => Number(x?.nombor) === nombor);
    const teksAsal = typeof p?.teksAsal === 'string' ? p.teksAsal : '';
    const petikan = typeof m.petikan === 'string' ? m.petikan.trim() : '';
    const sebab = typeof m.sebab === 'string' ? m.sebab.trim() : '';
    const soalanFikir = typeof m.soalanFikir === 'string' ? m.soalanFikir.trim() : '';
    if (!teksAsal || !petikan || !sebab || !soalanFikir) continue;
    if (!normalisasiRuang(teksAsal).includes(normalisasiRuang(petikan))) continue;

    digunakan.add(kunci);
    ditapis.push({ zon: m.zon, perenggan: nombor, petikan, sebab, soalanFikir });
    if (ditapis.length >= 4) break;
  }

  result.misi = ditapis.map((m, i) => ({ id: `m${i + 1}`, ...m }));
  return result;
}

function isRalatKolumTiada(error) {
  if (!error) return false;
  return /42703|PGRST204|does not exist|column/i.test(`${error.code || ''} ${error.message || ''}`);
}

function isRalatUnik(error) {
  if (!error) return false;
  return /23505|duplicate key|unique/i.test(`${error.code || ''} ${error.message || ''}`);
}

// Simpan cubaan Jelajah Idea. Jika jadual belum ada kolum refleksi, buang dan cuba lagi.
async function simpanCubaan(row) {
  let hasil = await supabase.from('jelajah_attempts').insert(row).select().single();
  if (isRalatKolumTiada(hasil.error) && 'refleksi' in row) {
    const { refleksi, ...tanpaRefleksi } = row;
    hasil = await supabase.from('jelajah_attempts').insert(tanpaRefleksi).select().single();
  }
  return hasil;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getExtension(mimetype) {
  const map = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimetype] || 'bin';
}

function buildContentPart(blob, base64, filename) {
  if (blob.type === 'application/pdf') {
    return { type: 'input_file', filename, file_data: `data:application/pdf;base64,${base64}` };
  }
  return { type: 'input_image', image_url: `data:${blob.type};base64,${base64}` };
}

app.get('/', (req, res) => {
  res.json({ message: 'Karangan A+ backend is running!' });
});

app.get('/test-supabase', async (req, res) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, message: 'Supabase connected!', data });
});

app.get('/test-openai', async (req, res) => {
  try {
    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: 'Say hello in Bahasa Melayu, one sentence only.',
    });
    res.json({ success: true, message: response.output_text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/upload', upload.fields([
  { name: 'soalan', maxCount: 5 },
  { name: 'karangan', maxCount: 5 },
]), async (req, res) => {
  try {
    const { bahagian } = req.body;
    const soalanFiles = req.files?.soalan || [];
    const karanganFiles = req.files?.karangan || [];

    if (!bahagian || soalanFiles.length === 0 || karanganFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'Bahagian, soalan, dan karangan semua wajib diisi' });
    }

    const allFiles = [...soalanFiles, ...karanganFiles];
    const invalidFile = allFiles.find((f) => !ALLOWED_TYPES.includes(f.mimetype));
    if (invalidFile) {
      return res.status(400).json({
        success: false,
        error: 'Format tak disokong. Guna PDF, JPEG, PNG, WEBP, atau GIF (HEIC dari iPhone tak disokong).',
      });
    }

    const timestamp = Date.now();
    const soalanPaths = [];
    for (let i = 0; i < soalanFiles.length; i++) {
      const file = soalanFiles[i];
      const path = `${bahagian}_soalan_${timestamp}_${i}.${getExtension(file.mimetype)}`;
      const { error } = await supabase.storage.from('karangan-uploads').upload(path, file.buffer, { contentType: file.mimetype });
      if (error) return res.status(500).json({ success: false, error: `Soalan upload: ${error.message}` });
      soalanPaths.push(path);
    }

    const karanganPaths = [];
    for (let i = 0; i < karanganFiles.length; i++) {
      const file = karanganFiles[i];
      const path = `${bahagian}_karangan_${timestamp}_${i}.${getExtension(file.mimetype)}`;
      const { error } = await supabase.storage.from('karangan-uploads').upload(path, file.buffer, { contentType: file.mimetype });
      if (error) return res.status(500).json({ success: false, error: `Karangan upload: ${error.message}` });
      karanganPaths.push(path);
    }

    res.json({ success: true, message: 'Upload berjaya!', bahagian, soalanPaths, karanganPaths });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/analyze', async (req, res) => {
  const { soalanPaths, karanganPaths } = req.body;
  if (!soalanPaths?.length || !karanganPaths?.length) {
    return res.status(400).json({ success: false, error: 'soalanPaths dan karanganPaths diperlukan' });
  }

  try {
    const soalanParts = [];
    for (let i = 0; i < soalanPaths.length; i++) {
      const { data: blob, error } = await supabase.storage.from('karangan-uploads').download(soalanPaths[i]);
      if (error) throw new Error(error.message);
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      soalanParts.push(buildContentPart(blob, base64, `soalan-${i + 1}`));
    }

    const karanganParts = [];
    for (let i = 0; i < karanganPaths.length; i++) {
      const { data: blob, error } = await supabase.storage.from('karangan-uploads').download(karanganPaths[i]);
      if (error) throw new Error(error.message);
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      karanganParts.push(buildContentPart(blob, base64, `karangan-${i + 1}`));
    }

    const prompt = `Awak ialah AI Examiner untuk karangan Bahasa Melayu SPM. Fail-fail ni (PDF atau imej) dihantar ikut TURUTAN — anggap SEMUA fail soalan sebagai SATU dokumen soalan berterusan, dan SEMUA fail karangan sebagai SATU karangan berterusan (mungkin beberapa muka surat karangan panjang).

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown):
{
  "valid": true atau false (false jika fail bukan soalan/karangan BM yang sah, contoh: kosong, subjek lain, tak berkaitan),
  "reason": "sebab ringkas jika valid=false, kosongkan string jika valid=true",
  "soalanText": "teks soalan yang di-extract (gabungkan semua muka surat)",
  "karanganText": "teks karangan yang di-extract (gabungkan semua muka surat ikut turutan)",
  "wordCount": jumlah patah perkataan dalam karangan sahaja (integer)
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: [{
        role: 'user',
        content: [...soalanParts, ...karanganParts, { type: 'input_text', text: prompt }],
      }],
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/understand', async (req, res) => {
  const { bahagian, soalanText, karanganText, wordCount } = req.body;
  if (!bahagian || !soalanText || !karanganText || wordCount === undefined) {
    return res.status(400).json({ success: false, error: 'bahagian, soalanText, karanganText, wordCount diperlukan' });
  }

  try {
    const limit = bahagian === 'A' ? '150-200' : '350-500';
    const prompt = `Awak ialah AI Examiner Bahasa Melayu SPM. Berdasarkan SOALAN dan KARANGAN ni, buat analysis berikut:

SOALAN: ${soalanText}

KARANGAN: ${karanganText}

BAHAGIAN: ${bahagian} (had word count rasmi: ${limit} patah perkataan)
JUMLAH PERKATAAN SEBENAR: ${wordCount}
PENTING: Semua text dalam jawapan (jenisSoalan, isiUtama, wordCountMesej) MESTI 100% Bahasa Melayu, jangan guna sebarang perkataan Inggeris.
Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown):
{
  "jenisSoalan": "jenis soalan (contoh: Pendapat, Punca, Langkah, Cerita, Surat Rasmi, dll)",
  "strukturLengkap": true atau false (ada pendahuluan, isi, dan penutup yang jelas),
  "isiUtama": ["senarai ringkas setiap isi yang dikenalpasti"],
  "wordCountStatus": "sesuai" atau "terlalu pendek" atau "terlalu panjang",
  "wordCountMesej": "penjelasan ringkas"
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: prompt,
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/grade', async (req, res) => {
  const { bahagian, soalanText, karanganText, wordCount } = req.body;
  if (!bahagian || !soalanText || !karanganText || wordCount === undefined) {
    return res.status(400).json({ success: false, error: 'bahagian, soalanText, karanganText, wordCount diperlukan' });
  }

  try {
    const rubrik = bahagian === 'A' ? RUBRIK_BAHAGIAN_A : RUBRIK_BAHAGIAN_B;
    const maxMarkah = bahagian === 'A' ? 30 : 70;

    const prompt = `Awak ialah pemeriksa SPM Bahasa Melayu yang berpengalaman. Nilai karangan ni dengan TEPAT ikut rubrik rasmi KSSM di bawah — JANGAN beri markah secara rawak atau longgar, ikut kriteria dan had markah dengan tegas.

RUBRIK RASMI:
${rubrik}

SOALAN: ${soalanText}

KARANGAN PELAJAR: ${karanganText}

JUMLAH PERKATAAN: ${wordCount}

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown), semua text dalam Bahasa Melayu:
{
  "markah": nombor markah akhir (integer, 0 hingga ${maxMarkah}),
  "peringkat": "nama peringkat (Cemerlang/Kepujian/Baik/Memuaskan/Kurang Memuaskan/Pencapaian Minimum)",
  "justifikasi": {
    "temaTugasan": "penjelasan sejauh mana karangan menepati tema/tugasan",
    "idea": "penjelasan tentang kualiti idea dan huraian",
    "bahasa": "penjelasan tentang tatabahasa, ejaan, kosa kata",
    "pengolahan": "penjelasan tentang struktur wacana dan gaya penulisan"
  },
  "kekuatan": ["senarai 2-4 kekuatan utama karangan ni"],
  "kelemahan": ["senarai 2-4 kelemahan utama karangan ni"],
  "fokusUtama": [
    { "tajuk": "tajuk pendek isu paling penting", "penerangan": "penerangan ringkas 1 ayat" },
    { "tajuk": "tajuk pendek isu kedua", "penerangan": "penerangan ringkas 1 ayat" },
    { "tajuk": "tajuk pendek isu ketiga", "penerangan": "penerangan ringkas 1 ayat" }
  ],
  "rumusan": "rumusan keseluruhan prestasi pelajar dalam 2-3 ayat, termasuk galakan untuk perbaiki",
  "sebabMarkah": "ringkasan keseluruhan kenapa markah ni diberi"
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: prompt,
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/feedback', async (req, res) => {
  const { bahagian, karanganText, wordCount } = req.body;
  if (!bahagian || !karanganText || wordCount === undefined) {
    return res.status(400).json({ success: false, error: 'bahagian, karanganText, wordCount diperlukan' });
  }

  try {
    const limit = bahagian === 'A' ? '150-200' : '350-500';
    const prompt = `Awak ialah pemeriksa SPM Bahasa Melayu. Analisis KARANGAN ni PERENGGAN DEMI PERENGGAN, dan beri maklum balas yang SANGAT SPESIFIK (bukan generik) untuk setiap perenggan.

KARANGAN:
${karanganText}

Had patah perkataan rasmi Bahagian ${bahagian}: ${limit}. PENTING: semua cadangan (kosa kata, peribahasa, ayat baharu) MESTI pendek dan sesuai dengan gaya asal — jangan cadangkan penambahan besar yang akan buat karangan jauh melebihi had ni.

Untuk SETIAP perenggan, kenal pasti jenis perenggan (Pendahuluan/Isi 1/Isi 2/dst/Penutup), dan beri:
- Komen spesifik (bukan umum macam "karangan anda baik" — kena sebut isu/kekuatan tertentu)
- Kesalahan bahasa (tatabahasa/ejaan/struktur ayat) yang dijumpai
- Cadangan kosa kata (perkataan asal -> gantian lebih baik, dengan sebab ringkas)
- Cadangan peribahasa yang sesuai untuk konteks perenggan tu (jika berkaitan)
- Satu ayat asal dari perenggan tu + cadangan ayat baharu + sebab ia lebih baik

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown), semua text Bahasa Melayu:
{
  "perenggan": [
    {
      "nombor": 1,
      "jenisPerenggan": "Pendahuluan",
      "komen": "...",
      "kesalahanBahasa": ["...", "..."],
      "cadanganKosaKata": ["perkataan asal -> cadangan (sebab)"],
      "cadanganPeribahasa": ["peribahasa + cara guna dalam konteks ni"],
      "cadanganAyat": { "asal": "...", "baharu": "...", "sebab": "..." }
    }
  ]
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: prompt,
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/report', async (req, res) => {
  const { studentEmail, bahagian, grade, feedback } = req.body;
  if (!bahagian || !grade || !feedback) {
    return res.status(400).json({ success: false, error: 'bahagian, grade, feedback diperlukan' });
  }

  try {
    const maxMarkah = bahagian === 'A' ? 30 : 70;
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=laporan-karangan.pdf');
    doc.pipe(res);

    doc.fontSize(20).fillColor('#6D5EF5').text('Laporan Penilaian Karangan', { align: 'center' });
    doc.fontSize(12).fillColor('#333333').text('Karangan A+', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11).fillColor('black');
    doc.text(`Pelajar: ${studentEmail || '-'}`);
    doc.text(`Tarikh: ${new Date().toLocaleDateString('ms-MY')}`);
    doc.text(`Bahagian: ${bahagian}`);
    doc.moveDown();

    doc.fontSize(28).fillColor('#6D5EF5').text(`${grade.markah} / ${maxMarkah}`, { align: 'center' });
    doc.fontSize(14).fillColor('black').text(grade.peringkat, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#6D5EF5').text('Ringkasan Prestasi');
    doc.fontSize(11).fillColor('black');
    doc.text(`Tema/Tugasan: ${grade.justifikasi?.temaTugasan || '-'}`);
    doc.text(`Idea: ${grade.justifikasi?.idea || '-'}`);
    doc.text(`Bahasa: ${grade.justifikasi?.bahasa || '-'}`);
    doc.text(`Pengolahan: ${grade.justifikasi?.pengolahan || '-'}`);
    doc.moveDown();

    doc.fontSize(14).fillColor('#6D5EF5').text('Kekuatan');
    doc.fontSize(11).fillColor('black');
    (grade.kekuatan || []).forEach((k) => doc.text(`• ${k}`));
    doc.moveDown();

    doc.fontSize(14).fillColor('#6D5EF5').text('Kelemahan');
    doc.fontSize(11).fillColor('black');
    (grade.kelemahan || []).forEach((k) => doc.text(`• ${k}`));
    doc.moveDown();

    doc.fontSize(14).fillColor('#6D5EF5').text('Maklum Balas Per-Perenggan');
    doc.moveDown(0.5);
    (feedback.perenggan || []).forEach((p) => {
      doc.fontSize(12).fillColor('#6D5EF5').text(`Perenggan ${p.nombor} — ${p.jenisPerenggan}`);
      doc.fontSize(10).fillColor('black').text(p.komen);
      if (p.kesalahanBahasa?.length) {
        doc.text('Kesalahan Bahasa:');
        p.kesalahanBahasa.forEach((k) => doc.text(`  • ${k}`));
      }
      if (p.cadanganKosaKata?.length) {
        doc.text('Cadangan Kosa Kata:');
        p.cadanganKosaKata.forEach((k) => doc.text(`  • ${k}`));
      }
      if (p.cadanganPeribahasa?.length) {
        doc.text('Cadangan Peribahasa:');
        p.cadanganPeribahasa.forEach((k) => doc.text(`  • ${k}`));
      }
      if (p.cadanganAyat) {
        doc.text(`Cadangan Ayat: "${p.cadanganAyat.asal}" -> "${p.cadanganAyat.baharu}"`);
      }
      doc.moveDown();
    });

    doc.fontSize(14).fillColor('#6D5EF5').text('Rumusan');
    doc.fontSize(11).fillColor('black').text(grade.rumusan || '-');

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/chat', async (req, res) => {
  const { bahagian, soalanText, karanganText, grade, feedback, messages } = req.body;
  if (!karanganText || !grade || !feedback || !messages) {
    return res.status(400).json({ success: false, error: 'karanganText, grade, feedback, messages diperlukan' });
  }

  try {
    const maxMarkah = bahagian === 'A' ? 30 : 70;
    const systemContext = `Awak ialah cikgu Bahasa Melayu yang membantu pelajar fahami result peperiksaan SPM dia.

PENTING - HAD SKOP: Awak HANYA boleh bincang pasal karangan dan feedback pelajar ni SAHAJA. Kalau pelajar tanya topik lain (subjek lain, soalan umum, atau apa-apa tak berkaitan result ni), tolak dengan sopan dan arahkan balik ke topik result karangan ni.

KONTEKS RESULT PELAJAR:
Bahagian: ${bahagian}
Soalan: ${soalanText}
Karangan Pelajar: ${karanganText}
Markah: ${grade.markah}/${maxMarkah} (${grade.peringkat})
Justifikasi: ${JSON.stringify(grade.justifikasi)}
Kekuatan: ${(grade.kekuatan || []).join(', ')}
Kelemahan: ${(grade.kelemahan || []).join(', ')}
Feedback Per-Perenggan: ${JSON.stringify(feedback.perenggan)}

Jawab soalan pelajar dengan mesra dan membantu, macam cikgu sebenar. Guna Bahasa Melayu.`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      instructions: systemContext,
      input: messages,
    });

    res.json({ success: true, reply: response.output_text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/save-submission', async (req, res) => {
  const { userId, bahagian, soalanText, karanganText, wordCount, grade, feedback } = req.body;
  if (!userId || !bahagian || !grade) {
    return res.status(400).json({ success: false, error: 'userId, bahagian, grade diperlukan' });
  }

  try {
    const maxMarkah = bahagian === 'A' ? 30 : 70;
    const { data, error } = await supabase.from('submissions').insert({
      user_id: userId,
      bahagian,
      markah: grade.markah,
      max_markah: maxMarkah,
      peringkat: grade.peringkat,
      soalan_text: soalanText,
      karangan_text: karanganText,
      word_count: wordCount,
      grade_data: grade,
      feedback_data: feedback,
    }).select().single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, submission: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/submissions/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('id, bahagian, markah, max_markah, peringkat, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, submissions: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/submission/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, submission: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/insights/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: subs, error } = await supabase
      .from('submissions')
      .select('grade_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!subs || subs.length === 0) {
      return res.json({ success: true, hasData: false });
    }

    const summaries = subs.map((s) => ({
      kekuatan: s.grade_data?.kekuatan || [],
      kelemahan: s.grade_data?.kelemahan || [],
    }));

    const prompt = `Berdasarkan data kekuatan dan kelemahan dari ${summaries.length} karangan terkini pelajar ni:

${JSON.stringify(summaries)}

Kenal pasti POLA yang berulang merentasi karangan-karangan ni (bukan sekadar ulang satu je, cari trend keseluruhan). Jawab HANYA dalam JSON:
{
  "kekuatan": "1 ayat pendek tentang kekuatan konsisten pelajar",
  "perluDiperbaiki": "1 ayat pendek tentang isu yang KERAP berulang",
  "fokusSeterusnya": "1 cadangan tindakan konkrit untuk karangan seterusnya"
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: prompt,
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    res.json({ success: true, hasData: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/evaluate', async (req, res) => {
  const { bahagian, soalanText, karanganText, wordCount } = req.body;
  if (!bahagian || !soalanText || !karanganText || wordCount === undefined) {
    return res.status(400).json({ success: false, error: 'bahagian, soalanText, karanganText, wordCount diperlukan' });
  }

  try {
    const rubrik = bahagian === 'A' ? RUBRIK_BAHAGIAN_A : RUBRIK_BAHAGIAN_B;
    const maxMarkah = bahagian === 'A' ? 30 : 70;
    const limit = bahagian === 'A' ? '150-200' : '350-500';

    const prompt = `Awak ialah pemeriksa SPM Bahasa Melayu yang berpengalaman dan mesra. Nilai karangan ni SEPENUHNYA dalam SATU respons — struktur, markah ikut rubrik, dan feedback setiap perenggan sekali gus.

RUBRIK RASMI:
${rubrik}

SOALAN: ${soalanText}

KARANGAN PELAJAR: ${karanganText}

JUMLAH PERKATAAN: ${wordCount} (had rasmi Bahagian ${bahagian}: ${limit})

PENTING - CADANGAN: semua cadangan (kosa kata, peribahasa, ayat baharu) MESTI pendek dan sesuai gaya asal.

PENTING - KESALAHAN BAHASA: Dalam senarai "kesalahanBahasa" setiap perenggan, HANYA masukkan kesalahan yang JELAS dan OBJEKTIF — seperti kesalahan EJAAN, kesalahan PENGGUNAAN KATA (perkataan yang salah maksud/tidak tepat), atau kesalahan TANDA BACA. JANGAN masukkan ayat yang sekadar terasa "kurang gramatis" atau sekadar gaya penulisan berbeza daripada gaya formal — kesalahan mesti jelas dan boleh dibuktikan salah, bukan tanggapan subjektif.

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown), semua text Bahasa Melayu:
{
  "jenisSoalan": "jenis soalan (Pendapat/Punca/Langkah/Cerita/Surat Rasmi, dll)",
  "strukturLengkap": true atau false,
  "markah": nombor markah akhir (integer, 0 hingga ${maxMarkah}),
  "peringkat": "nama peringkat (Cemerlang/Kepujian/Baik/Memuaskan/Kurang Memuaskan/Pencapaian Minimum)",
  "justifikasi": { "temaTugasan": "...", "idea": "...", "bahasa": "...", "pengolahan": "..." },
  "kekuatan": ["senarai 2-4 kekuatan"],
  "kelemahan": ["senarai 2-4 kelemahan"],
  "fokusUtama": [
    { "tajuk": "...", "penerangan": "..." },
    { "tajuk": "...", "penerangan": "..." },
    { "tajuk": "...", "penerangan": "..." }
  ],
  "rumusan": "rumusan keseluruhan 2-3 ayat",
  "perenggan": [
    {
      "nombor": 1,
      "jenisPerenggan": "Pendahuluan",
      "tahap": "kukuh atau sederhana atau perlu_tambah_baik",
      "teksAsal": "salin TEPAT teks perenggan itu daripada karangan pelajar, tanpa ubah apa-apa",
      "komen": "komen PENDEK 1-2 ayat, nada mesra",
      "kesalahanBahasa": ["hanya kesalahan ejaan/penggunaan kata/tanda baca yang jelas"],
      "cadanganKosaKata": ["asal -> cadangan (sebab)"],
      "cadanganPeribahasa": ["..."],
      "cadanganAyat": { "asal": "...", "baharu": "...", "sebab": "..." }
    }
  ]
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: prompt,
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/process', async (req, res) => {
  const { bahagian, soalanPaths, karanganPaths } = req.body;
  if (!bahagian || !soalanPaths?.length || !karanganPaths?.length) {
    return res.status(400).json({ success: false, error: 'bahagian, soalanPaths, dan karanganPaths diperlukan' });
  }

  try {
    const soalanParts = [];
    for (let i = 0; i < soalanPaths.length; i++) {
      const { data: blob, error } = await supabase.storage.from('karangan-uploads').download(soalanPaths[i]);
      if (error) throw new Error(error.message);
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      soalanParts.push(buildContentPart(blob, base64, `soalan-${i + 1}`));
    }

    const karanganParts = [];
    for (let i = 0; i < karanganPaths.length; i++) {
      const { data: blob, error } = await supabase.storage.from('karangan-uploads').download(karanganPaths[i]);
      if (error) throw new Error(error.message);
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      karanganParts.push(buildContentPart(blob, base64, `karangan-${i + 1}`));
    }

    const rubrik = bahagian === 'A' ? RUBRIK_BAHAGIAN_A : RUBRIK_BAHAGIAN_B;
    const maxMarkah = bahagian === 'A' ? 30 : 70;
    const limit = bahagian === 'A' ? '150-200' : '350-500';

    const prompt = `Awak ialah pemeriksa SPM Bahasa Melayu yang berpengalaman dan mesra. Fail-fail ni (PDF atau imej) dihantar ikut TURUTAN — anggap SEMUA fail soalan sebagai SATU dokumen soalan berterusan, dan SEMUA fail karangan sebagai SATU karangan berterusan (mungkin beberapa muka surat karangan panjang).

BUAT SEMUA NI DALAM SATU RESPONS SAHAJA: sahkan fail, extract teks, kira perkataan, nilai ikut rubrik, dan beri feedback setiap perenggan.

RUBRIK RASMI:
${rubrik}

SOALAN: rujuk fail soalan yang dilamparkan.
KARANGAN: rujuk fail karangan yang dilamparkan.
Had patah perkataan rasmi Bahagian ${bahagian}: ${limit}.

PENTING - VALIDASI: "valid" = false jika fail bukan soalan/karangan BM yang sah (kosong, subjek lain, tak berkaitan). Jika valid=false, kosongkan semua field lain dan isi "reason" sahaja.

PENTING - CADANGAN: semua cadangan (kosa kata, peribahasa, ayat baharu) MESTI pendek dan sesuai gaya asal.

PENTING - KESALAHAN BAHASA: Dalam senarai "kesalahanBahasa" setiap perenggan, HANYA masukkan kesalahan yang JELAS dan OBJEKTIF — seperti kesalahan EJAAN, kesalahan PENGGUNAAN KATA (perkataan yang salah maksud/tidak tepat), atau kesalahan TANDA BACA. JANGAN masukkan ayat yang sekadar terasa "kurang gramatis" atau sekadar gaya penulisan berbeza daripada gaya formal — kesalahan mesti jelas dan boleh dibuktikan salah, bukan tanggapan subjektif.

PENTING - KONSISTENSI MARKAH: Sebelum beri markah akhir, semak semula ia berada dalam julat band yang betul ikut rubrik. Pastikan konsisten — essay dengan kualiti sama patut dapat markah yang sama.

PENTING - MISI JELAJAH IDEA: Hasilkan 2 hingga 4 objek dalam "misi" SAHAJA kalau memang ada kelemahan sebenar dalam karangan ni.
- Setiap misi MESTI daripada kelemahan sebenar dalam karangan ini, bukan cabaran rawak. JANGAN cipta misi bagi zon yang sudah kukuh.
- Zon: "huraian" (kedalaman huraian), "contoh" (contoh dan hujah), "kbat" (pemikiran kritis dan penilaian), "ayat" (kejelasan dan keterampilan ayat).
- "petikan" ialah 1-2 ayat yang diambil TEKAT daripada "teksAsal" perenggan yang sama (salinan tepat, tiada ubahan langsung).
- "sebab" ialah 1-2 ayat berdasarkan petikan tu — kenapa ia kelemahan nyata dalam konteks soalan ni.
- "soalanFikir" ialah SATU soalan ringkas yang buat pelajar berfikir dulu sebelum nampak cadangan AI.
- Maksimum SATU misi bagi setiap zon bagi setiap perenggan.
- JANGAN ubah markah atau mana-mana field lain kerana misi ni.

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown), semua text dalam Bahasa Melayu:
{
  "valid": true atau false,
  "reason": "sebab ringkas jika valid=false, kosongkan string jika valid=true",
  "soalanText": "teks soalan yang di-extract (gabungkan semua muka surat)",
  "karanganText": "teks karangan yang di-extract (gabungkan semua muka surat ikut turutan)",
  "wordCount": jumlah patah perkataan dalam karangan sahaja (integer),
  "jenisSoalan": "jenis soalan (Pendapat/Punca/Langkah/Cerita/Surat Rasmi, dll)",
  "strukturLengkap": true atau false (ada pendahuluan, isi, dan penutup yang jelas),
  "markah": nombor markah akhir (integer, 0 hingga ${maxMarkah}),
  "peringkat": "nama peringkat (Cemerlang/Kepujian/Baik/Memuaskan/Kurang Memuaskan/Pencapaian Minimum)",
  "justifikasi": { "temaTugasan": "...", "idea": "...", "bahasa": "...", "pengolahan": "..." },
  "kekuatan": ["senarai 2-4 kekuatan"],
  "kelemahan": ["senarai 2-4 kelemahan"],
  "fokusUtama": [
    { "tajuk": "...", "penerangan": "..." },
    { "tajuk": "...", "penerangan": "..." },
    { "tajuk": "...", "penerangan": "..." }
  ],
  "rumusan": "rumusan keseluruhan 2-3 ayat",
  "perenggan": [
    {
      "nombor": 1,
      "jenisPerenggan": "Pendahuluan",
      "tahap": "kukuh atau sederhana atau perlu_tambah_baik",
      "teksAsal": "salin TEPAT teks perenggan itu daripada karangan pelajar, tanpa ubah apa-apa",
      "komen": "komen PENDEK 1-2 ayat, nada mesra",
      "kesalahanBahasa": ["hanya kesalahan ejaan/penggunaan kata/tanda baca yang jelas"],
      "cadanganKosaKata": ["asal -> cadangan (sebab)"],
      "cadanganPeribahasa": ["..."],
      "cadanganAyat": { "asal": "...", "baharu": "...", "sebab": "..." }
    }
  ],
  "misi": [
    {
      "id": "m1",
      "zon": "huraian",
      "perenggan": nombor perenggan (integer),
      "petikan": "1-2 ayat TEKAT diambil daripada teksAsal perenggan yang sama",
      "sebab": "1-2 ayat: kenapa petikan ni kelemahan nyata",
      "soalanFikir": "satu soalan ringkas yang buat pelajar berfikir sebelum nampak cadangan AI"
    }
  ]
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      temperature: 0.3,
      input: [{
        role: 'user',
        content: [...soalanParts, ...karanganParts, { type: 'input_text', text: prompt }],
      }],
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanText);
    sahkanMisi(result);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== Jelajah Idea: eksperimen =====
app.post('/jelajah/eksperimen', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const { submissionId, misiId, strategi, percubaanPelajar } = req.body || {};
    if (!submissionId || !misiId) {
      return res.status(400).json({ success: false, error: 'Misi tidak lengkap. Sila muat semula result karangan dan cuba lagi.' });
    }
    if (!STRATEGI_SAHA.includes(strategi)) {
      return res.status(400).json({ success: false, error: 'Strategi tidak sah. Pilih sebab_akibat, contoh, kbat atau ayat.' });
    }

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('id, user_id, soalan_text, feedback_data')
      .eq('id', submissionId)
      .single();
    if (subError || !submission) {
      return res.status(404).json({ success: false, error: 'Karangan tidak dijumpai. Sila cuba lagi dari halaman result.' });
    }
    if (submission.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Anda tiada akses untuk karangan ini.' });
    }

    const feedback = submission.feedback_data || {};
    const misi = (Array.isArray(feedback.misi) ? feedback.misi : []).find((m) => m?.id === misiId);
    const perenggan = (Array.isArray(feedback.perenggan) ? feedback.perenggan : [])
      .find((p) => Number(p?.nombor) === Number(misi?.perenggan));
    const teksAsal = typeof perenggan?.teksAsal === 'string' ? perenggan.teksAsal : '';
    if (!misi || !teksAsal.trim()) {
      return res.status(404).json({ success: false, error: 'Karangan lama ni tiada misi Jelajah Idea. Sila buat analisis karangan baharu untuk mula menjelajah.' });
    }

    const percubaan = typeof percubaanPelajar === 'string' && percubaanPelajar.trim() ? percubaanPelajar.trim() : '';

    const prompt = `Awak ialah mentor penulisan Bahasa Melayu yang mesra dan berpengalaman. Pelajar nak cuba satu MISI JELAJAH IDEA untuk memperbaiki satu kelemahan sebenar dalam karangan dia. Teks asal KEKAL dan tidak diubah — kita cuma jana versi cadangan untuk dibandingkan.

TEKS ASAL PERENGGAN ${misi.perenggan}:
${teksAsal}

MISI (zon: ${misi.zon}):
- Petikan bermasalah: "${misi.petikan}"
- Sebab kelemahan: ${misi.sebab}
- Soalan fikir untuk pelajar: ${misi.soalanFikir}

STRATEGI DIPILIH: ${LABEL_STRATEGI[strategi] || strategi}
KONTEKS SOALAN KARANGAN: ${submission.soalan_text || '(tiada)'}
${percubaan ? `\nPERCUBAAN PELAJAR (ditulis SEBELUM nampak cadangan AI):\n${percubaan}\n` : ''}
Arahan:
1. Hasilkan versi baharu perenggan ni yang memperbaiki kelemahan misi mengikut strategi dipilih. Kekalkan maksud dan hujah asal pelajar.
2. Tandakan setiap bahagian BARU atau BERUBAH dengan tanda [[...]]. Bahagian yang dikekalkan tulis biasa tanpa tanda.
3. JANGAN reka fakta, statistik, nama, tarikh atau petikan tokoh. Kalau contoh diperlukan, guna contoh umum dan tulis label "contoh ilustrasi, semak kebenaran" pada ayat contoh tu.
4. JANGAN panjangkan ayat semata-mata — utamakan kualiti huraian, relevansi, logik dan kejelasan.
5. JANGAN dakwa markah SPM akan meningkat. Ini cadangan belajar, bukan penilaian rasmi.
6. "perubahan" mesti senaraikan ayat atau bahagian yang memang dirujuk kepada teks sebenar (bukan huraian umum).
7. Kalau pelajar hantar percubaan: "ulasanPercubaan" = apa yang sudah baik + SATU perkara yang boleh ditambah, dengan nada menggalakkan. Kalau tiada percubaan, kosongkan "ulasanPercubaan".
8. "percubaanBermakna": true HANYA jika percubaan pelajar benar-benar menyentuh kemahiran sasaran misi ni dan bukan salinan teks asal semata-mata. Kalau tiada percubaan, false.

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown), semua teks dalam Bahasa Melayu:
{
  "versiAI": "versi baharu perenggan, bahagian baru/berubah dibungkus dengan [[...]]",
  "perubahan": ["ayat atau bahagian yang memang dirujuk kepada teks sebenar"],
  "sebabPenambahbaikan": "kenapa versi cadangan ni lebih kukuh untuk misi ni",
  "kemahiran": ["2-4 kemahiran penulisan yang dipelajari daripada misi ni"],
  "kelebihan": "kekuatan utama versi cadangan ni",
  "kemungkinanKekurangan": "kelemahan atau risiko kecil versi cadangan ni supaya pelajar berfikir secara kritis",
  "ulasanPercubaan": "ulasan percubaan pelajar (kosongkan jika tiada percubaan)",
  "percubaanBermakna": true atau false
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      temperature: 0.4,
      input: prompt,
    });

    const cleanText = response.output_text.replace(/```json|```/g, '').trim();
    const hasil = JSON.parse(cleanText);

    const ulasan = percubaan && typeof hasil.ulasanPercubaan === 'string' ? hasil.ulasanPercubaan.trim() : '';
    const output = {
      versiAI: typeof hasil.versiAI === 'string' ? hasil.versiAI : '',
      perubahan: Array.isArray(hasil.perubahan) ? hasil.perubahan : [],
      sebabPenambahbaikan: typeof hasil.sebabPenambahbaikan === 'string' ? hasil.sebabPenambahbaikan : '',
      kemahiran: Array.isArray(hasil.kemahiran) ? hasil.kemahiran : [],
      kelebihan: typeof hasil.kelebihan === 'string' ? hasil.kelebihan : '',
      kemungkinanKekurangan: typeof hasil.kemungkinanKekurangan === 'string' ? hasil.kemungkinanKekurangan : '',
      percubaanBermakna: percubaan ? hasil.percubaanBermakna === true : false,
    };
    if (ulasan) output.ulasanPercubaan = ulasan;

    res.json({ success: true, ...output });
  } catch (error) {
    console.error('Jelajah eksperimen:', error);
    res.status(500).json({ success: false, error: 'Jelajah Idea sedang berehat sekejap. Sila cuba lagi nanti ya.' });
  }
});

// ===== Jelajah Idea: putuskan =====
app.post('/jelajah/putuskan', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const {
      submissionId, misiId, strategi, percubaanPelajar, versiAI,
      keputusan, teksPilihan, percubaanBermakna, refleksi,
    } = req.body || {};

    if (!submissionId || !misiId) {
      return res.status(400).json({ success: false, error: 'Misi tidak lengkap. Sila muat semula result karangan dan cuba lagi.' });
    }
    if (!STRATEGI_SAHA.includes(strategi)) {
      return res.status(400).json({ success: false, error: 'Strategi tidak sah. Pilih sebab_akibat, contoh, kbat atau ayat.' });
    }
    if (!KEPUTUSAN_SAHA.includes(keputusan)) {
      return res.status(400).json({ success: false, error: 'Keputusan tidak sah. Pilih terima, tolak, edit atau guna_sendiri.' });
    }

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('id, user_id, feedback_data')
      .eq('id', submissionId)
      .single();
    if (subError || !submission) {
      return res.status(404).json({ success: false, error: 'Karangan tidak dijumpai. Sila cuba lagi dari halaman result.' });
    }
    if (submission.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Anda tiada akses untuk karangan ini.' });
    }

    const feedback = submission.feedback_data || {};
    const misi = (Array.isArray(feedback.misi) ? feedback.misi : []).find((m) => m?.id === misiId);
    if (!misi || !ZON_SAHA.includes(misi.zon)) {
      return res.status(404).json({ success: false, error: 'Misi ni tidak dijumpai dalam karangan ini. Sila muat semula halaman result.' });
    }

    const adaPercubaan = typeof percubaanPelajar === 'string' && percubaanPelajar.trim() !== '';
    const bermakna = adaPercubaan && percubaanBermakna === true;

    // XP dikira di server — jangan percaya nilai XP daripada klien.
    let xp = !adaPercubaan ? 0 : (bermakna ? 10 : 4);

    // XP hanya untuk gabungan (user, submission, misi) yang pertama; percubaan ulang dapat xp 0.
    const { data: sediaAda } = await supabase
      .from('jelajah_attempts')
      .select('id')
      .eq('user_id', userId)
      .eq('submission_id', submissionId)
      .eq('misi_id', misiId)
      .limit(1);
    if (Array.isArray(sediaAda) && sediaAda.length > 0) xp = 0;

    const row = {
      user_id: userId,
      submission_id: submissionId,
      misi_id: misiId,
      zon: misi.zon,
      strategi,
      petikan_asal: typeof misi.petikan === 'string' ? misi.petikan : '',
      percubaan_pelajar: adaPercubaan ? percubaanPelajar.trim() : null,
      versi_ai: typeof versiAI === 'string' ? versiAI : null,
      teks_pilihan: typeof teksPilihan === 'string' ? teksPilihan : null,
      keputusan,
      percubaan_bermakna: bermakna,
      xp,
    };
    if (typeof refleksi === 'string' && refleksi.trim()) row.refleksi = refleksi.trim();

    let hasil = await simpanCubaan(row);
    if (hasil.error && isRalatUnik(hasil.error)) {
      // percubaan ulang — simpan semula dengan xp 0
      row.xp = 0;
      hasil = await simpanCubaan(row);
    }
    if (hasil.error) {
      if (isRalatUnik(hasil.error)) {
        return res.status(409).json({ success: false, error: 'Misi ni sudah pun direkod sebelum ini. Percubaan lama anda kekal tersimpan.' });
      }
      console.error('Jelajah putuskan:', hasil.error);
      return res.status(500).json({ success: false, error: 'Gagal menyimpan percubaan anda. Sila cuba lagi.' });
    }

    res.json({ success: true, xp: row.xp, cubaan: hasil.data });
  } catch (error) {
    console.error('Jelajah putuskan:', error);
    res.status(500).json({ success: false, error: 'Gagal menyimpan percubaan anda. Sila cuba lagi.' });
  }
});

// ===== Jelajah Idea: ringkasan XP, zon dan lencana =====
app.get('/jelajah/ringkasan', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const { data, error } = await supabase
      .from('jelajah_attempts')
      .select('misi_id, zon, percubaan_bermakna, xp')
      .eq('user_id', userId);
    if (error) throw error;

    const xp = (data || []).reduce((j, a) => j + (Number(a.xp) || 0), 0);

    const zon = {};
    ZON_SAHA.forEach((z) => { zon[z] = { selesai: 0, sasaran: 3 }; });
    const misiBermakna = new Set();
    for (const a of data || []) {
      if (a.percubaan_bermakna === true && ZON_SAHA.includes(a.zon)) {
        const kunci = `${a.zon}:${a.misi_id}`;
        if (misiBermakna.has(kunci)) continue;
        misiBermakna.add(kunci);
        zon[a.zon].selesai += 1;
      }
    }

    let tahap = 1;
    AMBANG_XP.forEach((ambang, i) => { if (xp >= ambang) tahap = i + 1; });
    const xpTahapSeterusnya = tahap < AMBANG_XP.length ? AMBANG_XP[tahap] : null;

    const lencana = LENCANA.map((l) => ({ ...l, terbuka: zon[l.zon].selesai >= 3 }));

    res.json({ success: true, xp, tahap, xpTahapSeterusnya, zon, lencana });
  } catch (error) {
    console.error('Jelajah ringkasan:', error);
    res.status(500).json({ success: false, error: 'Gagal mendapatkan ringkasan Jelajah Idea. Sila cuba lagi.' });
  }
});

// ===== Jelajah Idea: sejarah cubaan bagi satu karangan =====
app.get('/jelajah/sejarah/:submissionId', async (req, res) => {
  try {
    const userId = await requireUser(req, res);
    if (!userId) return;

    const { submissionId } = req.params;
    if (!submissionId) {
      return res.status(400).json({ success: false, error: 'Id karangan diperlukan.' });
    }

    const { data, error } = await supabase
      .from('jelajah_attempts')
      .select('zon, strategi, petikan_asal, teks_pilihan, keputusan, created_at')
      .eq('user_id', userId)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ success: true, sejarah: data || [] });
  } catch (error) {
    console.error('Jelajah sejarah:', error);
    res.status(500).json({ success: false, error: 'Gagal mendapatkan sejarah jelajah anda. Sila cuba lagi.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});