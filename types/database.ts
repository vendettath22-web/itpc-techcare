export interface Caretaker {
  id: string;
  name: string;
  role: 'admin' | 'caretaker';
  phone?: string | null;
  age?: number | null;
  profile_photo_url?: string | null;
  profile_photo_error?: string | null;
  profile_image_path?: string | null;
  deactivated_at: string | null;
  created_at: string;
}

export interface Student {
  id: string;
  student_id: string | null;
  first_name_th: string | null;
  last_name_th: string | null;
  nickname_th: string | null;
  grade: string | null;
  room: number | null;
  gender: string | null;
  academic_year: string;
  profile_image_path?: string | null;
  profile_photo_url?: string | null;
  deactivated_at: string | null;
  case_count?: number;
}

export interface Case {
  id: string;
  case_type: 'low_confidence' | 'feel_not_smart' | 'other';
  other_text: string | null;
  details: string | null;
  scheduled_at: string;
  status: 'planned' | 'done';
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  students?: Student[];
  caretakers?: Caretaker[];
}

export interface CaseUpdate {
  id: string;
  case_id: string;
  caretaker_id: string;
  activity_note: string;
  result_note: string | null;
  next_step: string | null;
  created_at: string;
  caretaker_name?: string;
}

export interface CaseSignature {
  id: string;
  case_id: string;
  signer_name: string;
  signer_role: string;
  signature_data: string;
  signed_at: string;
}