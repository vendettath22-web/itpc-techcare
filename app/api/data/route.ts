import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Case, Caretaker, Student } from '@/types/database';

type ApiBody = Record<string, unknown> & { action?: unknown };
type CaseStudentRow = { case_id: string; student_id: string };
type CaseCaretakerRow = { case_id: string; caretaker_id: string };
type SessionClaims = { sub: string; exp: number };
type SessionCaretaker = Pick<Caretaker, 'id' | 'name' | 'role' | 'phone' | 'age' | 'profile_image_path'>;
type PublicAdminContact = { id: string; name: string; phone: string | null; profile_image_path: string | null };

const COOKIE_NAME = 'itpc_session';
const SESSION_SECONDS = 60 * 60 * 8;

function response(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(
    status === 200 ? { data } : { error: data },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

function requiredString(body: ApiBody, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid or missing ${key}`);
  }
  return value.trim();
}

function optionalString(body: ApiBody, key: string): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`Invalid ${key}`);
  return value.trim() || null;
}

function stringArray(body: ApiBody, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid or missing ${key}`);
  }
  return value;
}

function optionalInteger(body: ApiBody, key: string): number | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 18 || parsed > 120) throw new Error(`Invalid ${key}`);
  return parsed;
}

function optionalPhone(body: ApiBody): string | null {
  const phone = optionalString(body, 'phone');
  if (phone && !/^[0-9+() -]{8,20}$/.test(phone)) throw new Error('Invalid phone number');
  return phone;
}

async function uploadCaretakerPhoto(
  supabase: SupabaseClient,
  caretakerId: string,
  value: unknown,
): Promise<string | null> {
  return uploadProfilePhoto(supabase, 'caretaker-photos', caretakerId, value);
}

async function uploadProfilePhoto(
  supabase: SupabaseClient,
  bucket: 'caretaker-photos' | 'student-photos',
  profileId: string,
  value: unknown,
): Promise<string | null> {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 3_000_000) {
    throw new Error('รูปภาพมีขนาดใหญ่เกินไป');
  }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP');
  const contentType = `image/${match[1]}`;
  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > 2 * 1024 * 1024) {
    throw new Error('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
  }
  const path = `${profileId}/profile`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, image, { contentType, upsert: true, cacheControl: '3600' });
  if (error?.message.toLowerCase().includes('bucket not found')) {
    const migration = bucket === 'student-photos'
      ? '20261027000004_profiles_student_photos.sql'
      : '20261027000003_caretaker_profile_fields.sql';
    throw new Error(`ยังไม่มีพื้นที่เก็บรูปใน Supabase กรุณารัน migration ${migration} แล้วลองใหม่`);
  }
  throwIfError(error);
  return path;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function environment() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!url || !key || !jwtSecret) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_JWT_SECRET');
  }
  return { url, key, jwtSecret };
}

function supabaseClient(key: string, token?: string): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
}

function signSession(caretaker: SessionCaretaker, secret: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: caretaker.id,
    aud: 'authenticated',
    role: 'authenticated',
    app_role: caretaker.role,
    iat: issuedAt,
    exp: issuedAt + SESSION_SECONDS,
  })}`;
  const signature = createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(';')) {
    const [key, ...value] = cookie.trim().split('=');
    if (key === name) return value.join('=') || null;
  }
  return null;
}

function verifySession(token: string, secret: string): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', secret).update(input).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: unknown };
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Partial<SessionClaims>;
    if (
      header.alg !== 'HS256' ||
      typeof claims.sub !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return claims as SessionClaims;
  } catch {
    return null;
  }
}

function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; Path=/takecare; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/takecare; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function isAdmin(caretaker: SessionCaretaker): boolean {
  return caretaker.role === 'admin';
}

async function caretakerWithPhotoUrl(
  supabase: SupabaseClient,
  caretaker: SessionCaretaker,
): Promise<SessionCaretaker & { profile_photo_url: string | null }> {
  if (!caretaker.profile_image_path) return { ...caretaker, profile_photo_url: null };
  const { data, error } = await supabase.storage
    .from('caretaker-photos')
    .createSignedUrl(caretaker.profile_image_path, 3600);
  throwIfError(error);
  if (!data?.signedUrl) throw new Error('สร้างลิงก์รูปโปรไฟล์ไม่สำเร็จ');
  return { ...caretaker, profile_photo_url: data.signedUrl };
}

async function getActiveCaretaker(
  token: string,
  key: string,
  id: string,
): Promise<{ client: SupabaseClient; caretaker: SessionCaretaker | null }> {
  const client = supabaseClient(key, token);
  const { data, error } = await client
    .from('caretakers')
    .select('id, name, role, phone, age, profile_image_path')
    .eq('id', id)
    .is('deactivated_at', null)
    .maybeSingle();
  throwIfError(error);
  return { client, caretaker: data as SessionCaretaker | null };
}

export async function POST(request: Request) {
  let body: ApiBody;
  try {
    body = await request.json() as ApiBody;
  } catch {
    return response('Invalid JSON request body', 400);
  }

  try {
    const { url, key, jwtSecret } = environment();
    const action = body.action;

    if (action === 'listLoginCaretakers') {
      const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.rpc('list_login_caretakers');
      throwIfError(error);
      return response(data ?? []);
    }

    if (action === 'listAdminContacts') {
      const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.rpc('list_public_admin_contacts');
      if (error?.message.toLowerCase().includes('list_public_admin_contacts')) {
        throw new Error('ข้อมูลติดต่อแอดมินยังไม่พร้อม กรุณารัน migration 20261027000005_admin_contact_info.sql บน Supabase');
      }
      throwIfError(error);
      const contacts = await Promise.all(((data ?? []) as PublicAdminContact[]).map(async (contact) => {
        if (!contact.profile_image_path) return { ...contact, profile_photo_url: null };
        const { data: signedUrl, error: signedUrlError } = await supabase.storage
          .from('caretaker-photos')
          .createSignedUrl(contact.profile_image_path, 3600);
        throwIfError(signedUrlError);
        if (!signedUrl?.signedUrl) throw new Error('สร้างลิงก์รูปแอดมินไม่สำเร็จ');
        return { ...contact, profile_photo_url: signedUrl.signedUrl };
      }));
      return response(contacts);
    }

    if (action === 'verifyCaretakerPin') {
      const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.rpc('verify_caretaker_pin', {
        p_pin: requiredString(body, 'pin'),
      });
      throwIfError(error);
      const matches = Array.isArray(data) ? data : data ? [data] : [];
      const selectedCaretakerId = requiredString(body, 'caretakerId');
      const caretaker = matches.find((match) => {
        return typeof match === 'object' && match !== null && 'id' in match &&
          match.id === selectedCaretakerId;
      }) as SessionCaretaker | undefined;
      if (!caretaker) return response('PIN ไม่ถูกต้องสำหรับบัญชีที่เลือก', 401);
      if (!caretaker.id || !caretaker.name || !['admin', 'caretaker'].includes(caretaker.role)) {
        return response('ข้อมูลบัญชีไม่ถูกต้อง', 500);
      }
      return response(
        caretaker,
        200,
        { 'Set-Cookie': sessionCookie(signSession(caretaker, jwtSecret)) },
      );
    }

    if (action === 'logout') {
      return response(null, 200, { 'Set-Cookie': clearedSessionCookie() });
    }

    const token = readCookie(request, COOKIE_NAME);
    const claims = token ? verifySession(token, jwtSecret) : null;
    if (!token || !claims) return response('กรุณาเข้าสู่ระบบใหม่', 401);

    const { client: supabase, caretaker } = await getActiveCaretaker(token, key, claims.sub);
    if (!caretaker) return response('บัญชีถูกปิดใช้งานหรือไม่พบผู้ใช้', 401);

    if (action === 'getSession') return response(await caretakerWithPhotoUrl(supabase, caretaker));

    switch (action) {
      case 'listCaretakers': {
        const { data, error } = await supabase
          .from('caretakers')
          .select('id, name, role, created_at, deactivated_at')
          .is('deactivated_at', null)
          .order('name');
        throwIfError(error);
        return response(data ?? []);
      }
      case 'adminListCaretakers': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase
          .from('caretakers')
          .select('id, name, role, created_at, deactivated_at, phone, age, profile_image_path')
          .order('name');
        throwIfError(error);
        const caretakerList = await Promise.all((data ?? []).map(async (item) => {
          if (!item.profile_image_path) return { ...item, profile_photo_url: null, profile_photo_error: null };
          const { data: signedUrl, error: signedUrlError } = await supabase.storage
            .from('caretaker-photos')
            .createSignedUrl(item.profile_image_path, 3600);
          if (signedUrlError?.message.toLowerCase().includes('bucket not found')) {
            return {
              ...item,
              profile_photo_url: null,
              profile_photo_error: 'ยังไม่มีพื้นที่เก็บรูปใน Supabase (migration 20261027000003 ยังไม่ได้รัน)',
            };
          }
          throwIfError(signedUrlError);
          if (!signedUrl?.signedUrl) throw new Error('สร้างลิงก์รูปโปรไฟล์ไม่สำเร็จ');
          return { ...item, profile_photo_url: signedUrl.signedUrl, profile_photo_error: null };
        }));
        return response(caretakerList);
      }
      case 'updateCaretakerProfile': {
        const name = requiredString(body, 'name');
        const phone = optionalPhone(body);
        const age = optionalInteger(body, 'age');
        const photoPath = await uploadCaretakerPhoto(supabase, caretaker.id, body.photoDataUrl);
        const { data, error } = await supabase
          .from('caretakers')
          .update({
            name,
            phone,
            age,
            ...(photoPath ? { profile_image_path: photoPath } : {}),
          })
          .eq('id', caretaker.id)
          .select('id, name, role, phone, age, profile_image_path')
          .single();
        throwIfError(error);
        if (!data) throw new Error('อัปเดตข้อมูลโปรไฟล์ไม่สำเร็จ');
        return response(await caretakerWithPhotoUrl(supabase, data));
      }
      case 'createCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = randomUUID();
        const name = requiredString(body, 'name');
        const pin = requiredString(body, 'pin');
        const phone = optionalPhone(body);
        const age = optionalInteger(body, 'age');
        const photoPath = await uploadCaretakerPhoto(supabase, id, body.photoDataUrl);
        const { data, error } = await supabase.rpc('admin_create_caretaker', {
          p_id: id,
          p_name: name,
          p_pin: pin,
          p_role: body.role === 'admin' ? 'admin' : 'caretaker',
          p_phone: phone,
          p_age: age,
          p_profile_image_path: photoPath,
        });
        if (error && photoPath) {
          const { error: removeError } = await supabase.storage.from('caretaker-photos').remove([photoPath]);
          if (removeError) throw new Error(`${error.message}; ลบรูปที่อัปโหลดไม่สำเร็จ: ${removeError.message}`);
        }
        throwIfError(error);
        return response(data);
      }
      case 'updateCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = requiredString(body, 'id');
        const { data: current, error: currentError } = await supabase
          .from('caretakers')
          .select('profile_image_path')
          .eq('id', id)
          .maybeSingle();
        throwIfError(currentError);
        if (!current) return response('Caretaker not found', 404);
        const name = requiredString(body, 'name');
        const phone = optionalPhone(body);
        const age = optionalInteger(body, 'age');
        const uploadedPath = await uploadCaretakerPhoto(supabase, id, body.photoDataUrl);
        const { data, error } = await supabase.rpc('admin_update_caretaker', {
          p_id: id,
          p_name: name,
          p_role: body.role === 'admin' ? 'admin' : 'caretaker',
          p_pin: optionalString(body, 'pin'),
          p_phone: phone,
          p_age: age,
          p_profile_image_path: uploadedPath ?? current.profile_image_path,
        });
        throwIfError(error);
        return response(data);
      }
      case 'deactivateCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { error } = await supabase.rpc('admin_deactivate_caretaker', {
          p_id: requiredString(body, 'id'),
        });
        throwIfError(error);
        return response(null);
      }
      case 'listAcademicYears': {
        const { data, error } = await supabase
          .from('students')
          .select('academic_year')
          .is('deactivated_at', null)
          .order('academic_year', { ascending: false });
        throwIfError(error);
        return response([...new Set((data ?? []).map((row) => row.academic_year))]);
      }
      case 'listStudents': {
        let query = supabase
          .from('students')
          .select('*')
          .is('deactivated_at', null)
          .order('first_name_th');
        if (typeof body.academicYear === 'string' && body.academicYear) {
          query = query.eq('academic_year', body.academicYear);
        }
        const { data, error } = await query;
        throwIfError(error);
        const students = await Promise.all((data ?? []).map(async (student) => {
          if (!student.profile_image_path) return { ...student, profile_photo_url: null };
          const { data: signedUrl, error: signedUrlError } = await supabase.storage
            .from('student-photos')
            .createSignedUrl(student.profile_image_path, 3600);
          if (signedUrlError?.message.toLowerCase().includes('bucket not found')) {
            return { ...student, profile_photo_url: null };
          }
          throwIfError(signedUrlError);
          if (!signedUrl?.signedUrl) throw new Error('สร้างลิงก์รูปนักเรียนไม่สำเร็จ');
          return { ...student, profile_photo_url: signedUrl.signedUrl };
        }));
        return response(students);
      }
      case 'createStudent': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = randomUUID();
        const room = body.room === '' || body.room === null ? null : Number(body.room);
        if (room !== null && (!Number.isInteger(room) || room < 1)) {
          return response('Invalid room', 400);
        }
        const academicYear = requiredString(body, 'academicYear');
        const studentId = optionalString(body, 'studentId');
        const firstName = optionalString(body, 'firstNameTh');
        const lastName = optionalString(body, 'lastNameTh');
        const nickname = optionalString(body, 'nicknameTh');
        const grade = optionalString(body, 'grade');
        const gender = optionalString(body, 'gender');
        const photoPath = await uploadProfilePhoto(supabase, 'student-photos', id, body.photoDataUrl);
        const { data, error } = await supabase.rpc('admin_create_student', {
          p_id: id,
          p_student_id: studentId,
          p_first_name_th: firstName,
          p_last_name_th: lastName,
          p_nickname_th: nickname,
          p_grade: grade,
          p_room: room,
          p_gender: gender,
          p_academic_year: academicYear,
          p_profile_image_path: photoPath,
        });
        if (error && photoPath) {
          const { error: removeError } = await supabase.storage.from('student-photos').remove([photoPath]);
          if (removeError) throw new Error(`${error.message}; ลบรูปนักเรียนที่อัปโหลดไม่สำเร็จ: ${removeError.message}`);
        }
        throwIfError(error);
        return response(data);
      }
      case 'updateStudent': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = requiredString(body, 'id');
        const room = body.room === '' || body.room === null ? null : Number(body.room);
        if (room !== null && (!Number.isInteger(room) || room < 1)) {
          return response('Invalid room', 400);
        }
        const { data: current, error: currentError } = await supabase
          .from('students')
          .select('profile_image_path')
          .eq('id', id)
          .is('deactivated_at', null)
          .maybeSingle();
        throwIfError(currentError);
        if (!current) return response('ไม่พบข้อมูลนักเรียนที่เปิดใช้งาน', 404);
        const uploadedPath = await uploadProfilePhoto(supabase, 'student-photos', id, body.photoDataUrl);
        const { error } = await supabase.rpc('admin_update_student', {
          p_id: id,
          p_student_id: optionalString(body, 'studentId'),
          p_first_name_th: optionalString(body, 'firstNameTh'),
          p_last_name_th: optionalString(body, 'lastNameTh'),
          p_nickname_th: optionalString(body, 'nicknameTh'),
          p_grade: optionalString(body, 'grade'),
          p_room: room,
          p_gender: optionalString(body, 'gender'),
          p_academic_year: requiredString(body, 'academicYear'),
          p_profile_image_path: uploadedPath ?? current.profile_image_path,
        });
        if (error?.message.toLowerCase().includes('admin_update_student')) {
          throw new Error('ระบบแก้ไขข้อมูลนักเรียนยังไม่พร้อม กรุณารัน migration 20261027000006_admin_update_student.sql แล้วลองใหม่');
        }
        throwIfError(error);
        return response(null);
      }
      case 'deactivateStudent': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { error } = await supabase.rpc('admin_deactivate_student', {
          p_id: requiredString(body, 'id'),
        });
        throwIfError(error);
        return response(null);
      }
      case 'getStudent': {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('id', requiredString(body, 'id'))
          .is('deactivated_at', null)
          .maybeSingle();
        throwIfError(error);
        if (!data || !data.profile_image_path) return response(data);
        const { data: signedUrl, error: signedUrlError } = await supabase.storage
          .from('student-photos')
          .createSignedUrl(data.profile_image_path, 3600);
        if (signedUrlError?.message.toLowerCase().includes('bucket not found')) {
          return response(data);
        }
        throwIfError(signedUrlError);
        if (!signedUrl?.signedUrl) throw new Error('สร้างลิงก์รูปนักเรียนไม่สำเร็จ');
        return response({ ...data, profile_photo_url: signedUrl.signedUrl });
      }
      case 'fetchCases': {
        const [caseResult, studentLinks, caretakerLinks, studentResult, caretakerResult] =
          await Promise.all([
            supabase.from('cases').select('*').order('scheduled_at', { ascending: false }),
            supabase.from('case_students').select('case_id, student_id'),
            supabase.from('case_caretakers').select('case_id, caretaker_id'),
            supabase.from('students').select('*').is('deactivated_at', null),
            supabase.from('caretakers')
              .select('id, name, role, created_at, deactivated_at')
              .is('deactivated_at', null),
          ]);
        throwIfError(
          caseResult.error ??
          studentLinks.error ??
          caretakerLinks.error ??
          studentResult.error ??
          caretakerResult.error,
        );

        const studentsById = new Map<string, Student>(
          (studentResult.data ?? []).map((student) => [student.id, student as Student]),
        );
        const caretakersById = new Map<string, Caretaker>(
          (caretakerResult.data ?? []).map((item) => [item.id, item as Caretaker]),
        );
        const studentsByCase = new Map<string, Student[]>();
        const caretakersByCase = new Map<string, Caretaker[]>();
        for (const row of (studentLinks.data ?? []) as CaseStudentRow[]) {
          const student = studentsById.get(row.student_id);
          if (student) studentsByCase.set(row.case_id, [...(studentsByCase.get(row.case_id) ?? []), student]);
        }
        for (const row of (caretakerLinks.data ?? []) as CaseCaretakerRow[]) {
          const assigned = caretakersById.get(row.caretaker_id);
          if (assigned) {
            caretakersByCase.set(row.case_id, [...(caretakersByCase.get(row.case_id) ?? []), assigned]);
          }
        }
        return response(((caseResult.data ?? []) as Case[]).map((caseItem) => ({
          ...caseItem,
          created_by: caretakersById.has(caseItem.created_by) ? caseItem.created_by : '',
          created_by_name: caretakersById.get(caseItem.created_by)?.name ?? null,
          students: studentsByCase.get(caseItem.id) ?? [],
          caretakers: caretakersByCase.get(caseItem.id) ?? [],
        })));
      }
      case 'caseDetails': {
        const caseId = requiredString(body, 'caseId');
        const [updateResult, signatureResult, caretakerResult] = await Promise.all([
          supabase.from('case_updates').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
          supabase.from('case_signatures').select('*').eq('case_id', caseId).order('signed_at', { ascending: false }),
          supabase.from('caretakers')
            .select('id, name, role, created_at, deactivated_at')
            .is('deactivated_at', null),
        ]);
        throwIfError(updateResult.error ?? signatureResult.error ?? caretakerResult.error);
        return response({
          updates: updateResult.data ?? [],
          signatures: signatureResult.data ?? [],
          caretakers: caretakerResult.data ?? [],
        });
      }
      case 'createCase': {
        const caseType = requiredString(body, 'caseType');
        if (!['low_confidence', 'feel_not_smart', 'other'].includes(caseType)) {
          return response('Invalid caseType', 400);
        }
        const { data, error } = await supabase.rpc('create_case_with_relations', {
          p_case_type: caseType,
          p_other_text: optionalString(body, 'otherText'),
          p_details: optionalString(body, 'details'),
          p_scheduled_at: requiredString(body, 'scheduledAt'),
          p_created_by: caretaker.id,
          p_student_ids: stringArray(body, 'studentIds'),
          p_caretaker_ids: stringArray(body, 'caretakerIds'),
        });
        throwIfError(error);
        return response(data);
      }
      case 'insertCaseUpdate': {
        const { error } = await supabase.from('case_updates').insert({
          case_id: requiredString(body, 'caseId'),
          caretaker_id: caretaker.id,
          activity_note: requiredString(body, 'activityNote'),
          result_note: optionalString(body, 'resultNote'),
          next_step: optionalString(body, 'nextStep'),
        });
        throwIfError(error);
        return response(null);
      }
      case 'updateCaseStatus': {
        const status = body.status === 'done' ? 'done' : 'planned';
        const { error } = await supabase.from('cases').update({
          status,
          updated_at: new Date().toISOString(),
        }).eq('id', requiredString(body, 'caseId'));
        throwIfError(error);
        return response(null);
      }
      case 'listCaseUpdates': {
        const { data, error } = await supabase
          .from('case_updates')
          .select('*')
          .eq('case_id', requiredString(body, 'caseId'))
          .order('created_at', { ascending: false });
        throwIfError(error);
        return response(data ?? []);
      }
      case 'saveSignature': {
        const { data, error } = await supabase.from('case_signatures').insert({
          case_id: requiredString(body, 'caseId'),
          signer_name: requiredString(body, 'signerName'),
          signer_role: requiredString(body, 'signerRole'),
          signature_data: requiredString(body, 'signatureData'),
        }).select('*').single();
        throwIfError(error);
        return response(data);
      }
      default:
        return response('Unknown API action', 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase request failed';
    return response(message, 500);
  }
}
