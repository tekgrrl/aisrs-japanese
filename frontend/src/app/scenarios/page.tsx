'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Scenario, ScenarioDifficulty } from '@/types/scenario';

// TODO Configuration for API URL - adjust if using env vars
const API_BASE_URL = 'http://localhost:3000/api';

export default function ScenariosDashboard() {
    const router = useRouter();
    const [scenarios, setScenarios] = useState<Scenario[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // Generation Form State
    const [theme, setTheme] = useState('');
    const [difficulty, setDifficulty] = useState<ScenarioDifficulty>('N5');

    useEffect(() => {
        fetchScenarios();
    }, []);

    const fetchScenarios = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/scenarios`);
            if (res.ok) {
                const data = await res.json();
                setScenarios(data);
            }
        } catch (error) {
            console.error('Failed to fetch scenarios', error);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsGenerating(true);

        try {
            const res = await fetch(`${API_BASE_URL}/scenarios/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    difficulty,
                    theme: theme || undefined, // Send undefined if empty to let AI decide
                }),
            });

            if (!res.ok) throw new Error('Generation failed');

            const data = await res.json();
            // Redirect to the new scenario
            router.push(`/scenarios/${data.id}`);
        } catch (error) {
            console.error('Error generating scenario:', error);
            alert('Failed to generate scenario. Check console.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">Scenarios</h1>
                    <p className="text-slate-500">Synthesized Immersion Learning</p>
                </div>
            </header>

            {/* Generator Card */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-xl font-semibold mb-4 text-slate-700">Architect New Scenario</h2>
                <form onSubmit={handleGenerate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">
                                Theme / Setting
                            </label>
                            <input
                                type="text"
                                value={theme}
                                onChange={(e) => setTheme(e.target.value)}
                                placeholder="e.g. Asking for a table at a busy Izakaya"
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">
                                Difficulty
                            </label>
                            <select
                                value={difficulty}
                                onChange={(e) => setDifficulty(e.target.value as ScenarioDifficulty)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                            >
                                <option value="N5">N5 (Beginner)</option>
                                <option value="N4">N4 (Basic)</option>
                                <option value="N3">N3 (Intermediate)</option>
                                <option value="N2">N2 (Business)</option>
                                <option value="N1">N1 (Fluent)</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={isGenerating}
                            className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${isGenerating
                                ? 'bg-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                        >
                            {isGenerating ? 'Architecting...' : 'Generate Scenario'}
                        </button>
                    </div>
                </form>
            </section>

            {/* List Section */}
            <section>
                <h2 className="text-xl font-semibold mb-4 text-slate-700">Recent Scenarios</h2>
                {loading ? (
                    <div className="text-center py-10 text-slate-400">Loading archives...</div>
                ) : scenarios.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <p className="text-slate-500">No scenarios found. Create your first one above!</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {scenarios.map((scenario) => (
                            <Link
                                href={`/scenarios/${scenario.id}`}
                                key={scenario.id}
                                className="block group"
                            >
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group-hover:border-indigo-300">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-800 group-hover:text-indigo-600">
                                                {scenario.title}
                                            </h3>
                                            <p className="text-sm text-slate-500 mt-1">{scenario.description}</p>

                                            <div className="flex gap-2 mt-3">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {scenario.difficultyLevel}
                                                </span>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${scenario.state === 'completed'
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {scenario.state.charAt(0).toUpperCase() + scenario.state.slice(1)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="text-right text-xs text-slate-400">
                                            {/* Simple date display - assumes simple string or serializable object */}
                                            Created
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}