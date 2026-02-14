"use client";

import { useState, useEffect } from "react";
import { ApiLog } from "@/types";

export default function LogsPage() {
    const [logs, setLogs] = useState<ApiLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [limit, setLimit] = useState(50);
    const [route, setRoute] = useState("");
    const [status, setStatus] = useState<"" | "success" | "error">("");

    // Expanded row state
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append("limit", limit.toString());
            if (route) params.append("route", route);
            if (status) params.append("status", status);

            const res = await fetch(`/api/apilogs?${params.toString()}`);
            if (!res.ok) throw new Error("Failed to fetch logs");

            const data = await res.json();
            setLogs(data);
        } catch (error) {
            console.error("Error fetching logs:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const handleRefresh = () => {
        fetchLogs();
    };

    const toggleExpand = (id: string) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-6">System Log Viewer</h1>

            {/* Filters */}
            <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                    <input
                        type="text"
                        className="border border-gray-300 rounded-md p-2 w-64 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="/api/..."
                        value={route}
                        onChange={(e) => setRoute(e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                        className="border border-gray-300 rounded-md p-2 w-40 focus:ring-blue-500 focus:border-blue-500"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as "" | "success" | "error")}
                    >
                        <option value="">All</option>
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Limit</label>
                    <select
                        className="border border-gray-300 rounded-md p-2 w-24 focus:ring-blue-500 focus:border-blue-500"
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>
                <button
                    onClick={handleRefresh}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ml-auto"
                >
                    Refresh
                </button>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latency</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">Loading logs...</td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">No logs found.</td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <>
                                    <tr
                                        key={log.id}
                                        className={`hover:bg-gray-50 cursor-pointer ${expandedLogId === log.id ? 'bg-blue-50' : ''}`}
                                        onClick={() => toggleExpand(log.id!)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {log.route}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.status === 'success' ? 'bg-green-100 text-green-800' :
                                                    log.status === 'error' ? 'bg-red-100 text-red-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {log.durationMs ? `${log.durationMs}ms` : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {log.modelUsed || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <span className="text-blue-600 hover:text-blue-900">
                                                {expandedLogId === log.id ? 'Hide Details' : 'View Details'}
                                            </span>
                                        </td>
                                    </tr>

                                    {/* Expanded Details Panel */}
                                    {expandedLogId === log.id && (
                                        <tr className="bg-gray-50">
                                            <td colSpan={6} className="px-6 py-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="border rounded-md bg-white p-3">
                                                        <h3 className="font-semibold text-gray-700 mb-2 border-b pb-1">Request Data</h3>
                                                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono overflow-auto max-h-96">
                                                            {JSON.stringify(log.requestData, null, 2)}
                                                        </pre>
                                                    </div>
                                                    <div className="border rounded-md bg-white p-3">
                                                        <h3 className="font-semibold text-gray-700 mb-2 border-b pb-1">Response / Error Data</h3>
                                                        {log.errorData ? (
                                                            <div className="text-red-600">
                                                                <p className="font-bold">Error:</p>
                                                                <pre className="text-xs whitespace-pre-wrap font-mono overflow-auto max-h-96">
                                                                    {JSON.stringify(log.errorData, null, 2)}
                                                                </pre>
                                                            </div>
                                                        ) : (
                                                            <pre className="text-xs text-green-700 whitespace-pre-wrap font-mono overflow-auto max-h-96">
                                                                {JSON.stringify(log.responseData, null, 2)}
                                                            </pre>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
