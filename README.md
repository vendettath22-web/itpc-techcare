# ITPC Techcare

ระบบติดตามการดูแลช่วยเหลือนักเรียนด้วย Next.js และ Supabase

## เริ่มต้นใช้งาน

ติดตั้ง dependencies และกำหนด `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

จากนั้นรัน:

```bash
npm install
npm run dev
```

## Supabase API ที่หน้าเว็บใช้

ตั้งค่า Supabase ให้มีตารางและคอลัมน์ที่สอดคล้องกับ [types/database.ts](./types/database.ts):

- `caretakers`: `id`, `name`, `created_at`
- `students`: `id`, `student_id`, `first_name_th`, `last_name_th`, `nickname_th`, `grade`, `room`, `gender`
- `cases`: `id`, `case_type`, `other_text`, `details`, `scheduled_at`, `status`, `created_by`, `created_at`, `updated_at`
- `case_students`: `case_id`, `student_id`
- `case_caretakers`: `case_id`, `caretaker_id`
- `case_updates`: `id`, `case_id`, `caretaker_id`, `activity_note`, `result_note`, `next_step`, `created_at`
- `case_signatures`: `id`, `case_id`, `signer_name`, `signer_role`, `signature_data`, `signed_at`

เว็บเรียก RPC ต่อไปนี้ด้วยชื่อพารามิเตอร์ตามที่ระบุ:

- `verify_caretaker_pin(p_pin)` ต้องคืนข้อมูลผู้ดูแลที่มี `id` และ `name`
- `create_case_with_relations(p_case_type, p_other_text, p_details, p_scheduled_at, p_created_by, p_student_ids, p_caretaker_ids)`

หน้า Login โหลดตัวเลือกอาจารย์จาก `caretakers` และตรวจให้ผู้ดูแลที่ RPC คืนมาตรงกับอาจารย์ที่เลือก

กำหนด Row Level Security policies ให้เหมาะกับการใช้งานจริง โดยจำกัดการอ่านและเขียนตามผู้ดูแลที่เข้าสู่ระบบ อย่าใช้ service-role key ในเว็บไคลเอนต์

## ฟังก์ชันหลัก

- ปฏิทินเคส แสดงเคสของผู้ดูแลหรือเคสทั้งหมด
- สร้างเคสโดยเลือกนักเรียนและผู้ดูแลได้หลายคน
- ติดตามผลเคสและบันทึกลายเซ็นผ่าน canvas
- หน้ารายชื่อนักเรียนและประวัติเคสรายบุคคล
- Export PDF ผ่านหน้าพิมพ์ของเบราว์เซอร์ (เลือก Save as PDF เพื่อใช้ฟอนต์ภาษาไทยของระบบ) และ Export Excel `.xlsx`
