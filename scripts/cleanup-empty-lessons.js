const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = "gen-lang-client-0878434798";
const DATABASE_ID = "aisrs-japanese-dev";

async function cleanupEmptyLessons() {
    console.log(`Initializing Admin SDK for project: ${PROJECT_ID}...`);

    // Initialize without credentials (assumes Emulator or ADC)
    if (admin.apps.length === 0) {
        admin.initializeApp({
            projectId: PROJECT_ID,
        });
    }

    const db = getFirestore(admin.app(), DATABASE_ID);
    const lessonsRef = db.collection("lessons");

    console.log(
        `Scanning '${DATABASE_ID}/lessons' for documents missing 'vocab' field...`
    );

    try {
        const snapshot = await lessonsRef.get();
        if (snapshot.empty) {
            console.log("No lessons found in collection.");
            return;
        }

        console.log(`Total lessons found: ${snapshot.size}`);

        const bulkWriter = db.bulkWriter();
        let deleteCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Criteria: Missing 'vocab' field
            if (!data.vocab) {
                console.log(
                    `[DELETE] ID: ${doc.id} | Status: ${data.status} | Fields: ${Object.keys(
                        data
                    ).join(", ")}`
                );
                void bulkWriter.delete(doc.ref);
                deleteCount++;
            }
        }

        if (deleteCount === 0) {
            console.log("No incomplete lessons found. Nothing to delete.");
            await bulkWriter.close(); // Close unused writer
            return;
        }

        console.log(
            `\nFound ${deleteCount} incomplete lessons. Committing deletions...`
        );
        await bulkWriter.close();
        console.log("Cleanup complete.");
    } catch (error) {
        console.error("Error during cleanup:", error);
        process.exit(1);
    }
}

cleanupEmptyLessons().catch((e) => {
    console.error("Top-level error:", e);
    process.exit(1);
});
