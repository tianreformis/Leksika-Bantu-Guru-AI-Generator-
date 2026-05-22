"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, AlertTriangle, Clock, CheckCircle, XCircle, Eye, Loader2, Calculator, FileSpreadsheet, Brain } from "lucide-react";
import * as XLSX from "xlsx";

interface Choice {
  label: string;
  teks: string;
}

interface StudentAnswer {
  questionId: string;
  jenis: string;
  pertanyaan: string;
  point: number;
  kunciJawaban: Record<string, unknown> | null;
  choices: Choice[];
  jawaban: string;
  score: number | null;
  isCorrect: boolean;
}

interface Student {
  id: string;
  nama: string;
  username: string;
  startedAt: string;
  submittedAt: string | null;
  tabSwitchCount: number;
  score: number | null;
  scoreReleased: boolean;
  answeredCount: number;
  totalQuestions: number;
  answers: StudentAnswer[];
}

interface ExamInfo {
  id: string;
  judul: string;
  mataPelajaran: string;
  kodeUjian: string;
}

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [releasingAll, setReleasingAll] = useState(false);
  const [saveTimers, setSaveTimers] = useState<Record<string, NodeJS.Timeout>>({});
  const savingRef = useRef<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ nama: string; username: string; kemampuanTinggi: string[]; kemampuanKurang: string[]; rekomendasi: string }[] | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    fetchData(token);
  }, [id, router]);

  const fetchData = async (token: string) => {
    try {
      const [examRes, monitoringRes] = await Promise.all([
        fetch(`/api/exam/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/exam/${id}/monitoring`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const examData = await examRes.json();
      if (examData.success) setExam(examData.data);
      const monitoringData = await monitoringRes.json();
      if (monitoringData.success) setStudents(monitoringData.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  const saveStudentScore = async (studentId: string, score: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      await fetch(`/api/exam/${id}/monitoring/${studentId}/score`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
    } catch { console.error("Failed to save score"); }
  };

  const debouncedSave = (key: string, fn: () => void, ms = 800) => {
    if (saveTimers[key]) clearTimeout(saveTimers[key]);
    const timer = setTimeout(fn, ms);
    setSaveTimers((prev) => ({ ...prev, [key]: timer }));
  };

  const handleScoreChange = (studentId: string, newScore: string) => {
    const val = parseInt(newScore);
    if (isNaN(val) || val < 0) return;
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, score: val } : s)));
    if (selectedStudent?.id === studentId) {
      setSelectedStudent((prev) => prev ? { ...prev, score: val } : null);
    }
    debouncedSave(`score_${studentId}`, () => saveStudentScore(studentId, val));
  };

  const saveAnswerScore = async (studentId: string, questionId: string, score: number) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`/api/exam/${id}/monitoring/${studentId}/answer`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, score }),
      });
      const data = await res.json();
      if (data.success) {
        setStudents((prev) =>
          prev.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  score: data.totalScore,
                  answers: s.answers.map((a) =>
                    a.questionId === questionId ? { ...a, score } : a
                  ),
                }
              : s
          )
        );
        if (selectedStudent?.id === studentId) {
          setSelectedStudent((prev) =>
            prev
              ? {
                  ...prev,
                  score: data.totalScore,
                  answers: prev.answers.map((a) =>
                    a.questionId === questionId ? { ...a, score } : a
                  ),
                }
              : null
          );
        }
      }
    } catch { console.error("Failed to save answer score"); }
  };

  const handleAnswerScoreChange = (questionId: string, newScore: string) => {
    if (!selectedStudent) return;
    const val = parseInt(newScore);
    if (isNaN(val) || val < 0) return;
    setSelectedStudent((prev) =>
      prev
        ? {
            ...prev,
            answers: prev.answers.map((a) =>
              a.questionId === questionId ? { ...a, score: val } : a
            ),
          }
        : null
    );
  };

  const handleAnswerScoreBlur = (questionId: string, rawValue: string) => {
    if (!selectedStudent) return;
    const val = parseInt(rawValue);
    if (isNaN(val) || val < 0) return;
    setSelectedStudent((prev) =>
      prev ? { ...prev, answers: prev.answers.map((a) => a.questionId === questionId ? { ...a, score: val } : a) } : null
    );
    saveAnswerScore(selectedStudent.id, questionId, val);
  };

  const handleCalculateScores = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setCalculating(true);
    try {
      const res = await fetch(`/api/exam/${id}/calculate-scores`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setStudents((prev) =>
          prev.map((s) => {
            const calc = data.data.find((r: { studentId: string }) => r.studentId === s.id);
            return calc ? { ...s, score: calc.score } : s;
          })
        );
        if (selectedStudent) {
          const calc = data.data.find((r: { studentId: string }) => r.studentId === selectedStudent.id);
          if (calc) setSelectedStudent({ ...selectedStudent, score: calc.score });
        }
      }
    } catch { console.error("Failed to calculate"); }
    finally { setCalculating(false); }
  };

  const handleReleaseAll = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setReleasingAll(true);
    try {
      const res = await fetch(`/api/exam/${id}/monitoring/release-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setStudents((prev) => prev.map((s) => s.submittedAt ? { ...s, scoreReleased: true } : s));
        if (selectedStudent?.submittedAt) setSelectedStudent({ ...selectedStudent, scoreReleased: true });
      }
    } catch { console.error("Failed to release all"); }
    finally { setReleasingAll(false); }
  };

  const handleAnalyze = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    try {
      const res = await fetch(`/api/exam/${id}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setAnalysisResult(data.data);
      else alert(data.error || "Gagal menganalisis");
    } catch { alert("Gagal menganalisis"); }
    finally { setAnalyzing(false); }
  };

  const exportAnalysisToExcel = () => {
    if (!analysisResult || analysisResult.length === 0) return;
    const wsData = analysisResult.map((r, i) => ({
      No: i + 1,
      Nama: r.nama,
      "Kemampuan Tinggi": (r.kemampuanTinggi || []).join(", "),
      "Kemampuan Kurang": (r.kemampuanKurang || []).join(", "),
      Rekomendasi: r.rekomendasi,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws["!cols"] = [{ wch: 4 }, { wch: 25 }, { wch: 40 }, { wch: 40 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Analisa");
    XLSX.writeFile(wb, `Analisa_${exam?.judul || "Ujian"}.xlsx`);
  };

  const handleReleaseScore = async (studentId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const student = students.find((s) => s.id === studentId);
    if (!student || student.score === null || student.score < 0) return;

    setReleasingId(studentId);
    try {
      const res = await fetch(`/api/exam/${id}/monitoring/${studentId}/release`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ score: student.score }),
      });
      if (res.ok) {
        setStudents((prev) => prev.map((s) => s.id === studentId ? { ...s, scoreReleased: true } : s));
        if (selectedStudent?.id === studentId) setSelectedStudent({ ...selectedStudent, scoreReleased: true });
      }
    } catch { console.error("Failed to release"); }
    finally { setReleasingId(null); }
  };

  const openStudentDetail = (student: Student) => {
    setSelectedStudent(student);
  };

  const exportToExcel = () => {
    const released = students.filter((s) => s.scoreReleased && s.submittedAt);
    if (released.length === 0) { alert("Belum ada nilai yang dirilis"); return; }
    const wsData = released.map((s, i) => ({
      No: i + 1, Nama: s.nama, Username: s.username,
      Terjawab: `${s.answeredCount}/${s.totalQuestions}`,
      "Ganti Tab": s.tabSwitchCount, Status: "Terkumpul",
      Nilai: s.score ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws["!cols"] = [{ wch: 4 }, { wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nilai");
    XLSX.writeFile(wb, `Nilai_${exam?.judul || "Ujian"}.xlsx`);
  };

  if (isLoading) return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Memuat...</div>;
  if (!exam) return <div className="text-center py-12 text-gray-500 dark:text-gray-400">Ujian tidak ditemukan</div>;

  const totalStudents = students.length;
  const submittedStudents = students.filter((s) => s.submittedAt).length;
  const avgTabSwitch = totalStudents > 0 ? (students.reduce((s, v) => s + v.tabSwitchCount, 0) / totalStudents).toFixed(1) : "0";
  const releasedCount = students.filter((s) => s.scoreReleased).length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link href={`/dashboard/exam/${id}`} className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4 text-sm">
        <ArrowLeft size={16} /> Kembali ke Detail Ujian
      </Link>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monitoring: {exam.judul}</h1>
            <p className="text-gray-500 dark:text-gray-400">{exam.kodeUjian}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCalculateScores} disabled={calculating}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
              Hitung Nilai
            </button>
            <button onClick={handleReleaseAll} disabled={releasingAll}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {releasingAll ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
              Release All
            </button>
            <button onClick={handleAnalyze} disabled={analyzing}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
              Analisa AI
            </button>
            <button onClick={exportToExcel}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              <FileSpreadsheet size={16} /> Export Excel
            </button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4 mt-4">
          <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalStudents}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Peserta</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{submittedStudents}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Terkumpul</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{avgTabSwitch}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Rata Ganti Tab</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalStudents - submittedStudents}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Belum Kumpul</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{releasedCount}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Nilai Dirilis</p>
          </div>
        </div>
      </div>

      {analysisResult && analysisResult.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Brain size={20} className="text-violet-500" /> Analisis Kemampuan Siswa
            </h2>
            <button onClick={exportAnalysisToExcel}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              <FileSpreadsheet size={14} /> Export Analisa
            </button>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-2 pr-4">No</th>
                  <th className="pb-2 pr-4">Nama</th>
                  <th className="pb-2 pr-4">Kemampuan Tinggi</th>
                  <th className="pb-2 pr-4">Kemampuan Kurang</th>
                  <th className="pb-2">Rekomendasi</th>
                </tr>
              </thead>
              <tbody>
                {analysisResult.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                    <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">{r.nama}</td>
                    <td className="py-2 pr-4">
                      {r.kemampuanTinggi.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.kemampuanTinggi.map((t, j) => (
                            <span key={j} className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-400 italic">-</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {r.kemampuanKurang.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.kemampuanKurang.map((t, j) => (
                            <span key={j} className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-400 italic">-</span>}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400 text-xs max-w-xs">{r.rekomendasi}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Users className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-500 dark:text-gray-400">Belum ada peserta</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Daftar Peserta</h2>
            <div className="space-y-2">
              {students.map((s) => (
                <button key={s.id} onClick={() => openStudentDetail(s)}
                  className={`w-full text-left bg-white dark:bg-gray-800 rounded-xl border p-4 transition-shadow hover:shadow-md ${selectedStudent?.id === s.id ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800" : "border-gray-200 dark:border-gray-700"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{s.nama}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">@{s.username}</p>
                    </div>
                    <div>
                      {s.submittedAt ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                          <CheckCircle size={12} /> Terkumpul
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                          <Clock size={12} /> Belum
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{s.answeredCount}/{s.totalQuestions} terjawab</span>
                    <span className={`flex items-center gap-1 ${s.tabSwitchCount > 0 ? "text-red-500 font-medium" : ""}`}>
                      <AlertTriangle size={12} /> {s.tabSwitchCount}x ganti tab
                    </span>
                    <input type="number" value={s.score ?? ""}
                      onChange={(e) => handleScoreChange(s.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Nilai"
                      className="w-16 px-1 py-0.5 text-center border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs" />
                    {s.scoreReleased && <span className="text-green-600 dark:text-green-400 font-medium">{s.score ?? "-"}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            {selectedStudent ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sticky top-24">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{selectedStudent.nama}</h3>
                  <button onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <XCircle size={18} />
                  </button>
                </div>

                <div className="flex gap-4 mb-4 text-sm">
                  <div><p className="text-gray-500 dark:text-gray-400 text-xs">Terjawab</p><p className="text-gray-900 dark:text-white">{selectedStudent.answeredCount}/{selectedStudent.totalQuestions}</p></div>
                  <div><p className="text-gray-500 dark:text-gray-400 text-xs">Ganti Tab</p><p className={`text-gray-900 dark:text-white ${selectedStudent.tabSwitchCount > 0 ? "text-red-500 font-medium" : ""}`}>{selectedStudent.tabSwitchCount}x</p></div>
                  <div><p className="text-gray-500 dark:text-gray-400 text-xs">Status</p><p className="text-gray-900 dark:text-white">{selectedStudent.submittedAt ? "Terkumpul" : "Belum"}</p></div>
                  <div><p className="text-gray-500 dark:text-gray-400 text-xs">Total</p><p className="text-gray-900 dark:text-white font-bold">{selectedStudent.score ?? "-"}</p></div>
                </div>

                <div className="max-h-[400px] overflow-y-auto space-y-3 mb-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Nilai Per Soal</h4>
                  {selectedStudent.answers.length === 0 ? (
                    <p className="text-sm text-gray-400">Belum ada jawaban</p>
                  ) : (
                    selectedStudent.answers.map((a, i) => {
                      const kunci = a.kunciJawaban as { pilihan?: string | string[]; text?: string } | null;
                      return (
                        <div key={a.questionId} className={`rounded-lg p-3 border ${a.isCorrect ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-700/50 border-transparent"}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
                              {i + 1}. {a.pertanyaan}
                              <span className="text-gray-400 font-normal"> ({a.point}pt)</span>
                            </p>
                            <input type="number" value={a.score ?? ""}
                              onChange={(e) => handleAnswerScoreChange(a.questionId, e.target.value)}
                              onBlur={(e) => handleAnswerScoreBlur(a.questionId, e.target.value)}
                              placeholder="0"
                              className="w-14 px-1 py-0.5 text-center border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs shrink-0" />
                          </div>

                          {a.choices?.length > 0 && (
                            <div className="space-y-0.5 mb-1">
                              {a.choices.map((c) => {
                                const isKunci = kunci?.pilihan ? (Array.isArray(kunci.pilihan) ? kunci.pilihan.includes(c.label) : kunci.pilihan === c.label) : false;
                                const isSelected = (a.jenis === "pilihan_ganda" || a.jenis === "true_false") ? a.jawaban === c.label : (JSON.parse(a.jawaban || "[]") as string[]).includes(c.label);
                                return (
                                  <div key={c.label} className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${isKunci ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : isSelected ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" : "text-gray-500"}`}>
                                    {isSelected && (isKunci ? <CheckCircle size={10} /> : <XCircle size={10} />)}
                                    {!isSelected && isKunci && <CheckCircle size={10} />}
                                    {a.jenis !== "true_false" && <span className="font-mono">{c.label.toUpperCase()}.</span>}
                                    <span className="truncate">{c.teks}</span>
                                    {isKunci && <span className="text-[10px] opacity-70 ml-auto">(kunci)</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {a.jenis === "essay" && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap mt-1">{a.jawaban || <span className="italic text-gray-400">Tidak dijawab</span>}</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  {selectedStudent.scoreReleased ? (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle size={16} />
                      <span className="text-sm font-medium">Nilai sudah dirilis: {selectedStudent.score}</span>
                    </div>
                  ) : (
                    <button onClick={() => handleReleaseScore(selectedStudent.id)}
                      disabled={releasingId === selectedStudent.id || selectedStudent.score === null}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {releasingId === selectedStudent.id ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                      Release Nilai ({selectedStudent.score ?? "-"})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
                <Users className="mx-auto text-gray-400 mb-4" size={40} />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Klik peserta untuk detail</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
