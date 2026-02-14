const BACKEND_URL = 'http://localhost:3500';

async function verify() {
    try {
        console.log('1. Generating Scenario...');
        const genRes = await fetch(`${BACKEND_URL}/scenarios/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ difficulty: 'N5', theme: 'Ordering coffee' })
        });

        if (!genRes.ok) {
            const txt = await genRes.text();
            throw new Error(`Generate failed: ${genRes.status} ${txt}`);
        }
        const { id: scenarioId } = await genRes.json();
        console.log('   Scenario ID:', scenarioId);

        console.log('2. Fetching Scenario (Pre-Advance)...');
        let scenarioRes = await fetch(`${BACKEND_URL}/scenarios/${scenarioId}`);
        let scenario = await scenarioRes.json();
        console.log('   State:', scenario.state);
        if (scenario.state !== 'encounter') throw new Error('State should be encounter');

        console.log('3. Advancing State...');
        const advanceRes = await fetch(`${BACKEND_URL}/scenarios/${scenarioId}/advance`, {
            method: 'POST'
        });
        if (!advanceRes.ok) {
            const txt = await advanceRes.text();
            throw new Error(`Advance failed: ${advanceRes.status} ${txt}`);
        }

        console.log('4. Fetching Scenario (Post-Advance)...');
        scenarioRes = await fetch(`${BACKEND_URL}/scenarios/${scenarioId}`);
        scenario = await scenarioRes.json();
        console.log('   State:', scenario.state);
        if (scenario.state !== 'drill') throw new Error('State should be drill');

        console.log('5. Verifying Extracted KUs...');
        const kus = scenario.extractedKUs;
        if (!kus || kus.length === 0) {
            console.warn('   Warning: No KUs extracted?');
        } else {
            for (const ku of kus) {
                if (!ku.kuId) throw new Error(`KU ${ku.content} missing kuId`);
                if (ku.type !== 'vocab') throw new Error(`KU ${ku.content} type is ${ku.type}, expected vocab`);
                console.log(`   OK: ${ku.content} -> ${ku.kuId}`);
            }
        }

        console.log('SUCCESS: Extraction logic verified.');

    } catch (error: any) {
        console.error('FAILED:', error.message);
    }
}

verify();
