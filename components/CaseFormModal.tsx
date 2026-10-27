'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/language';
import { requestApi } from '@/lib/api';
import { studentName } from '@/lib/cases';
import { useSessionCaretaker } from '@/lib/session';
import type { Caretaker, Student } from '@/types/database';

type Props = { onClose: () => void; onCreated: () => void };

export default function CaseFormModal({ onClose, onCreated }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [caretakers, setCaretakers] = useState<Caretaker[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [caretakerChoices, setCaretakerChoices] = useState<string[]>([]);
  const [academicYears, setAcademicYears] = useState<string[]>([]);
  const [academicYear, setAcademicYear] = useState('2569');
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
  const { confirm, dialog } = useConfirmDialog();
  const { t } = useLanguage();
  const isAdmin = currentUser?.role === 'admin';
  const selectedCaretakers = currentUser
    ? (isAdmin ? caretakerChoices : [...new Set([currentUser.id, ...caretakerChoices])])
    : caretakerChoices;
  const assignableCaretakers = caretakers.filter((caretaker) => caretaker.role === 'caretaker');

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      try {
        const [yearData, caretakerData] = await Promise.all([
          requestApi<string[]>('listAcademicYears'),
          requestApi<Caretaker[]>('listCaretakers'),
        ]);
        if (!active) return;
        const selectedYear = yearData[0] ?? '2569';
        const studentData = await requestApi<Student[]>('listStudents', { academicYear: selectedYear });
        if (!active) return;
        setAcademicYears(yearData);
        setAcademicYear(selectedYear);
        setStudents(studentData);
        setCaretakers(caretakerData);
      } catch (loadError) {
        if (!active) return;
        setError(`โหลดรายชื่อนักเรียนหรือผู้ดูแลไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOptions();
    return () => { active = false; };
  }, []);

  async function changeAcademicYear(value: string) {
    setAcademicYear(value);
    setSelectedStudents([]);
    setGradeFilter('');
    setRoomFilter('');
    setLoading(true);
    setError('');
    try {
      setStudents(await requestApi<Student[]>('listStudents', { academicYear: value }));
    } catch (loadError) {
      setError(`โหลดรายชื่อนักเรียนไม่สำเร็จ: ${loadError instanceof Error ? loadError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
    } finally {
      setLoading(false);
    }
  }

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
    if (!selectedCaretakers.length) {
      setError('กรุณาเลือกผู้ดูแลที่รับผิดชอบอย่างน้อย 1 คน');
      return;
    }
    if (!isAdmin && !selectedCaretakers.includes(currentUser.id)) {
      setError('ต้องมีผู้สร้างเคสเป็นผู้ดูแลในเคสด้วย');
      return;
    }
    if (!await confirm({
      title: 'ยืนยันบันทึกเคส?',
      description: `นักเรียนที่เลือก: ${selectedStudents.map(studentName).join(', ')}`,
      confirmLabel: 'บันทึกเคส',
    })) return;
    setSaving(true);
    try {
      await requestApi<null>('createCase', {
        caseType,
        otherText: caseType === 'other' ? otherText.trim() : null,
        details: details.trim() || null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        createdBy: currentUser.id,
        studentIds: selectedStudents.map((student) => student.id),
        caretakerIds: selectedCaretakers,
      });
    } catch (saveError) {
      setError(`บันทึกเคสไม่สำเร็จ: ${saveError instanceof Error ? saveError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}`);
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {dialog}
      <section role="dialog" aria-modal="true" aria-labelledby="new-case-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{t('บันทึกการดูแล')}</p>
            <h2 id="new-case-title" className="text-xl font-bold text-gray-800">{t('สร้างเคสใหม่')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('ปิด')} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        {loading ? <p className="py-10 text-center text-gray-500">{t('กำลังโหลดข้อมูล...')}</p> : (
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold">{t('นักเรียนที่เกี่ยวข้อง')} <span className="text-red-500">*</span></label>
              <label className="mb-2 block text-xs text-gray-500">{t('ปีการศึกษา')}
                <select value={academicYear} onChange={(event) => void changeAcademicYear(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800">
                  {[...new Set([academicYear, ...academicYears])].sort((a, b) => b.localeCompare(a)).map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_110px]">
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3">
                  <Search size={17} className="text-gray-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('ค้นหาชื่อ / รหัส / ชื่อเล่น')} className="w-full py-2.5 text-sm outline-none" />
                </div>
                <select value={gradeFilter} onChange={(event) => { setGradeFilter(event.target.value); setRoomFilter(''); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">{t('ทุกระดับชั้น')}</option>
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
                <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                  <option value="">{t('ทุกห้อง')}</option>
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
                }) : <p className="p-4 text-center text-sm text-gray-400">{t('ไม่พบนักเรียน')}</p>}
              </div>
              {selectedStudents.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selectedStudents.map((student) => <span key={student.id} className="flex items-center gap-1 rounded-full bg-primary-light px-3 py-1 text-xs text-primary">{studentName(student)}<button type="button" onClick={() => toggleStudent(student)} aria-label={`นำ ${studentName(student)} ออก`}><X size={13} /></button></span>)}</div>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="case-type" className="mb-2 block text-sm font-semibold">{t('ประเภทเคส')}</label>
                <select id="case-type" value={caseType} onChange={(event) => setCaseType(event.target.value as typeof caseType)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5">
                  <option value="low_confidence">{t('ขาดความมั่นใจ')}</option>
                  <option value="feel_not_smart">{t('รู้สึกว่าตนเองไม่เก่ง')}</option>
                  <option value="other">{t('อื่น ๆ')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="scheduled-at" className="mb-2 block text-sm font-semibold">{t('วันและเวลานัดหมาย')}</label>
                <input id="scheduled-at" type="datetime-local" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5" />
              </div>
            </div>
            {caseType === 'other' && <div><label htmlFor="other-text" className="mb-2 block text-sm font-semibold">{t('ระบุประเภทเคส')}</label><input id="other-text" required value={otherText} onChange={(event) => setOtherText(event.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5" /></div>}
            <div>
              <label htmlFor="details" className="mb-2 block text-sm font-semibold">{t('รายละเอียด')}</label>
              <textarea id="details" rows={3} value={details} onChange={(event) => setDetails(event.target.value)} className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5" placeholder={t('ระบุรายละเอียดเบื้องต้น...')} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{t('ผู้ดูแลที่รับผิดชอบ')} <span className="text-red-500">*</span></p>
              {isAdmin && <p className="mb-2 text-xs text-gray-500">{t('บัญชี admin ดูแลภาพรวมทุกเคส แต่ไม่ถูกเพิ่มเป็นผู้ดูแลประจำเคส')}</p>}
              <div className="grid max-h-36 gap-2 overflow-y-auto rounded-xl border border-gray-100 p-3 sm:grid-cols-2">
                {assignableCaretakers.map((caretaker) => <label key={caretaker.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedCaretakers.includes(caretaker.id)} disabled={caretaker.id === currentUser?.id} onChange={() => toggleCaretaker(caretaker.id)} className="accent-primary" />
                  {caretaker.name}{caretaker.id === currentUser?.id ? ' (ผู้สร้างเคส)' : ''}
                </label>)}
                {!assignableCaretakers.length && <p className="text-sm text-gray-500">{t('ไม่มีผู้ดูแลที่พร้อมรับผิดชอบเคส')}</p>}
              </div>
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50">{t('ยกเลิก')}</button>
              <button type="submit" disabled={saving || !currentUser} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">{saving ? t('กำลังบันทึก...') : t('บันทึกเคส')}</button>
            </div>
          </form>
        )}
        {loading && error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </section>
    </div>
  );
}
