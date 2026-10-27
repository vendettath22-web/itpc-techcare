import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Case, Caretaker, Student } from '@/types/database';

type ApiBody = Record<string, unknown> & { action?: unknown };
type CaseStudentRow = { case_id: string; student_id: string };
type CaseCaretakerRow = { case_id: string; caretaker_id: string };
type SessionClaims = { sub: string; exp: number };
type SessionCaretaker = Pick<Caretaker, 'id' | 'name' | 'role'>;

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

async function getActiveCaretaker(
  token: string,
  key: string,
  id: string,
): Promise<{ client: SupabaseClient; caretaker: SessionCaretaker | null }> {
  const client = supabaseClient(key, token);
  const { data, error } = await client
    .from('caretakers')
    .select('id, name, role')
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

    if (action === 'verifyCaretakerPin') {
      const supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.rpc('verify_caretaker_pin', {
        p_pin: requiredString(body, 'pin'),
      });
      throwIfError(error);
      const matches = Array.isArray(data) ? data : data ? [data] : [];
      if (matches.length !== 1) return response('PIN ไม่ถูกต้องหรือบัญชีถูกปิดใช้งาน', 401);
      const caretaker = matches[0] as SessionCaretaker;
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

    if (action === 'getSession') return response(caretaker);

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
          .select('id, name, role, created_at, deactivated_at')
          .order('name');
        throwIfError(error);
        return response(data ?? []);
      }
      case 'updateCaretakerProfile': {
        const { data, error } = await supabase
          .from('caretakers')
          .update({ name: requiredString(body, 'name') })
          .eq('id', caretaker.id)
          .select('id, name, role')
          .single();
        throwIfError(error);
        return response(data);
      }
      case 'createCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase.rpc('admin_create_caretaker', {
          p_name: requiredString(body, 'name'),
          p_pin: requiredString(body, 'pin'),
          p_role: body.role === 'admin' ? 'admin' : 'caretaker',
        });
        throwIfError(error);
        return response(data);
      }
      case 'updateCaretaker': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const { data, error } = await supabase.rpc('admin_update_caretaker', {
          p_id: requiredString(body, 'id'),
          p_name: requiredString(body, 'name'),
          p_role: body.role === 'admin' ? 'admin' : 'caretaker',
          p_pin: optionalString(body, 'pin'),
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
        return response(data ?? []);
      }
      case 'createStudent': {
        if (!isAdmin(caretaker)) return response('ต้องใช้สิทธิ์ admin', 403);
        const room = body.room === '' || body.room === null ? null : Number(body.room);
        if (room !== null && (!Number.isInteger(room) || room < 1)) {
          return response('Invalid room', 400);
        }
        const { data, error } = await supabase.rpc('admin_create_student', {
          p_student_id: optionalString(body, 'studentId'),
          p_first_name_th: optionalString(body, 'firstNameTh'),
          p_last_name_th: optionalString(body, 'lastNameTh'),
          p_nickname_th: optionalString(body, 'nicknameTh'),
          p_grade: optionalString(body, 'grade'),
          p_room: room,
          p_gender: optionalString(body, 'gender'),
          p_academic_year: requiredString(body, 'academicYear'),
        });
        throwIfError(error);
        return response(data);
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
        return response(data);
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
