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
      <header className="mb-10 border-b border-gray-700 pb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Content Library</h1>
        <p className="text-xl text-gray-400">
          Static content browser (File System Source)
        </p>
      </header>

      {types.length === 0 ? (
        <div className="text-center p-10 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-gray-300 text-xl font-semibold mb-2">Library is Empty</p>
          <p className="text-gray-400">
            No .md files found in <code className="bg-gray-900 px-2 py-1 rounded text-sm">/content/topics</code>
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {types.map((type) => (
            <section key={type}>
              <h2 className="text-2xl font-bold text-blue-400 mb-6 flex items-center">
                <span className="uppercase tracking-wider">{type}</span>
                <span className="ml-3 text-xs bg-gray-800 text-gray-400 px-2.5 py-1 rounded-full border border-gray-700">
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
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:bg-gray-750 transition-all hover:border-blue-500 h-full flex flex-col shadow-lg hover:shadow-xl">
                      
                      {/* Header: Content + Badge */}
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-3xl font-bold text-white group-hover:text-blue-300 transition-colors">
                          {topic.content}
                        </span>
                        {topic.partOfSpeech && (
                          <span className="text-[10px] uppercase tracking-wide font-mono bg-gray-900 text-gray-400 px-2 py-1 rounded border border-gray-700">
                            {topic.partOfSpeech}
                          </span>
                        )}
                      </div>
                      
                      {/* Body: Reading + Definition */}
                      <div className="flex-grow space-y-2">
                        {topic.reading && (
                          <p className="text-blue-200 font-mono text-sm">
                            {topic.reading}
                          </p>
                        )}
                        {topic.definition && (
                          <p className="text-gray-300 text-sm line-clamp-3 leading-relaxed">
                            {topic.definition}
                          </p>
                        )}
                      </div>

                      {/* Footer: ID + Lesson Count */}
                      <div className="mt-6 pt-4 border-t border-gray-700 flex justify-between items-center text-xs text-gray-500 font-mono">
                        <span className="truncate max-w-[150px] opacity-60 group-hover:opacity-100 transition-opacity">
                          {topic.id}
                        </span>
                        {(topic.availableLessons && topic.availableLessons.length > 0) && (
                          <span className="flex items-center text-green-400 bg-green-900/20 px-2 py-0.5 rounded border border-green-900/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
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