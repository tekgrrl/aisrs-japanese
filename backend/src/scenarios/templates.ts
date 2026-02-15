export interface ScenarioTemplate {
    id: string; // e.g. 'core-ordering-coffee'
    title: string;
    description: string;
    baseTheme: string; // The string sent to the Architect
    defaultLevel: string; // 'N5'
    tags: string[]; // ['Travel', 'Food']
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
    {
        id: 'core-ordering-coffee',
        title: 'Ordering Coffee',
        description: 'Practice ordering a drink and a snack at a busy cafe.',
        baseTheme: 'Ordering coffee and a snack at a trendy cafe in Tokyo',
        defaultLevel: 'N5',
        tags: ['Travel', 'Food']
    },
    {
        id: 'core-convenience-store',
        title: 'Convenience Store Run',
        description: 'Navigate the interaction at a Japanese Konbini.',
        baseTheme: 'Buying lunch and paying bills at a convenience store (Konbini)',
        defaultLevel: 'N5',
        tags: ['Travel', 'Shopping']
    },
    {
        id: 'core-train-directions',
        title: 'Asking for Directions',
        description: 'Ask station staff for help navigating the train system.',
        baseTheme: 'Asking a station attendant for help with transfer to Shinjuku',
        defaultLevel: 'N5',
        tags: ['Travel', 'Transport']
    },
    {
        id: 'core-restaurant-reservation',
        title: 'Restaurant Reservation',
        description: 'Call a restaurant to make a dinner reservation.',
        baseTheme: 'Calling a restaurant to book a table for 2 people for Friday night',
        defaultLevel: 'N4',
        tags: ['Travel', 'Food']
    },
    {
        id: 'core-hotel-checkin',
        title: 'Hotel Check-in',
        description: 'Check in to your hotel and ask about amenities.',
        baseTheme: 'Checking in at a hotel front desk and asking about breakfast time',
        defaultLevel: 'N4',
        tags: ['Travel', 'Accommodation']
    },
    {
        id: 'core-doctor-visit',
        title: 'Visiting a Friendly Doctor',
        description: 'Explain your symptoms to a doctor at a clinic.',
        baseTheme: 'Explaining cold symptoms (headache, fever) to a doctor at a clinic',
        defaultLevel: 'N3',
        tags: ['Health', 'Emergency']
    }
];
