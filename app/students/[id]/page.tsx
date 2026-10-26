import { Suspense } from 'react';
import StudentHistory from './StudentHistory';

async function StudentHistoryFromParams({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StudentHistory id={id} />;
}

export default function StudentHistoryPage(props: PageProps<'/students/[id]'>) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-gray-500">กำลังโหลดประวัตินักเรียน...</div>}>
      <StudentHistoryFromParams params={props.params} />
    </Suspense>
  );
}
