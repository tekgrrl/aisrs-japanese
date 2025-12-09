import Link from 'next/link';
import { contentService } from '@/lib/content-service';

export default async function LibraryIndexPage() {
  // Fetch all topics from the file system
  // Since this is a Server Component, this runs directly on the server (Node.js)
  const topics = await contentService.getAllTopics();

  // Group topics by type for better display
  const topicsByType: Record<string, typeof topics> = {};
  
  topics.forEach(topic => {
    const type = topic.type || 'Uncategorized';
    if (!topicsByType[type]) {
      topicsByType[type] = [];
    }
    topicsByType[type].push(topic);
  });
  const types = Object.keys(topicsByType).sort();

  return (
    <main className="container mx-auto max-w-6xl p-8">
      <header className="mb-10 border-b border-shodo-ink/10 pb-6">
        <h1 className="text-4xl font-bold text-shodo-stamp-red mb-2">Content Library</h1>
        <p className="text-xl text-shodo-ink-light">
          Static content browser (File System Source)
        </p>
      </header>

      {types.length === 0 ? (
        <div className="text-center p-10 bg-shodo-paper-dark rounded-lg border border-shodo-ink/5">
          <p className="text-shodo-ink text-xl font-semibold mb-2">Library is Empty</p>
          <p className="text-shodo-ink-light">
            No .md files found in <code className="bg-shodo-ink/5 px-2 py-1 rounded text-sm">/content/topics</code>
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {types.map((type) => (
            <section key={type}>
              <h2 className="text-2xl font-bold text-shodo-indigo mb-6 flex items-center">
                <span className="uppercase tracking-wider">{type}</span>
                <span className="ml-3 text-xs bg-shodo-paper-dark text-shodo-ink-light px-2.5 py-1 rounded-full border border-shodo-ink/10">
                  {topicsByType[type].length}
                </span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {topicsByType[type].map((topic) => (
                  <Link 
                    href={`/library/${topic.id}`} 
                    key={topic.id}
                    className="block group h-full"
                  >
                    <div className="bg-shodo-paper border border-shodo-ink/10 rounded-lg p-6 hover:bg-shodo-paper-warm transition-all hover:border-shodo-indigo/50 h-full flex flex-col shadow-sm hover:shadow-md">
                      
                      {/* Header: Content + Badge */}
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-3xl font-bold text-shodo-ink group-hover:text-shodo-stamp-red transition-colors">
                          {topic.content}
                        </span>
                        {topic.partOfSpeech && (
                          <span className="text-[10px] uppercase tracking-wide font-mono bg-shodo-paper-dark text-shodo-ink-light px-2 py-1 rounded border border-shodo-ink/5">
                            {topic.partOfSpeech}
                          </span>
                        )}
                      </div>
                      
                      {/* Body: Reading + Definition */}
                      <div className="flex-grow space-y-2">
                        {topic.reading && (
                          <p className="text-shodo-indigo font-mono text-sm">
                            {topic.reading}
                          </p>
                        )}
                        {topic.definition && (
                          <p className="text-shodo-ink-light text-sm line-clamp-3 leading-relaxed">
                            {topic.definition}
                          </p>
                        )}
                      </div>

                      {/* Footer: ID + Lesson Count */}
                      <div className="mt-6 pt-4 border-t border-shodo-ink/5 flex justify-between items-center text-xs text-shodo-ink-faint font-mono">
                        <span className="truncate max-w-[150px] opacity-60 group-hover:opacity-100 transition-opacity">
                          {topic.id}
                        </span>
                        {(topic.availableLessons && topic.availableLessons.length > 0) && (
                          <span className="flex items-center text-shodo-matcha bg-shodo-matcha/10 px-2 py-0.5 rounded border border-shodo-matcha/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-shodo-matcha mr-1.5"></span>
                            {topic.availableLessons.length} Lesson{topic.availableLessons.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}