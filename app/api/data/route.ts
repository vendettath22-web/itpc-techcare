import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isCaseServiceType } from '@/lib/case-services';
import type { CaseServiceFormData } from '@/lib/case-service-forms';
import { calculateStudentAge, type StudentIntakeFormData } from '@/lib/student-intake-form';
import type { itpc_takecare_cases, itpc_takecare_caretakers, itpc_takecare_students } from '@/types/database';

type ApiBody = Record<string, unknown> & { action?: unknown };
type ImportedStudent = {
  student_id: string;
  first_name_th: string;
  last_name_th: string;
  nickname_th: string | null;
  grade: string;
  room: number;
  gender: string | null;
};
type itpc_takecare_case_students = { case_id: string; student_id: string };
type itpc_takecare_case_caretakers = { case_id: string; caretaker_id: string };
type SessionClaims = { sub: string; exp: number };
type SessionCaretaker = Pick<itpc_takecare_caretakers, 'id' | 'name' | 'role' | 'phone' | 'age' | 'profile_image_path'>;
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

function importedStudents(value: unknown): ImportedStudent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2000) {
    throw new Error('ต้องมีข้อมูลนักเรียน 1 ถึง 2,000 รายการ');
  }
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`ข้อมูลนักเรียนแถว ${index + 2} ไม่ถูกต้อง`);
    }
    const row = item as Record<string, unknown>;
    const studentId = typeof row.studentId === 'string' ? row.studentId.trim() : '';
    const firstName = typeof row.firstNameTh === 'string' ? row.firstNameTh.trim() : '';
    const lastName = typeof row.lastNameTh === 'string' ? row.lastNameTh.trim() : '';
    const nickname = typeof row.nicknameTh === 'string' ? row.nicknameTh.trim() : '';
    const grade = typeof row.grade === 'string' ? row.grade.trim() : '';
    const roomValue = typeof row.room === 'string' ? row.room.trim() : '';
    const gender = typeof row.gender === 'string' ? row.gender.trim() : '';
    if (
      !studentId || studentId.length > 100 ||
      !firstName || firstName.length > 200 ||
      !lastName || lastName.length > 200 ||
      nickname.length > 200 ||
      !grade || grade.length > 100 ||
      !/^\d+$/.test(roomValue) || Number(roomValue) < 1 || Number(roomValue) > 999 ||
      gender.length > 30
    ) {
      throw new Error(`ข้อมูลนักเรียนแถว ${index + 2} ไม่ครบหรือไม่ถูกต้อง`);
    }
    return {
      student_id: studentId,
      first_name_th: firstName,
      last_name_th: lastName,
      nickname_th: nickname || null,
      grade,
      room: Number(roomValue),
      gender: gender || null,
    };
  });
}

function studentIntakeFormData(value: unknown): StudentIntakeFormData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('ข้อมูลแบบบันทึกนักเรียนไม่ถูกต้อง');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) throw new Error('ข้อมูลแบบบันทึกนักเรียนมีจำนวนช่องมากเกินไป');

  const result: StudentIntakeFormData = {};
  for (const [key, fieldValue] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(key)) {
      throw new Error('ชื่อช่องข้อมูลแบบบันทึกนักเรียนไม่ถูกต้อง');
    }
    if (typeof fieldValue === 'string' && fieldValue.length <= 5000) {
      result[key] = fieldValue;
    } else if (
      Array.isArray(fieldValue) &&
      fieldValue.length <= 50 &&
      fieldValue.every((item): item is string => typeof item === 'string' && item.length <= 200)
    ) {
      result[key] = [...fieldValue];
    } else {
      throw new Error('ข้อมูลในแบบบันทึกนักเรียนไม่ถูกต้องหรือยาวเกินไป');
    }
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 50_000) {
    throw new Error('ข้อมูลแบบบันทึกนักเรียนมีขนาดใหญ่เกินไป');
  }
  return result;
}

function caseServiceFormData(value: unknown): CaseServiceFormData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('ข้อมูลแบบฟอร์มบริการไม่ถูกต้อง');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) throw new Error('ข้อมูลแบบฟอร์มบริการมีจำนวนช่องมากเกินไป');

  const result: CaseServiceFormData = {};
  for (const [key, fieldValue] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(key)) {
      throw new Error('ชื่อช่องข้อมูลแบบฟอร์มบริการไม่ถูกต้อง');
    }
    if (typeof fieldValue === 'string' && fieldValue.length <= 5000) {
      result[key] = fieldValue;
    } else if (
      Array.isArray(fieldValue) &&
      fieldValue.length <= 50 &&
      fieldValue.every((item): item is string => typeof item === 'string' && item.length <= 200)
    ) {
      result[key] = [...fieldValue];
    } else {
      throw new Error('ข้อมูลในแบบฟอร์มบริการไม่ถูกต้องหรือยาวเกินไป');
    }
  }
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 50_000) {
    throw new Error('ข้อมูลแบบฟอร์มบริการมีขนาดใหญ่เกินไป');
  }
  return result;
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

async function uploadStudentDocument(
  supabase: SupabaseClient,
  studentId: string,
  value: unknown,
): Promise<string | null> {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 8_000_000) {
    throw new Error('ไฟล์ใบรับรองแพทย์มีขนาดใหญ่เกินไป');
  }
  const match = /^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('รองรับเฉพาะไฟล์ PDF, JPG, PNG หรือ WebP');
  const file = Buffer.from(match[2], 'base64');
  if (!file.length || file.length > 2 * 1024 * 1024) {
    throw new Error('ไฟล์ใบรับรองแพทย์ต้องมีขนาดไม่เกิน 2 MB');
  }
  const extension = match[1] === 'application/pdf'
    ? 'pdf'
    : match[1] === 'image/jpeg' ? 'jpg' : match[1].slice('image/'.length);
  const path = `${studentId}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from('student-documents')
    .upload(path, file, {
      contentType: match[1],
      upsert: true,
      cacheControl: '3600',
    });
  if (error?.message.toLowerCase().includes('bucket not found')) {
    throw new Error('ยังไม่มีพื้นที่เก็บใบรับรองแพทย์ กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql แล้วลองใหม่');
  }
  throwIfError(error);
  return path;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function recordUsageLog(
  supabase: SupabaseClient,
  caretaker: SessionCaretaker,
  action: string,
  details: string | null = null,
): Promise<void> {
  const { error } = await supabase.from('itpc_takecare_app_usage_logs').insert({
    caretaker_id: caretaker.id,
    caretaker_name: caretaker.name,
    caretaker_role: caretaker.role,
    action,
    details: details?.slice(0, 500) ?? null,
  });
  const errorMessage = error?.message.toLowerCase() ?? '';
  if (errorMessage.includes('details')) {
    throw new Error('ระบบบันทึกกิจกรรมยังไม่พร้อม กรุณารัน migration 20261103000002_app_usage_log_details.sql บน Supabase');
  }
  if (errorMessage.includes('column')) {
    throw new Error('ระบบบันทึกกิจกรรมยังไม่พร้อม กรุณารัน migration 20261103000001_app_usage_log_details.sql และ 20261103000002_app_usage_log_details.sql บน Supabase');
  }
  if (errorMessage.includes('could not find the table') || errorMessage.includes('does not exist')) {
    throw new Error('ระบบบันทึกการใช้งานยังไม่พร้อม กรุณารัน migration 20261103000000_app_usage_logs.sql และ migration ที่เหลือในโฟลเดอร์ supabase/migrations บน Supabase');
  }
  throwIfError(error);
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
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
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
    .from('itpc_takecare_caretakers')
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
      const token = signSession(caretaker, jwtSecret);
      await recordUsageLog(supabaseClient(key, token), caretaker, 'login');
      return response(
        caretaker,
        200,
        { 'Set-Cookie': sessionCookie(token) },
      );
    }

    if (action === 'logout') {
      const token = readCookie(request, COOKIE_NAME);
      const claims = token ? verifySession(token, jwtSecret) : null;
      if (token && claims) {
        const { caretaker } = await getActiveCaretaker(token, key, claims.sub);
        if (caretaker) {
          await recordUsageLog(supabaseClient(key, token), caretaker, 'logout');
        }
      }
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
          .from('itpc_takecare_caretakers')
          .select('id, name, role, created_at, deactivated_at')
          .is('deactivated_at', null)
          .order('name');
        throwIfError(error);
        return response(data ?? []);
      }
      case 'adminListCaretakers': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase
          .from('itpc_takecare_caretakers')
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
      case 'adminListUsageLogs': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase
          .from('itpc_takecare_app_usage_logs')
          .select('id, caretaker_id, caretaker_name, caretaker_role, action, details, used_at')
          .order('used_at', { ascending: false })
          .limit(500);
        throwIfError(error);
        return response(data ?? []);
      }
      case 'updateCaretakerProfile': {
        const name = requiredString(body, 'name');
        const phone = optionalPhone(body);
        const age = optionalInteger(body, 'age');
        const photoPath = await uploadCaretakerPhoto(supabase, caretaker.id, body.photoDataUrl);
        const { data, error } = await supabase
          .from('itpc_takecare_caretakers')
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
        await recordUsageLog(supabase, caretaker, 'update_profile', 'ข้อมูลโปรไฟล์');
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
        await recordUsageLog(supabase, caretaker, 'create_caretaker', `${name} (${body.role === 'admin' ? 'admin' : 'caretaker'})`);
        return response(data);
      }
      case 'updateCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = requiredString(body, 'id');
        const { data: current, error: currentError } = await supabase
          .from('itpc_takecare_caretakers')
          .select('name, profile_image_path')
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
        await recordUsageLog(supabase, caretaker, 'update_caretaker', `${current.name} -> ${name}`);
        return response(data);
      }
      case 'deactivateCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = requiredString(body, 'id');
        const { data: target, error: targetError } = await supabase
          .from('itpc_takecare_caretakers')
          .select('name')
          .eq('id', id)
          .maybeSingle();
        throwIfError(targetError);
        const { error } = await supabase.rpc('admin_deactivate_caretaker', {
          p_id: id,
        });
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'deactivate_caretaker', target?.name ?? id);
        return response(null);
      }
      case 'listAcademicYears': {
        const { data, error } = await supabase
          .from('itpc_takecare_students')
          .select('academic_year')
          .is('deactivated_at', null)
          .order('academic_year', { ascending: false });
        throwIfError(error);
        return response([...new Set((data ?? []).map((row) => row.academic_year))]);
      }
      case 'listStudents': {
        let query = supabase
          .from('itpc_takecare_students')
          .select('*')
          .is('deactivated_at', null)
          .order('first_name_th');
        if (typeof body.academicYear === 'string' && body.academicYear) {
          query = query.eq('academic_year', body.academicYear);
        }
        const { data, error } = await query;
        throwIfError(error);
        const students = await Promise.all((data ?? []).map(async (student) => {
          const visibleStudent = { ...student };
          if (!isAdmin(caretaker)) {
            delete visibleStudent.student_record_data;
            visibleStudent.phone = null;
          }
          if (!student.profile_image_path) return { ...visibleStudent, profile_photo_url: null };
          const { data: signedUrl, error: signedUrlError } = await supabase.storage
            .from('student-photos')
            .createSignedUrl(student.profile_image_path, 3600);
          if (signedUrlError?.message.toLowerCase().includes('bucket not found')) {
            return { ...visibleStudent, profile_photo_url: null };
          }
          throwIfError(signedUrlError);
          if (!signedUrl?.signedUrl) throw new Error('สร้างลิงก์รูปนักเรียนไม่สำเร็จ');
          return { ...visibleStudent, profile_photo_url: signedUrl.signedUrl };
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
        const phone = optionalPhone(body);
        const formData = studentIntakeFormData(body.intakeFormData);
        const photoPath = await uploadProfilePhoto(supabase, 'student-photos', id, body.photoDataUrl);
        const documentPath = await uploadStudentDocument(supabase, id, body.medicalCertificateDataUrl);
        if (documentPath) {
          formData.medicalCertificatePath = documentPath;
          if (typeof body.medicalCertificateName === 'string' && body.medicalCertificateName.trim()) {
            formData.medicalCertificateName = body.medicalCertificateName.trim();
          }
        }
        const { data, error } = await supabase.rpc('admin_create_student_with_intake_form', {
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
          p_form_data: formData,
          p_phone: phone,
        });
        if (error && documentPath) {
          const { error: removeError } = await supabase.storage.from('student-documents').remove([documentPath]);
          if (removeError) throw new Error(`${error.message}; ลบใบรับรองแพทย์ที่อัปโหลดไม่สำเร็จ: ${removeError.message}`);
        }
        if (error && photoPath) {
          const { error: removeError } = await supabase.storage.from('student-photos').remove([photoPath]);
          if (removeError) throw new Error(`${error.message}; ลบรูปนักเรียนที่อัปโหลดไม่สำเร็จ: ${removeError.message}`);
        }
        if (error?.message.toLowerCase().includes('admin_create_student_with_intake_form')) {
          throw new Error('ระบบบันทึกข้อมูลนักเรียนและเอกสารยังไม่พร้อม กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql บน Supabase');
        }
        throwIfError(error);
        const studentName = [firstName, lastName].filter(Boolean).join(' ') || studentId || id;
        await recordUsageLog(supabase, caretaker, 'create_student', `${studentName} (${academicYear})`);
        return response(data);
      }
      case 'importStudents': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const academicYear = requiredString(body, 'academicYear');
        if (!/^\d{4}$/.test(academicYear)) return response('Invalid academic year', 400);
        const students = importedStudents(body.students);
        const { data, error } = await supabase.rpc('admin_import_students', {
          p_academic_year: academicYear,
          p_students: students,
        });
        if (error?.message.toLowerCase().includes('admin_import_students')) {
          throw new Error('ระบบนำเข้าข้อมูลยังไม่พร้อม กรุณารัน migration 20261103000004_bulk_import_students.sql บน Supabase');
        }
        throwIfError(error);
        if (typeof data !== 'number') throw new Error('ผลการนำเข้าข้อมูลไม่ถูกต้อง');
        const skipped = students.length - data;
        await recordUsageLog(supabase, caretaker, 'import_students', `${data} imported, ${skipped} skipped (${academicYear})`);
        return response({ inserted: data, skipped });
      }
      case 'updateStudent': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = requiredString(body, 'id');
        const room = body.room === '' || body.room === null ? null : Number(body.room);
        if (room !== null && (!Number.isInteger(room) || room < 1)) {
          return response('Invalid room', 400);
        }
        const academicYear = requiredString(body, 'academicYear');
        const phone = optionalPhone(body);
        const formData = studentIntakeFormData(body.intakeFormData);
        const previousDocumentPath = typeof formData.medicalCertificatePath === 'string'
          ? formData.medicalCertificatePath
          : null;
        const { data: current, error: currentError } = await supabase
          .from('itpc_takecare_students')
          .select('first_name_th, last_name_th, academic_year, profile_image_path')
          .eq('id', id)
          .is('deactivated_at', null)
          .maybeSingle();
        throwIfError(currentError);
        if (!current) return response('ไม่พบข้อมูลนักเรียนที่เปิดใช้งาน', 404);
        const uploadedPath = await uploadProfilePhoto(supabase, 'student-photos', id, body.photoDataUrl);
        const documentPath = await uploadStudentDocument(supabase, id, body.medicalCertificateDataUrl);
        if (documentPath) {
          formData.medicalCertificatePath = documentPath;
          if (typeof body.medicalCertificateName === 'string' && body.medicalCertificateName.trim()) {
            formData.medicalCertificateName = body.medicalCertificateName.trim();
          }
        }
        const { error } = await supabase.rpc('admin_update_student_with_intake_form', {
          p_id: id,
          p_student_id: optionalString(body, 'studentId'),
          p_first_name_th: optionalString(body, 'firstNameTh'),
          p_last_name_th: optionalString(body, 'lastNameTh'),
          p_nickname_th: optionalString(body, 'nicknameTh'),
          p_grade: optionalString(body, 'grade'),
          p_room: room,
          p_gender: optionalString(body, 'gender'),
          p_academic_year: academicYear,
          p_profile_image_path: uploadedPath ?? current.profile_image_path,
          p_form_data: formData,
          p_phone: phone,
        });
        if (error && documentPath) {
          const { error: removeError } = await supabase.storage.from('student-documents').remove([documentPath]);
          if (removeError) throw new Error(`${error.message}; ลบใบรับรองแพทย์ที่อัปโหลดไม่สำเร็จ: ${removeError.message}`);
        }
        if (error?.message.toLowerCase().includes('admin_update_student_with_intake_form')) {
          throw new Error('ระบบบันทึกข้อมูลนักเรียนและเอกสารยังไม่พร้อม กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql บน Supabase');
        }
        throwIfError(error);
        if (documentPath && previousDocumentPath && documentPath !== previousDocumentPath) {
          const { error: removeError } = await supabase.storage
            .from('student-documents')
            .remove([previousDocumentPath]);
          if (removeError) throw new Error(`บันทึกข้อมูลนักเรียนแล้ว แต่ลบใบรับรองฉบับเก่าไม่สำเร็จ: ${removeError.message}`);
        }
        const studentName = [
          optionalString(body, 'firstNameTh') ?? current.first_name_th,
          optionalString(body, 'lastNameTh') ?? current.last_name_th,
        ].filter(Boolean).join(' ') || id;
        await recordUsageLog(supabase, caretaker, 'update_student', `${studentName} (${academicYear})`);
        return response(null);
      }
      case 'deactivateStudent': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const id = requiredString(body, 'id');
        const { data: target, error: targetError } = await supabase
          .from('itpc_takecare_students')
          .select('first_name_th, last_name_th, academic_year')
          .eq('id', id)
          .maybeSingle();
        throwIfError(targetError);
        const { error } = await supabase.rpc('admin_deactivate_student', {
          p_id: id,
        });
        throwIfError(error);
        const studentName = [target?.first_name_th, target?.last_name_th].filter(Boolean).join(' ') || id;
        await recordUsageLog(
          supabase,
          caretaker,
          'deactivate_student',
          `${studentName}${target?.academic_year ? ` (${target.academic_year})` : ''}`,
        );
        return response(null);
      }
      case 'archiveAllStudents': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase.rpc('admin_archive_all_students');
        if (error?.message.toLowerCase().includes('admin_archive_all_students')) {
          throw new Error('ระบบเก็บข้อมูลนักเรียนเข้าคลังยังไม่พร้อม กรุณารัน migration 20261116000000_student_intake_form.sql บน Supabase');
        }
        throwIfError(error);
        if (typeof data !== 'number') throw new Error('ผลการเก็บข้อมูลนักเรียนเข้าคลังไม่ถูกต้อง');
        await recordUsageLog(supabase, caretaker, 'archive_all_students', `${data} student records archived`);
        return response({ archived: data });
      }
      case 'getStudentIntakeForm': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase.rpc('admin_get_student_intake_form', {
          p_student_id: requiredString(body, 'id'),
        });
        if (error?.message.toLowerCase().includes('admin_get_student_intake_form')) {
          throw new Error('ระบบอ่านแบบฟอร์มนักเรียนยังไม่พร้อม กรุณารัน migration 20261116000000_student_intake_form.sql บน Supabase');
        }
        throwIfError(error);
        const formData = data && typeof data === 'object' && !Array.isArray(data)
          ? { ...(data as Record<string, unknown>) }
          : {};
        const documentPath = typeof formData.medicalCertificatePath === 'string'
          ? formData.medicalCertificatePath
          : null;
        if (documentPath) {
          const { data: signedDocument, error: signedDocumentError } = await supabase.storage
            .from('student-documents')
            .createSignedUrl(documentPath, 3600);
          if (signedDocumentError?.message.toLowerCase().includes('bucket not found')) {
            throw new Error('ยังไม่มีพื้นที่เก็บใบรับรองแพทย์ กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql แล้วลองใหม่');
          }
          throwIfError(signedDocumentError);
          if (!signedDocument?.signedUrl) throw new Error('สร้างลิงก์ใบรับรองแพทย์ไม่สำเร็จ');
          formData.medicalCertificateUrl = signedDocument.signedUrl;
        }
        return response(formData);
      }
      case 'getStudent': {
        const { data, error } = await supabase
          .from('itpc_takecare_students')
          .select('*')
          .eq('id', requiredString(body, 'id'))
          .is('deactivated_at', null)
          .maybeSingle();
        throwIfError(error);
        if (!data) return response(data);
        if (!isAdmin(caretaker)) {
          data.phone = null;
          delete data.student_record_data;
        }
        if (!data.profile_image_path) return response(data);
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
            supabase.from('itpc_takecare_cases').select('*').order('scheduled_at', { ascending: false }),
            supabase.from('itpc_takecare_case_students').select('case_id, student_id'),
            supabase.from('itpc_takecare_case_caretakers').select('case_id, caretaker_id'),
            supabase.from('itpc_takecare_students').select('*').is('deactivated_at', null),
            supabase.from('itpc_takecare_caretakers')
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

        const caseRows = (caseResult.data ?? []) as itpc_takecare_cases[];
        const caseCaretakerRows = (caretakerLinks.data ?? []) as itpc_takecare_case_caretakers[];
        const assignedCaseIds = new Set(
          caseCaretakerRows
            .filter((row) => row.caretaker_id === caretaker.id)
            .map((row) => row.case_id),
        );
        const visibleCaseRows = isAdmin(caretaker)
          ? caseRows
          : caseRows.filter((caseItem) => assignedCaseIds.has(caseItem.id));

        const studentsById = new Map<string, itpc_takecare_students>(
          (studentResult.data ?? []).map((student) => [student.id, student as itpc_takecare_students]),
        );
        const caretakersById = new Map<string, itpc_takecare_caretakers>(
          (caretakerResult.data ?? []).map((item) => [item.id, item as itpc_takecare_caretakers]),
        );
        const studentsByCase = new Map<string, itpc_takecare_students[]>();
        const caretakersByCase = new Map<string, itpc_takecare_caretakers[]>();
        for (const row of (studentLinks.data ?? []) as itpc_takecare_case_students[]) {
          const student = studentsById.get(row.student_id);
          if (student) studentsByCase.set(row.case_id, [...(studentsByCase.get(row.case_id) ?? []), student]);
        }
        for (const row of caseCaretakerRows) {
          const assigned = caretakersById.get(row.caretaker_id);
          if (assigned) {
            caretakersByCase.set(row.case_id, [...(caretakersByCase.get(row.case_id) ?? []), assigned]);
          }
        }
        return response(visibleCaseRows.map((caseItem) => ({
          ...caseItem,
          created_by: caretakersById.has(caseItem.created_by) ? caseItem.created_by : '',
          created_by_name: caretakersById.get(caseItem.created_by)?.name ?? null,
          students: (studentsByCase.get(caseItem.id) ?? []).map((student) => {
            if (isAdmin(caretaker)) return student;
            const visibleStudent = { ...student };
            delete visibleStudent.student_record_data;
            visibleStudent.phone = null;
            return visibleStudent;
          }),
          caretakers: caretakersByCase.get(caseItem.id) ?? [],
        })));
      }
      case 'caseDetails': {
        const caseId = requiredString(body, 'caseId');
        const [updateResult, signatureResult, caretakerResult, serviceFormResult, studentDefaultsResult] = await Promise.all([
          supabase.from('itpc_takecare_case_updates').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
          supabase.from('itpc_takecare_case_signatures').select('*').eq('case_id', caseId).order('signed_at', { ascending: false }),
          supabase.from('itpc_takecare_caretakers')
            .select('id, name, role, created_at, deactivated_at')
            .is('deactivated_at', null),
          supabase.from('itpc_takecare_case_service_forms')
            .select('case_id, service_type, form_data, recorded_by, updated_at')
            .eq('case_id', caseId)
            .maybeSingle(),
          supabase.rpc('case_student_service_defaults', { p_case_id: caseId }),
        ]);
        if (serviceFormResult.error?.message.toLowerCase().includes('itpc_takecare_case_service_forms')) {
          throw new Error('แบบฟอร์มบริการยังไม่พร้อม กรุณารัน migration 20261116000002_case_appointment_and_service_forms.sql บน Supabase');
        }
        if (studentDefaultsResult.error?.message.toLowerCase().includes('case_student_service_defaults')) {
          throw new Error('ข้อมูลเริ่มต้นแบบฟอร์มยังไม่พร้อม กรุณารัน migration 20261124000002_case_delete_and_student_defaults.sql บน Supabase');
        }
        throwIfError(serviceFormResult.error ?? updateResult.error ?? signatureResult.error ?? caretakerResult.error ?? studentDefaultsResult.error);
        const studentDefaults = Array.isArray(studentDefaultsResult.data)
          ? studentDefaultsResult.data.map((value) => {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
            const record = value as Record<string, unknown>;
            const birthDate = typeof record.dateOfBirth === 'string' ? record.dateOfBirth : '';
            const savedAge = typeof record.studentAge === 'string' ? record.studentAge : '';
            const calculatedAge = birthDate ? calculateStudentAge(birthDate) : null;
            return {
              studentAge: savedAge || (calculatedAge === null ? '' : String(calculatedAge)),
              homeroomTeacher: typeof record.homeroomTeacher === 'string' ? record.homeroomTeacher : '',
            };
          })
          : [];
        return response({
          updates: updateResult.data ?? [],
          signatures: signatureResult.data ?? [],
          caretakers: caretakerResult.data ?? [],
          serviceForm: serviceFormResult.data ?? null,
          studentDefaults,
        });
      }
      case 'createCase': {
        const caseType = requiredString(body, 'caseType');
        if (!['low_confidence', 'feel_not_smart', 'other'].includes(caseType)) {
          return response('Invalid caseType', 400);
        }
        const serviceType = requiredString(body, 'serviceType');
        if (!isCaseServiceType(serviceType)) return response('Invalid serviceType', 400);
        const { data, error } = await supabase.rpc('create_case_with_service', {
          p_case_type: caseType,
          p_other_text: optionalString(body, 'otherText'),
          p_details: optionalString(body, 'details'),
          p_scheduled_at: requiredString(body, 'scheduledAt'),
          p_created_by: caretaker.id,
          p_student_ids: stringArray(body, 'studentIds'),
          p_caretaker_ids: stringArray(body, 'caretakerIds'),
          p_service_type: serviceType,
          p_location: optionalString(body, 'location'),
        });
        if (error?.message.toLowerCase().includes('create_case_with_service')) {
          throw new Error('ระบบบันทึกนัดหมายยังไม่พร้อม กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql บน Supabase');
        }
        throwIfError(error);
        const caseTypeLabel = caseType === 'low_confidence'
          ? 'ความมั่นใจต่ำ'
          : caseType === 'feel_not_smart' ? 'รู้สึกไม่เก่ง' : 'เคสอื่น';
        await recordUsageLog(
          supabase,
          caretaker,
          'create_case',
          `${caseTypeLabel} · นัด ${requiredString(body, 'scheduledAt')} · case ${data}`,
        );
        return response(data);
      }
      case 'updateCase': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const caseId = requiredString(body, 'caseId');
        const caseType = requiredString(body, 'caseType');
        if (!['low_confidence', 'feel_not_smart', 'other'].includes(caseType)) {
          return response('Invalid caseType', 400);
        }
        const serviceType = requiredString(body, 'serviceType');
        if (!isCaseServiceType(serviceType)) return response('Invalid serviceType', 400);
        const { error } = await supabase.rpc('admin_update_case_with_service', {
          p_case_id: caseId,
          p_case_type: caseType,
          p_other_text: optionalString(body, 'otherText'),
          p_details: optionalString(body, 'details'),
          p_scheduled_at: requiredString(body, 'scheduledAt'),
          p_student_ids: stringArray(body, 'studentIds'),
          p_caretaker_ids: stringArray(body, 'caretakerIds'),
          p_service_type: serviceType,
          p_location: optionalString(body, 'location'),
        });
        if (error?.message.toLowerCase().includes('admin_update_case_with_service')) {
          throw new Error('ระบบแก้ไขนัดหมายยังไม่พร้อม กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql บน Supabase');
        }
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'update_case', `case ${caseId}`);
        return response(null);
      }
      case 'deleteCase': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const caseId = requiredString(body, 'caseId');
        const { error } = await supabase.rpc('admin_delete_case', { p_case_id: caseId });
        if (error?.message.toLowerCase().includes('admin_delete_case')) {
          throw new Error('ระบบลบเคสยังไม่พร้อม กรุณารัน migration 20261124000002_case_delete_and_student_defaults.sql บน Supabase');
        }
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'delete_case', `case ${caseId}`);
        return response(null);
      }
      case 'insertCaseUpdate': {
        const caseId = requiredString(body, 'caseId');
        const { error } = await supabase.from('itpc_takecare_case_updates').insert({
          case_id: caseId,
          caretaker_id: caretaker.id,
          activity_note: requiredString(body, 'activityNote'),
          result_note: optionalString(body, 'resultNote'),
          next_step: optionalString(body, 'nextStep'),
        });
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'add_case_update', `case ${caseId}`);
        return response(null);
      }
      case 'updateCaseStatus': {
        const status = body.status === 'done' ? 'done' : 'planned';
        const caseId = requiredString(body, 'caseId');
        const { data, error } = await supabase.from('itpc_takecare_cases').update({
          status,
          updated_at: new Date().toISOString(),
        }).eq('id', caseId).select('id').maybeSingle();
        throwIfError(error);
        if (!data) return response('ไม่พบเคสหรือไม่มีสิทธิ์เปลี่ยนสถานะ', 404);
        await recordUsageLog(supabase, caretaker, 'update_case_status', `case ${caseId}: ${status}`);
        return response(null);
      }
      case 'updateAppointmentOutcome': {
        const caseId = requiredString(body, 'caseId');
        const appointmentStatus = requiredString(body, 'appointmentStatus');
        if (!['scheduled', 'attended', 'no_show', 'rescheduled'].includes(appointmentStatus)) {
          return response('Invalid appointmentStatus', 400);
        }
        const update: Record<string, string> = {
          appointment_status: appointmentStatus,
          updated_at: new Date().toISOString(),
        };
        if (appointmentStatus === 'rescheduled') {
          const scheduledAt = requiredString(body, 'scheduledAt');
          const parsedScheduledAt = new Date(scheduledAt);
          if (Number.isNaN(parsedScheduledAt.getTime())) return response('Invalid scheduledAt', 400);
          update.scheduled_at = parsedScheduledAt.toISOString();
        }
        const { data, error } = await supabase.from('itpc_takecare_cases')
          .update(update)
          .eq('id', caseId)
          .select('id')
          .maybeSingle();
        if (error?.message.toLowerCase().includes('appointment_status')) {
          throw new Error('สถานะนัดหมายยังไม่พร้อม กรุณารัน migration 20261116000002_case_appointment_and_service_forms.sql บน Supabase');
        }
        throwIfError(error);
        if (!data) return response('ไม่พบเคสหรือไม่มีสิทธิ์เปลี่ยนสถานะนัดหมาย', 404);
        await recordUsageLog(supabase, caretaker, 'update_appointment_outcome', `case ${caseId}: ${appointmentStatus}`);
        return response(null);
      }
      case 'saveCaseServiceForm': {
        const caseId = requiredString(body, 'caseId');
        const formData = caseServiceFormData(body.formData);
        const { error } = await supabase.rpc('save_case_service_form', {
          p_case_id: caseId,
          p_form_data: formData,
        });
        if (error?.message.includes('Service form can only be saved after attendance')) {
          throw new Error('กรุณารัน migration 20261123000000_case_location_student_phone_documents.sql เพื่อบันทึกแบบฟอร์มก่อนหรือหลังวันนัด');
        }
        if (error?.message.toLowerCase().includes('save_case_service_form')) {
          throw new Error('ระบบบันทึกแบบฟอร์มบริการยังไม่พร้อม กรุณารัน migration 20261116000002_case_appointment_and_service_forms.sql บน Supabase');
        }
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'save_case_service_form', `case ${caseId}`);
        return response(null);
      }
      case 'saveCaseServiceFormWithOutcome': {
        const caseId = requiredString(body, 'caseId');
        const formData = caseServiceFormData(body.formData);
        const outcome = requiredString(body, 'outcome');
        if (!['draft', 'completed', 'next_appointment'].includes(outcome)) {
          return response('Invalid service form outcome', 400);
        }
        let nextAppointmentAt: string | null = null;
        if (outcome === 'next_appointment') {
          const value = requiredString(body, 'nextAppointmentAt');
          const parsed = new Date(value);
          if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
            return response('วันและเวลานัดครั้งต่อไปต้องเป็นเวลาในอนาคต', 400);
          }
          nextAppointmentAt = parsed.toISOString();
        } else if (body.nextAppointmentAt !== undefined && body.nextAppointmentAt !== null) {
          return response('nextAppointmentAt is only valid for a next appointment', 400);
        }
        const { error } = await supabase.rpc('save_case_service_form_with_outcome', {
          p_case_id: caseId,
          p_form_data: formData,
          p_outcome: outcome,
          p_next_appointment_at: nextAppointmentAt,
        });
        if (error?.message.toLowerCase().includes('save_case_service_form_with_outcome')) {
          throw new Error('ระบบบันทึกผลแบบฟอร์มยังไม่พร้อม กรุณารัน migration 20261124000000_case_service_form_outcome.sql บน Supabase');
        }
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'save_case_service_form', `case ${caseId}: ${outcome}`);
        return response(null);
      }
      case 'listCaseUpdates': {
        const { data, error } = await supabase
          .from('itpc_takecare_case_updates')
          .select('*')
          .eq('case_id', requiredString(body, 'caseId'))
          .order('created_at', { ascending: false });
        throwIfError(error);
        return response(data ?? []);
      }
      case 'saveSignature': {
        const { data, error } = await supabase.from('itpc_takecare_case_signatures').insert({
          case_id: requiredString(body, 'caseId'),
          signer_name: requiredString(body, 'signerName'),
          signer_role: requiredString(body, 'signerRole'),
          signature_data: requiredString(body, 'signatureData'),
        }).select('*').single();
        throwIfError(error);
        await recordUsageLog(supabase, caretaker, 'save_signature', `case ${data.case_id}`);
        return response(data);
      }
      case 'deleteSignature': {
        const signatureId = requiredString(body, 'signatureId');
        const { data: signature, error: signatureError } = await supabase
          .from('itpc_takecare_case_signatures')
          .select('id, case_id')
          .eq('id', signatureId)
          .maybeSingle();
        throwIfError(signatureError);
        if (!signature) return response('ไม่พบลายเซ็น', 404);

        if (!isAdmin(caretaker)) {
          const { data: assignment, error: assignmentError } = await supabase
            .from('itpc_takecare_case_caretakers')
            .select('case_id')
            .eq('case_id', signature.case_id)
            .eq('caretaker_id', caretaker.id)
            .maybeSingle();
          throwIfError(assignmentError);
          if (!assignment) return response('ไม่มีสิทธิ์ลบลายเซ็นของเคสนี้', 403);
        }

        const { data, error } = await supabase
          .from('itpc_takecare_case_signatures')
          .delete()
          .eq('id', signatureId)
          .select('id')
          .maybeSingle();
        throwIfError(error);
        if (!data) return response('ไม่มีสิทธิ์ลบลายเซ็นของเคสนี้', 403);
        await recordUsageLog(supabase, caretaker, 'delete_signature', `case ${signature.case_id}`);
        return response(null);
      }
      default:
        return response('Unknown API action', 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase request failed';
    return response(message, 500);
  }
}
