import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contentService } from '@/lib/content-service';

export default async function LibraryLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  console.log(`decodedId = ${decodedId}`);

  const lesson = await contentService.getLesson(decodedId);

  if (!lesson) {
    notFound();
  }

  // Fetch parent topic for context/breadcrumbs
  const topic = await contentService.getTopic(lesson.topicId);

  return (
    <main className="container mx-auto max-w-4xl p-8">
      {/* --- Header / Breadcrumbs --- */}
      <header className="mb-8 border-b border-gray-700 pb-6">
        <div className="flex flex-col gap-2">
          <Link 
            href={topic ? `/library/${topic.id}` : '/library'}
            className="text-sm text-blue-400 hover:text-blue-300 hover:underline mb-2 block"
          >
            &larr; Back to {topic ? topic.content : 'Library'}
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-green-900 text-green-200 px-2 py-1 rounded uppercase">
              Lesson
            </span>
            <span className="text-xs font-mono text-gray-500">
              {lesson.id}
            </span>
          </div>
          
          <h1 className="text-4xl font-bold text-white mt-2">
            {lesson.title || `Lesson for ${topic?.content || '...'}`}
          </h1>
        </div>
      </header>

      {/* --- Lesson Body --- */}
      <article className="prose prose-invert max-w-none">
        {/* NOTE: For now, we simply render the raw markdown with whitespace preserved.
          Later, we can integrate 'react-markdown' or a custom parser 
          to handle the ![[embed]] syntax and formatting.
        */}
        <div className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-gray-300">
          {lesson.body}
        </div>
      </article>
    </main>
  );
}