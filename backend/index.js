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
  { name: 'soalan', maxCount: 1 },
  { name: 'karangan', maxCount: 1 },
]), async (req, res) => {
  try {
    const { bahagian } = req.body;
    const soalanFile = req.files?.soalan?.[0];
    const karanganFile = req.files?.karangan?.[0];

    if (!bahagian || !soalanFile || !karanganFile) {
      return res.status(400).json({ success: false, error: 'Bahagian, soalan, dan karangan semua wajib diisi' });
    }
    if (!ALLOWED_TYPES.includes(soalanFile.mimetype) || !ALLOWED_TYPES.includes(karanganFile.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Format tak disokong. Guna PDF, JPEG, PNG, WEBP, atau GIF (HEIC dari iPhone tak disokong).',
      });
    }

    const timestamp = Date.now();
    const soalanPath = `${bahagian}_soalan_${timestamp}.${getExtension(soalanFile.mimetype)}`;
    const karanganPath = `${bahagian}_karangan_${timestamp}.${getExtension(karanganFile.mimetype)}`;

    const { error: soalanError } = await supabase.storage
      .from('karangan-uploads')
      .upload(soalanPath, soalanFile.buffer, { contentType: soalanFile.mimetype });
    if (soalanError) return res.status(500).json({ success: false, error: `Soalan upload: ${soalanError.message}` });

    const { error: karanganError } = await supabase.storage
      .from('karangan-uploads')
      .upload(karanganPath, karanganFile.buffer, { contentType: karanganFile.mimetype });
    if (karanganError) return res.status(500).json({ success: false, error: `Karangan upload: ${karanganError.message}` });

    res.json({ success: true, message: 'Upload berjaya!', bahagian, soalanPath, karanganPath });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/analyze', async (req, res) => {
  const { soalanPath, karanganPath } = req.body;
  if (!soalanPath || !karanganPath) {
    return res.status(400).json({ success: false, error: 'soalanPath dan karanganPath diperlukan' });
  }

  try {
    const { data: soalanBlob, error: soalanDlError } = await supabase.storage
      .from('karangan-uploads').download(soalanPath);
    if (soalanDlError) throw new Error(soalanDlError.message);

    const { data: karanganBlob, error: karanganDlError } = await supabase.storage
      .from('karangan-uploads').download(karanganPath);
    if (karanganDlError) throw new Error(karanganDlError.message);

    const soalanBase64 = Buffer.from(await soalanBlob.arrayBuffer()).toString('base64');
    const karanganBase64 = Buffer.from(await karanganBlob.arrayBuffer()).toString('base64');

    const soalanPart = buildContentPart(soalanBlob, soalanBase64, 'soalan');
    const karanganPart = buildContentPart(karanganBlob, karanganBase64, 'karangan');

    const prompt = `Awak ialah AI Examiner untuk karangan Bahasa Melayu SPM. Baca dua fail ni (boleh PDF atau imej) — fail pertama ialah SOALAN, fail kedua ialah KARANGAN pelajar.

Jawab HANYA dalam format JSON (tiada teks lain, tiada markdown), ikut struktur ni:
{
  "valid": true atau false (false jika fail bukan soalan/karangan BM yang sah, contoh: kosong, subjek lain, tak berkaitan),
  "reason": "sebab ringkas jika valid=false, kosongkan string jika valid=true",
  "soalanText": "teks soalan yang di-extract",
  "karanganText": "teks karangan yang di-extract",
  "wordCount": jumlah patah perkataan dalam karangan sahaja (integer)
}`;

    const response = await openaiClient.responses.create({
      model: 'gpt-5.6',
      input: [{
        role: 'user',
        content: [soalanPart, karanganPart, { type: 'input_text', text: prompt }],
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});