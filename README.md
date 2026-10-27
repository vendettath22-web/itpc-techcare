# itpctakecare

ระบบติดตามการดูแลช่วยเหลือนักเรียนด้วย Next.js และ Supabase

## เริ่มต้นใช้งาน

กำหนด `.env.local` โดยใช้ค่าจาก Supabase Project Settings:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_JWT_SECRET=your-supabase-jwt-signing-secret
```

`SUPABASE_JWT_SECRET` ใช้เฉพาะฝั่งเซิร์ฟเวอร์เพื่อออก session JWT หลังตรวจ PIN สำเร็จ และต้องเป็น signing secret ที่ Supabase Data API ยอมรับสำหรับ HS256 ห้ามใช้ service-role key แทนค่านี้หรือส่งค่านี้ไปยังเบราว์เซอร์ หากโปรเจกต์ใช้ signing key แบบ asymmetric ให้หยุดก่อน deploy และปรับระบบเข้าสู่ระบบให้ใช้ Supabase Auth แทน

จากนั้นติดตั้งและรัน:

```bash
npm install
npm run dev
```

เปิด `http://localhost:3000/takecare` (หน้าเข้าสู่ระบบ `/takecare/login`)

## ติดตั้งฐานข้อมูลและ RLS

1. สำรองฐานข้อมูลก่อนเปลี่ยน schema และตรวจสอบว่าตาราง/foreign key ตรงกับ DDL ที่ให้มา
2. เปิด Supabase SQL Editor แล้วรัน migration [20261027000000_roles_years_rls.sql](./supabase/migrations/20261027000000_roles_years_rls.sql)
3. ตั้งบัญชี admin เริ่มต้นจากบัญชีผู้ดูแลที่มีอยู่แล้ว โดยค้นหา UUID:

   ```sql
   select id, name
   from public.caretakers
   where deactivated_at is null
   order by created_at;
   ```

   จากนั้นกำหนดบัญชีที่เชื่อถือได้อย่างน้อยหนึ่งบัญชีเป็น admin:

   ```sql
   update public.caretakers
   set role = 'admin'
   where id = 'ใส่-UUID-บัญชีที่เลือก';
   ```

4. เพิ่ม `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` และ `SUPABASE_JWT_SECRET` ใน environment ของเครื่องพัฒนาและระบบ deploy แล้ว restart/redeploy
5. ทดสอบล็อกอินทั้งบัญชี admin และผู้ดูแล จากนั้นตรวจว่า API ทำงานและแถว `deactivated_at` ไม่ถูกอ่านกลับ

Migration จะเพิ่ม Role, `deactivated_at` และ `academic_year`, แปลง PIN แบบ plaintext เดิมเป็น bcrypt hash, จำกัด PIN ใหม่ให้เป็นตัวเลข 4-12 หลัก, สร้าง RPC สำหรับ admin และเปิด RLS ทุกตารางที่เกี่ยวข้อง การเข้าสู่ระบบด้วย PIN ต้องได้บัญชีที่ตรงกันเพียงบัญชีเดียว จึงกำหนด PIN ซ้ำในบัญชีที่เปิดใช้งานไม่ได้

## สิทธิ์และการเก็บข้อมูล

- Admin เพิ่ม/แก้ไข/ปิดบัญชีผู้ดูแล และเพิ่ม/ปิดข้อมูลนักเรียน
- ผู้ดูแลทั่วไปอ่านข้อมูลที่เปิดใช้งาน แก้ไขได้เฉพาะชื่อโปรไฟล์ของตน และเพิ่ม/ติดตามเคสตามผู้ดูแลที่ได้รับมอบหมาย ไม่มีสิทธิ์เพิ่มนักเรียนหรือจัดการบัญชี
- การปิดบัญชีหรือนักเรียนบันทึกเวลาใน `deactivated_at` และเก็บแถวเดิมไว้ แต่ RLS/API จะไม่นำข้อมูลที่ปิดแล้วกลับมาในแอป
- นักเรียนบันทึกแยกตาม `academic_year` (ปี พ.ศ. 4 หลัก) สามารถนำเข้าปีใหม่โดยสร้างแถวใหม่ โดยรหัสนักเรียนซ้ำได้คนละปี
- ผู้ใช้ที่อ่านข้อมูลผ่าน Supabase ต้องมี role `admin` หรือ `caretaker` ที่ยังเปิดใช้งาน ระบบไม่ใช้ service-role key

การปิดนักเรียนซ่อนชื่อและข้อมูลนักเรียนจากหน้าเคส/รายงาน แต่ไม่ลบประวัติเคสหรือแถวความสัมพันธ์เดิมในฐานข้อมูล

## ฟังก์ชันหลัก

- ปฏิทินเคส สร้างเคส และติดตามเคส
- รายชื่อนักเรียนแยกตามปีการศึกษา
- หน้า admin จัดการบัญชีผู้ดูแล
- Export PDF/Excel ประวัติเคส รวมบันทึกติดตามและลายเซ็น
