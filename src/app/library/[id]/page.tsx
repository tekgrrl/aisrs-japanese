import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contentService } from '@/lib/content-service';
import { FuriganaText } from '@/components/FuriganaText';

export default async function LibraryTopicPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const decodedId = decodeURIComponent(id);

  const topic = await contentService.getTopic(decodedId);

  if (!topic) {
    notFound();
  }

  const lessons = await contentService.getLessonsForTopic(decodedId);
  const sentences = await contentService.getSentencesForTopic(decodedId);

  return (
    <main className="container mx-auto max-w-5xl p-8">
      {/* --- Header --- */}
      <header className="mb-8 border-b border-gray-700 pb-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-mono bg-blue-900 text-blue-200 px-2 py-1 rounded uppercase">
                {topic.type}
              </span>
              <span className="text-xs font-mono text-gray-500">
                {topic.id}
              </span>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              {topic.content}
            </h1>
          </div>
          <Link 
            href="/library" 
            className="text-sm text-gray-400 hover:text-white underline"
          >
            Back to Library
          </Link>
        </div>

        {/* Core Definition Block */}
        <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
          {topic.reading && (
            <p className="text-2xl text-blue-300 font-mono mb-1">{topic.reading}</p>
          )}
          {topic.definition && (
            <p className="text-xl text-gray-300">{topic.definition}</p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- Left Column: Metadata --- */}
        <div className="space-y-6">
          <section className="bg-gray-800 p-5 rounded-lg border border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Metadata</h3>
            <dl className="space-y-3 text-sm">
              {topic.partOfSpeech && (
                <div>
                  <dt className="text-gray-500">Part of Speech</dt>
                  <dd className="text-white font-mono">{topic.partOfSpeech}</dd>
                </div>
              )}
              {topic.conjugationType && (
                <div>
                  <dt className="text-gray-500">Conjugation</dt>
                  <dd className="text-white font-mono">{topic.conjugationType}</dd>
                </div>
              )}
              {topic.grammarFunction && (
                <div>
                  <dt className="text-gray-500">Function</dt>
                  <dd className="text-white">{topic.grammarFunction}</dd>
                </div>
              )}
              {topic.relatedUnits && topic.relatedUnits.length > 0 && (
                <div>
                  <dt className="text-gray-500 mb-1">Related Units</dt>
                  <dd>
                    <div className="flex flex-wrap gap-2">
                      {topic.relatedUnits.map(ru => (
                        <Link 
                          key={ru} 
                          href={`/library/${ru}`}
                          className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs text-gray-300"
                        >
                          {ru}
                        </Link>
                      ))}
                    </div>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        {/* --- Right Column: Linked Content --- */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Lessons Section */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <span>Lessons</span>
              <span className="text-sm font-normal text-gray-500 bg-gray-800 px-2 py-1 rounded-full">
                {lessons.length}
              </span>
            </h2>
            
            {lessons.length === 0 ? (
              <p className="text-gray-500 italic">No lessons linked to this topic.</p>
            ) : (
              <div className="grid gap-4">
                {lessons.map(lesson => (
                  <div key={lesson.id} className="bg-gray-800 p-5 rounded-lg border border-gray-700 hover:border-green-500 transition-colors group">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold text-green-400 mb-1">
                          {lesson.title || lesson.id}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">{lesson.id}</p>
                      </div>
                      <Link 
                        href={`/library/lesson/${lesson.id}`}
                        className="px-3 py-1 bg-green-900/30 text-green-400 text-sm rounded hover:bg-green-900/50"
                      >
                        Read Lesson
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Context Examples Section */}
          <section>
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <span>Context Examples</span>
              <span className="text-sm font-normal text-gray-500 bg-gray-800 px-2 py-1 rounded-full">
                {sentences.length}
              </span>
            </h2>

            {sentences.length === 0 ? (
              <p className="text-gray-500 italic">No context examples found.</p>
            ) : (
              <div className="space-y-4">
                {sentences.map(sentence => (
                  <div key={sentence.id} className="bg-gray-800 p-4 rounded-lg border-l-4 border-blue-500">
                    <p className="text-xl text-white mb-1 font-serif">
                      <FuriganaText text={sentence.content} />
                    </p>
                    <p className="text-gray-400 text-sm">
                      {sentence.translation}
                    </p>
                    <div className="mt-2 pt-2 border-t border-gray-700 flex gap-2 text-xs text-gray-600">
                      <span>{sentence.id}</span>
                      {sentence.tags?.map(tag => (
                        <span key={tag} className="text-blue-400">#{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}