'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Scenario, ChatMessage, ScenarioAttempt } from '@/types/scenario';

// Configuration for API URL - adjust if using env vars
const API_BASE_URL = 'http://localhost:3000/api';

export default function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params using React.use() - Next.js 15+ pattern
    const { id } = use(params);

    const [scenario, setScenario] = useState<Scenario | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Chat State - initialize from scenario if available
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [userMessage, setUserMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    // UI State
    const [showTranslations, setShowTranslations] = useState(false);

    useEffect(() => {
        fetchScenario();
    }, [id]);

    const fetchScenario = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/scenarios/${id}`);
            if (!res.ok) throw new Error('Failed to load scenario');
            const data = await res.json();
            setScenario(data);

            // Sync chat history from backend if available
            if (data.chatHistory) {
                setChatHistory(data.chatHistory);
            } else {
                setChatHistory([]);
            }

        } catch (err) {
            setError('Could not load scenario');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const [advancing, setAdvancing] = useState(false);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userMessage.trim() || isSending) return;

        setIsSending(true);
        const currentMessage = userMessage;
        setUserMessage('');

        // Optimistic UI update
        const optimisticMsg: ChatMessage = {
            speaker: 'user',
            text: currentMessage,
            timestamp: Date.now()
        };
        const newHistory = [...chatHistory, optimisticMsg];
        setChatHistory(newHistory);

        try {
            const res = await fetch(`${API_BASE_URL}/scenarios/${id}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userMessage: currentMessage }),
            });

            if (!res.ok) throw new Error('Failed to send message');
            if (!res.ok) throw new Error('Failed to send message');
            const fullHistory = await res.json();

            // Backend returns the full updated history
            setChatHistory(fullHistory);

        } catch (err) {
            console.error(err);
            // Revert or show error (for now just alert)
            alert("Failed to send message. Please try again.");
        } finally {
            setIsSending(false);
        }
    };

    // History View State
    const [viewingHistory, setViewingHistory] = useState<ScenarioAttempt | null>(null);

    const handleAdvance = async () => {
        if (!scenario) return;


        // If already in drill mode, allow advancing to Simulate
        if (scenario.state === 'drill') {
            // Proceed to advance to 'simulate'
        } else if (scenario.state === 'simulate') {
            // Proceed to advance to 'completed'
        } else if (scenario.state === 'completed') {
            return;
        }

        setAdvancing(true);
        try {
            const res = await fetch(`${API_BASE_URL}/scenarios/${id}/advance`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('Failed to advance scenario');

            // Refresh scenario data to reflect new state
            await fetchScenario();
            if (scenario.state === 'encounter') {
                alert("Vocabulary added to your queue!");
            } else if (scenario.state === 'drill') {
                // Moved to simulate
            } else if (scenario.state === 'simulate') {
                // alert("Session Completed!");
            }
        } catch (err) {
            console.error(err);
            alert("Failed to start drilling. Please try again.");
        } finally {
            setAdvancing(false);
        }
    };

    const handleReset = async (archive: boolean) => {
        if (!confirm(archive ? "Replay this scenario? Use this to try a different approach." : "Restart session? This will clear your chat history.")) return;
        try {
            await fetch(`${API_BASE_URL}/scenarios/${id}/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archive })
            });
            // Reload page to reset state completely
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("Failed to reset session.");
        }
    };

    const searchParams = useSearchParams();
    const router = useRouter(); // We need router for back()
    const fromLibrary = searchParams.get('from') === 'library';

    const handleBackToLibrary = () => {
        router.back();
    };

    if (loading) return <div className="p-10 text-center text-slate-500">Loading Scene...</div>;
    if (error || !scenario) return <div className="p-10 text-center text-red-500">{error}</div>;

    // If viewing history, show a simplified report card for that attempt
    if (viewingHistory) {
        return (
            <div className="max-w-4xl mx-auto p-6 space-y-8 pb-24">
                <button onClick={() => setViewingHistory(null)} className="text-slate-500 hover:text-slate-800 mb-4">
                    ← Back to Current Session
                </button>

                <section className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-100 p-6 border-b border-slate-200">
                        <h2 className="text-xl font-bold text-slate-800">Past Attempt</h2>
                        <div className="text-sm text-slate-500">
                            {new Date(viewingHistory.completedAt.seconds * 1000).toLocaleDateString()}
                        </div>
                        <div className="flex gap-1 text-amber-500 mt-2">
                            {[...Array(5)].map((_, i) => (
                                <span key={i} className={i < viewingHistory.evaluation.rating ? "opacity-100" : "opacity-30"}>★</span>
                            ))}
                        </div>
                    </div>
                    <div className="p-8 space-y-6">
                        <div>
                            <h3 className="font-bold text-slate-900 mb-2">Feedback</h3>
                            <p className="text-slate-600 bg-slate-50 p-4 rounded-lg">{viewingHistory.evaluation.feedback}</p>
                        </div>
                        {/* Chat History for this attempt */}
                        <div>
                            <h3 className="font-bold text-slate-900 mb-4">Transcript</h3>
                            <div className="space-y-4 max-h-96 overflow-y-auto p-4 bg-slate-50 rounded-lg border border-slate-200">
                                {viewingHistory.chatHistory.map((msg, idx) => (
                                    <div key={idx} className={`flex flex-col ${msg.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className={`max-w-[80%] rounded-lg p-3 text-sm ${msg.speaker === 'user'
                                            ? 'bg-indigo-100 text-indigo-900'
                                            : 'bg-white border border-slate-200 text-slate-800'
                                            }`}>
                                            <div className="font-bold text-xs opacity-70 mb-1">{msg.speaker}</div>
                                            {msg.text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8 pb-24">
            {fromLibrary && (
                <button
                    onClick={handleBackToLibrary}
                    className="mb-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
                >
                    ← Back to Library
                </button>
            )}

            {/* Header Info */}
            <header className="border-b border-slate-200 pb-6">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-xs font-bold rounded">
                                {scenario.difficultyLevel}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded uppercase">
                                {scenario.state} Phase
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900">{scenario.title}</h1>
                        <p className="text-slate-600 mt-2 text-lg">{scenario.description}</p>
                    </div>
                    {/* Session Controls */}
                    {scenario.state === 'simulate' && (
                        <button
                            onClick={() => handleReset(false)}
                            className="text-sm text-slate-500 hover:text-red-600 underline"
                        >
                            Restart Session
                        </button>
                    )}
                </div>

                {/* Setting / Context Box */}
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 border border-slate-200">
                    <p><strong>📍 Location:</strong> {scenario.setting.location}</p>
                    <p><strong>👥 Goal:</strong> {scenario.setting.goal}</p>
                    <p className="mt-2 text-slate-500 italic text-xs border-l-2 border-slate-300 pl-2">
                        Visual Context: {scenario.setting.visualPrompt}
                    </p>
                </div>
            </header>

            {/* Conditional Render: Report Card */}
            {scenario.state === 'completed' && scenario.evaluation ? (
                <section className="space-y-8">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-green-600 text-white p-6 text-center">
                            <div className="text-4xl mb-2">🎉</div>
                            <h2 className="text-3xl font-bold mb-2">Mission Debrief</h2>
                            <div className="flex justify-center gap-1 text-amber-300 text-2xl">
                                {[...Array(5)].map((_, i) => (
                                    <span key={i} className={i < scenario.evaluation!.rating ? "opacity-100" : "opacity-30"}>★</span>
                                ))}
                            </div>
                        </div>

                        <div className="p-8 space-y-8">
                            {/* General Feedback */}
                            <div>
                                <h3 className="font-bold text-slate-900 mb-2">Sensei's Feedback</h3>
                                <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
                                    {scenario.evaluation.feedback}
                                </p>
                            </div>

                            {/* Corrections */}
                            {scenario.evaluation.corrections.length > 0 && (
                                <div>
                                    <h3 className="font-bold text-slate-900 mb-4">Corrections & Improvements</h3>
                                    <div className="space-y-4">
                                        {scenario.evaluation.corrections
                                            .filter(c => c.original && c.correction)
                                            .map((c, idx) => (
                                                <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                                                    <div className="flex flex-col md:flex-row gap-4 mb-2">
                                                        <div className="flex-1">
                                                            <div className="text-xs text-red-500 font-bold uppercase mb-1">You Said</div>
                                                            <div className="text-slate-800 line-through decoration-red-300" title={c.original}>
                                                                {c.original.length > 200 ? c.original.substring(0, 200) + '...' : c.original}
                                                            </div>
                                                        </div>
                                                        <div className="hidden md:block text-slate-300 text-2xl">→</div>
                                                        <div className="flex-1">
                                                            <div className="text-xs text-green-600 font-bold uppercase mb-1">Better</div>
                                                            <div className="text-green-800 font-medium">{c.correction}</div>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-slate-500 border-t border-slate-200 pt-2 mt-2">
                                                        💡 {c.explanation}
                                                    </p>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-6 border-t border-slate-100 flex justify-between items-center">
                                {scenario.evaluation.outcome === 'failed' ? (
                                    <>
                                        <button
                                            onClick={() => handleReset(true)}
                                            className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                                        >
                                            ↺ Retake Lesson
                                        </button>
                                        <button
                                            onClick={() => window.location.reload()} // Just reload to see script again (Read-Only Encounter effectively)
                                            className="px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors"
                                        >
                                            Review Materials
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => handleReset(true)}
                                            className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                                        >
                                            ↺ Practice Roleplay
                                        </button>
                                        <button
                                            onClick={() => window.location.href = '/scenarios'}
                                            className="px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-300 transition-colors"
                                        >
                                            Return to Dashboard
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Past Attempts Section */}
                    {scenario.pastAttempts && scenario.pastAttempts.length > 0 && (
                        <div className="mt-8 border-t border-slate-200 pt-8">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">History</h3>
                            <div className="grid gap-4 md:grid-cols-2">
                                {scenario.pastAttempts.map((attempt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setViewingHistory(attempt)}
                                        className="text-left p-4 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-bold text-slate-700">Attempt #{scenario.pastAttempts!.length - i}</span>
                                            <span className="text-xs text-slate-500">
                                                {new Date(attempt.completedAt.seconds * 1000).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="flex gap-1 text-amber-400 text-sm">
                                            {[...Array(5)].map((_, starI) => (
                                                <span key={starI} className={starI < attempt.evaluation.rating ? "opacity-100" : "opacity-30"}>★</span>
                                            ))}
                                        </div>
                                        <div className="text-xs text-indigo-600 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            View Details →
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            ) : scenario.state === 'simulate' ? (
                <section className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[600px]">
                    <div className="bg-indigo-600 text-white p-4 font-bold flex justify-between items-center">
                        <span>Roleplay Session</span>
                        <span className="text-xs bg-indigo-500 px-2 py-1 rounded">Live AI</span>
                    </div>

                    {/* Chat History */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {chatHistory.length === 0 && (
                            <div className="text-center text-slate-400 mt-10 italic">
                                Start the conversation...
                            </div>
                        )}
                        {chatHistory.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[80%] rounded-2xl p-4 ${msg.speaker === 'user'
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                                    }`}>
                                    <div className="text-xs opacity-70 mb-1">{msg.speaker}</div>
                                    <div className="text-lg">{msg.text}</div>
                                </div>
                                {/* Correction Display */}
                                {msg.correction && (
                                    <div className="mt-2 text-sm bg-orange-50 text-orange-800 p-2 rounded border border-orange-100 max-w-[80%] animate-in fade-in slide-in-from-top-1">
                                        <strong>Wait:</strong> {msg.correction}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Goal Achieved Banner */}
                    {chatHistory.length > 0 && chatHistory[chatHistory.length - 1].sceneFinished && (
                        <div className="bg-green-100 border-t border-green-200 p-3 text-center animate-in slide-in-from-bottom-2">
                            <div className="text-green-800 font-bold flex items-center justify-center gap-2">
                                <span>🎉</span>
                                <span>Goal Achieved! You can finish the session now.</span>
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-slate-200">
                        <form onSubmit={handleSendMessage} className="flex gap-2">
                            <input
                                type="text"
                                value={userMessage}
                                onChange={(e) => setUserMessage(e.target.value)}
                                placeholder="Type your response in Japanese..."
                                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                disabled={isSending}
                            />
                            <button
                                type="submit"
                                disabled={isSending || !userMessage.trim()}
                                className={`px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors ${(isSending || !userMessage.trim()) ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                            >
                                {isSending ? '...' : 'Send'}
                            </button>
                        </form>
                    </div>
                </section>
            ) : (
                <>
                    {/* Main Stage: The Dialogue */}
                    <section className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-800">Script</h2>
                            <button
                                onClick={() => setShowTranslations(!showTranslations)}
                                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                            >
                                {showTranslations ? 'Hide Translations' : 'Show Translations'}
                            </button>
                        </div>

                        <div className="space-y-4">
                            {scenario.dialogue.map((line, idx) => (
                                <div key={idx} className={`flex gap-4 p-4 rounded-xl ${line.speaker === 'User' || line.speaker === 'Traveler'
                                    ? 'bg-indigo-50 border border-indigo-100 ml-12'
                                    : 'bg-white border border-slate-200 mr-12'
                                    }`}>
                                    <div className="flex-shrink-0 w-16 text-xs font-bold text-slate-400 uppercase tracking-wide pt-1">
                                        {line.speaker}
                                    </div>
                                    <div>
                                        <p className="text-lg font-medium text-slate-900 leading-relaxed">
                                            {line.text}
                                        </p>
                                        {showTranslations && (
                                            <p className="text-slate-500 mt-1 text-sm border-t border-slate-100 pt-1">
                                                {line.translation}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Grammar Notes (Genki Style) */}
                    {scenario.grammarNotes && scenario.grammarNotes.length > 0 && (
                        <section className="mt-12 pt-8 border-t border-slate-200">
                            <h2 className="text-xl font-bold text-slate-800 mb-6">Grammar Notes</h2>
                            <div className="grid gap-6">
                                {scenario.grammarNotes.map((note, idx) => (
                                    <div key={idx} className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg">
                                        <h3 className="font-bold text-amber-900 mb-2">{note.title}</h3>
                                        <p className="text-amber-800 mb-3 text-sm leading-relaxed">{note.explanation}</p>
                                        <div className="bg-white/60 p-2 rounded text-amber-900 text-sm font-mono">
                                            {note.exampleInContext}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            {/* Key Vocabulary Widget - Only show if NOT completed (or maybe show in report card? No, let's hide it in report card for now to reduce noise) */}
            {scenario.state !== 'completed' && (
                <section className="mt-12 pt-8 border-t border-slate-200">
                    <h2 className="text-xl font-bold text-slate-800 mb-6">Key Vocabulary</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {scenario.extractedKUs.map((ku, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                                {/* Status Indicator */}
                                {ku.kuId && (
                                    <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-xs px-2 py-1 rounded-bl-lg font-bold">
                                        Tracked
                                    </div>
                                )}

                                <div className="text-center">
                                    <div className="text-sm text-slate-500 mb-1">{ku.reading}</div>
                                    <div className="text-2xl font-bold text-slate-800 mb-2">{ku.content}</div>
                                    <div className="text-sm text-slate-600 font-medium">{ku.meaning}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Action Footer */}
            {/* Only show if NOT completed, because Report Card has its own button */}
            {scenario.state !== 'completed' && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg">
                    <div className="max-w-4xl mx-auto flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                            {scenario.extractedKUs.length} items extracted
                        </div>
                        <button
                            onClick={handleAdvance}
                            disabled={advancing}
                            className={`px-8 py-3 rounded-lg font-bold transition-colors shadow-sm ${scenario.state === 'encounter'
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : scenario.state === 'drill'
                                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                    : scenario.state === 'simulate'
                                        ? 'bg-slate-800 hover:bg-slate-900 text-white'
                                        : 'bg-green-600 hover:bg-green-700 text-white'
                                } ${advancing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {advancing ? 'Processing...' :
                                scenario.state === 'encounter' ? 'Start Drilling →' :
                                    scenario.state === 'drill' ? 'Start Roleplay →' :
                                        scenario.state === 'simulate' ? 'Finish & Evaluate' : 'Completed'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}