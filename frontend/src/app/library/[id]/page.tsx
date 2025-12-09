import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contentService } from '@/lib/content-service';
import { FuriganaText } from '@/components/FuriganaText';

export default async function LibraryTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
      <header className="mb-8 border-b border-shodo-ink/10 pb-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-mono bg-shodo-indigo text-shodo-paper px-2 py-1 rounded uppercase">
                {topic.type}
              </span>
              <span className="text-xs font-mono text-shodo-ink-light">
                {topic.id}
              </span>
            </div>
            <h1 className="text-5xl font-bold text-shodo-ink mb-4">
              {topic.content}
            </h1>
          </div>
          <Link 
            href="/library" 
            className="text-sm text-shodo-ink-light hover:text-shodo-indigo underline"
          >
            Back to Library
          </Link>
        </div>

        {/* Core Definition Block */}
        <div className="bg-shodo-paper-warm p-6 rounded border border-shodo-ink/10 shadow-sm">
          {topic.reading && (
            <p className="text-2xl text-shodo-indigo font-mono mb-2">{topic.reading}</p>
          )}
          {topic.definition && (
            <p className="text-xl text-shodo-ink">{topic.definition}</p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- Left Column: Metadata --- */}
        <div className="space-y-6">
          <section className="bg-shodo-paper border border-shodo-ink/10 p-5 rounded-lg shadow-sm">
            <h3 className="text-sm font-bold text-shodo-ink-light uppercase tracking-wider mb-4">Metadata</h3>
            <dl className="space-y-3 text-sm">
              {topic.partOfSpeech && (
                <div>
                  <dt className="text-shodo-ink-light mb-1">Part of Speech</dt>
                  <dd className="text-shodo-ink font-mono font-medium">{topic.partOfSpeech}</dd>
                </div>
              )}
              {topic.conjugationType && (
                <div>
                  <dt className="text-shodo-ink-light mb-1">Conjugation</dt>
                  <dd className="text-shodo-ink font-mono font-medium">{topic.conjugationType}</dd>
                </div>
              )}
              {topic.grammarFunction && (
                <div>
                  <dt className="text-shodo-ink-light mb-1">Function</dt>
                  <dd className="text-shodo-ink font-medium">{topic.grammarFunction}</dd>
                </div>
              )}
              {topic.relatedUnits && topic.relatedUnits.length > 0 && (
                <div>
                  <dt className="text-shodo-ink-light mb-1">Related Units</dt>
                  <dd>
                    <div className="flex flex-wrap gap-2">
                      {topic.relatedUnits.map(ru => (
                        <Link 
                          key={ru} 
                          href={`/library/${ru}`}
                          className="bg-shodo-paper-dark hover:bg-shodo-ink/5 px-2 py-1 rounded text-xs text-shodo-ink border border-shodo-ink/10 transition-colors"
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
            <h2 className="text-2xl font-bold text-shodo-ink mb-4 flex items-center gap-2">
              <span>Lessons</span>
              <span className="text-sm font-normal text-shodo-ink-light bg-shodo-paper-dark px-2 py-1 rounded-full border border-shodo-ink/5">
                {lessons.length}
              </span>
            </h2>
            
            {lessons.length === 0 ? (
              <p className="text-shodo-ink-faint italic">No lessons linked to this topic.</p>
            ) : (
              <div className="grid gap-4">
                {lessons.map(lesson => (
                  <div key={lesson.id} className="bg-shodo-paper p-5 rounded-lg border border-shodo-ink/10 hover:border-shodo-matcha transition-colors group shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-semibold text-shodo-ink group-hover:text-shodo-matcha transition-colors mb-1">
                          {lesson.title || lesson.id}
                        </h3>
                        <p className="text-xs text-shodo-ink-light font-mono">{lesson.id}</p>
                      </div>
                      <Link 
                        href={`/library/lesson/${lesson.id}`}
                        className="px-3 py-1 bg-shodo-matcha/10 text-shodo-matcha text-sm rounded hover:bg-shodo-matcha/20 border border-shodo-matcha/20 transition-colors"
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
            <h2 className="text-2xl font-bold text-shodo-ink mb-4 flex items-center gap-2">
              <span>Context Examples</span>
              <span className="text-sm font-normal text-shodo-ink-light bg-shodo-paper-dark px-2 py-1 rounded-full border border-shodo-ink/5">
                {sentences.length}
              </span>
            </h2>

            {sentences.length === 0 ? (
              <p className="text-shodo-ink-faint italic">No context examples found.</p>
            ) : (
              <div className="space-y-4">
                {sentences.map(sentence => (
                  <div key={sentence.id} className="bg-shodo-paper p-6 rounded-lg border-l-4 border-shodo-indigo shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-5">
                       {/* Optional watermark or icon could go here */}
                    </div>
                    <p className="text-2xl text-shodo-ink mb-2 font-serif leading-relaxed">
                      <FuriganaText text={sentence.content} />
                    </p>
                    <p className="text-shodo-ink-light text-sm italic border-t border-shodo-ink/5 pt-2 mt-2">
                      {sentence.translation}
                    </p>
                    <div className="mt-2 pt-2 flex gap-2 text-xs text-shodo-ink-faint">
                      <span className="opacity-50">{sentence.id}</span>
                      {sentence.tags?.map(tag => (
                        <span key={tag} className="text-shodo-indigo opacity-75">#{tag}</span>
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