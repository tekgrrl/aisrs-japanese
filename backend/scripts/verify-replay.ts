
const API_URL = 'http://localhost:3500';

async function run() {
    console.log('--- Starting Verification Script (API Only) ---');

    // 1. Create a Scenario
    console.log('1. Creating Scenario...');
    const genRes = await fetch(`${API_URL}/scenarios/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: 'N5', theme: 'Test Replay API' })
    });

    if (!genRes.ok) {
        console.error('Failed to generate scenario:', await genRes.text());
        return;
    }

    const genData: any = await genRes.json();
    const scenarioId = genData.id;
    console.log(`   Created Scenario ID: ${scenarioId}`);

    // 2. Advance to Simulate
    console.log('2. Advancing to Simulate...');
    await fetch(`${API_URL}/scenarios/${scenarioId}/advance`, { method: 'POST' }); // Encounter -> Drill
    await fetch(`${API_URL}/scenarios/${scenarioId}/advance`, { method: 'POST' }); // Drill -> Simulate

    console.log('   In Simulate state.');

    // 3. Chat and Complete
    console.log('3. Chatting and Completing...');
    await fetch(`${API_URL}/scenarios/${scenarioId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: 'こんにちは' })
    });

    // Advance to Completed (Triggering Evaluation)
    await fetch(`${API_URL}/scenarios/${scenarioId}/advance`, { method: 'POST' });
    console.log('   Scenario Completed.');

    // 4. Reset with Archive = TRUE
    console.log('4. Resetting with Archive=TRUE...');
    const resetRes1 = await fetch(`${API_URL}/scenarios/${scenarioId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: true })
    });

    if (!resetRes1.ok) {
        console.error('Failed to reset:', await resetRes1.text());
        return;
    }

    // Verify
    const doc1Res = await fetch(`${API_URL}/scenarios/${scenarioId}`);
    const doc1: any = await doc1Res.json();

    if (doc1.state === 'simulate' && doc1.pastAttempts && doc1.pastAttempts.length === 1) {
        console.log('   SUCCESS: State is simulate, pastAttempts has 1 entry.');
    } else {
        console.error('   FAILURE:', doc1);
        return;
    }

    // 5. Chat again and Reset with Archive = FALSE
    console.log('5. Chatting again and Resetting with Archive=FALSE...');

    await fetch(`${API_URL}/scenarios/${scenarioId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage: 'Restarting...' })
    });

    // We don't need to complete it to test "no archive" behavior on restart?
    // Actually, "Restart" is usually done mid-session (simulate state).
    // But "Replay" is done after completion.
    // The requirement says: 
    // - "Replay" (Completed) -> Archive=True
    // - "Restart" (Simulate) -> Archive=False

    // So let's test Restart from Simulate
    const resetRes2 = await fetch(`${API_URL}/scenarios/${scenarioId}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: false })
    });

    if (!resetRes2.ok) {
        console.error('Failed to reset (2):', await resetRes2.text());
        return;
    }

    // Verify
    const doc2Res = await fetch(`${API_URL}/scenarios/${scenarioId}`);
    const doc2: any = await doc2Res.json();

    if (doc2.state === 'simulate' && doc2.pastAttempts && doc2.pastAttempts.length === 1) {
        console.log('   SUCCESS: State is simulate, pastAttempts count unchanged (1).');
    } else {
        console.error('   FAILURE: Archive=false should not add to history.', doc2);
        return;
    }

    console.log('--- Verification Complete ---');
}

run().catch(console.error);
