'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import type { Caretaker, Student } from '@/types/database';

type Props = { onClose: () => void; onCreated: () => void };

export default function CaseFormModal({ onClose, onCreated }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [caretakerChoices, setCaretakerChoices] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [caseType, setCaseType] = useState<'low_confidence' | 'feel_not_smart' | 'other'>('low_confidence');
  const [otherText, setOtherText] = useState('');
  const [details, setDetails] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => {
    const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return date.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentUser = useSessionCaretaker();
  const selectedCaretakers = currentUser
    ? [...new Set([currentUser.id, ...caretakerChoices])]
    : caretakerChoices;

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      const [studentResult, caretakerResult] = await Promise.all([
        supabase.from('students').select('*').order('first_name_th'),
        supabase.from('caretakers').select('*').order('name'),
      ]);
      if (!active) return;
      const loadError = studentResult.error ?? caretakerResult.error;
      if (loadError) setError(`โหลดรายชื่อนักเรียนหรือผู้ดูแลไม่สำเร็จ: ${loadError.message}`);
      else {
        setStudents((studentResult.data ?? []) as Student[]);
        setCaretakers((caretakerResult.data ?? []) as Caretaker[]);
      }
      setLoading(false);
    }
    void loadOptions();
    return () => { active = false; };
  }, []);

  const grades = useMemo(
    () => [...new Set(students.map((student) => student.grade).filter((grade): grade is string => Boolean(grade)))].sort(),
    [students],
  );
  const rooms = useMemo(
    () => [...new Set(students.filter((student) => !gradeFilter || student.grade === gradeFilter).map((student) => student.room).filter((room): room is number => room !== null))].sort((a, b) => a - b),
    [students, gradeFilter],
  );
  const filteredStudents = students.filter((student) => {
    const haystack = [student.student_id, student.first_name_th, student.last_name_th, student.nickname_th]
      .filter(Boolean).join(' ').toLocaleLowerCase('th');
    return haystack.includes(search.toLocaleLowerCase('th')) &&
      (!gradeFilter || student.grade === gradeFilter) &&
      (!roomFilter || String(student.room) === roomFilter);
  });

  function toggleStudent(student: Student) {
    setSelectedStudents((current) => current.some((item) => item.id === student.id)
      ? current.filter((item) => item.id !== student.id)
      : [...current, student]);
  }

  function toggleCaretaker(id: string) {
    setCaretakerChoices((current) => current.includes(id)
      ? (id === currentUser?.id ? current : current.filter((item) => item !== id))
      : [...current, id]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!currentUser) {
      setError('ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    if (!selectedStudents.length) {
      setError('กรุณาเลือกนักเรียนอย่างน้อย 1 คน');
      return;
    }
    if (!selectedCaretakers.includes(currentUser.id)) {
      setError('ต้องมีผู้สร้างเคสเป็นผู้ดูแลในเคสด้วย');
      return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.rpc('create_case_with_relations', {
      p_case_type: caseType,
      p_other_text: caseType === 'other' ? otherText.trim() : null,
      p_details: details.trim() || null,
      p_scheduled_at: new Date(scheduledAt).toISOString(),
      p_created_by: currentUser.id,
      p_student_ids: selectedStudents.map((student) => student.id),
      p_caretaker_ids: selectedCaretakers,
    });
    setSaving(false);
    if (saveError) {
      setError(`บันทึกเคสไม่สำเร็จ: ${saveError.message}`);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="new-case-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-primary">บันทึกการดูแล</p>
            <h2 id="new-case-title" className="text-xl font-bold text-gray-800">สร้างเคสใหม่</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        {loading ? <p className="py-10 text-center text-gray-500">กำลังโหลดข้อมูล...</p> : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold">นักเรียนที่เกี่ยวข้อง <span className="text-red-500">*</span></label>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_110px]">
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3">
                  <Search size={17} className="text-gray-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ / รหัส / ชื่อเล่น" className="w-full py-2.5 text-sm outline-none" />
                </div>
                <select value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setRoomFilter(''); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">ทุกระดับชั้น</option>
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
                <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">ทุกห้อง</option>
                  {rooms.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              </div>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-100">
                {filteredStudents.length ? filteredStudents.map((student) => {
                  const checked = selectedStudents.some((item) => item.id === student.id);
                  return <label key={student.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0 hover:bg-[#faf8fb]">
                    <input type="checkbox" checked={checked} onChange={() => toggleStudent(student)} className="accent-primary" />
                    <span className="flex-1 text-sm">{studentName(student)}{student.nickname_th ? ` (${student.nickname_th})` : ''}</span>
                    <span className="text-xs text-gray-400">{student.grade ?? '-'} / {student.room ?? '-'}</span>
                  </label>;
                }) : <p className="p-4 text-center text-sm text-gray-400">ไม่พบนักเรียน</p>}
              </div>
              {selectedStudents.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selectedStudents.map((student) => <span key={student.id} className="flex items-center gap-1 rounded-full bg-primary-light px-3 py-1 text-xs text-primary">{studentName(student)}<button type="button" onClick={() => toggleStudent(student)} aria-label={`นำ ${studentName(student)} ออก`}><X size={13} /></button></span>)}</div>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="case-type" className="mb-2 block text-sm font-semibold">ประเภทเคส</label>
                <select id="case-type" value={caseType} onChange={(event) => setCaseType(event.target.value as typeof caseType)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5">
                  <option value="low_confidence">ขาดความมั่นใจ</option>
                  <option value="feel_not_smart">รู้สึกว่าตนเองไม่เก่ง</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </div>
              <div>
                <label htmlFor="scheduled-at" className="mb-2 block text-sm font-semibold">วันและเวลานัดหมาย</label>
                <input id="scheduled-at" type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5" />
              </div>
            </div>
            {caseType === 'other' && <div><label htmlFor="other-text" className="mb-2 block text-sm font-semibold">ระบุประเภทเคส</label><input id="other-text" required value={otherText} onChange={(event) => setOtherText(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5" /></div>}
            <div>
              <label htmlFor="details" className="mb-2 block text-sm font-semibold">รายละเอียด</label>
              <textarea id="details" rows={3} value={details} onChange={(event) => setDetails(event.target.value)} className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5" placeholder="บันทึกรายละเอียดเบื้องต้น..." />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">ผู้ดูแลที่เกี่ยวข้อง</p>
              <div className="grid max-h-36 gap-2 overflow-y-auto rounded-xl border border-gray-100 p-3 sm:grid-cols-2">
                {caretakers.map((caretaker) => <label key={caretaker.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedCaretakers.includes(caretaker.id)} disabled={caretaker.id === currentUser?.id} onChange={() => toggleCaretaker(caretaker.id)} className="accent-primary" />
                  {caretaker.name}{caretaker.id === currentUser?.id ? ' (ผู้สร้างเคส)' : ''}
                </label>)}
              </div>
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button type="submit" disabled={saving || !currentUser} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{saving ? 'กำลังบันทึก...' : 'บันทึกเคส'}</button>
            </div>
          </form>
        )}
        {loading && error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
