import Quiz from './Quiz';
export default async function Page({ params }: { params: Promise<{ mid: string }> }) { const { mid } = await params; return <Quiz missionId={mid} />; }
