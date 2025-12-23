const admin = require("firebase-admin");

admin.initializeApp({
  projectId: "aisrs-japanese-dev",
});

const db = admin.firestore();

async function verify() {
  const KU_ID = "交ぜる-vocab";
  
  console.log(`Verifying KU: ${KU_ID}...`);
  
  const lessonDoc = await db.collection("lessons").doc(KU_ID).get();
  if (!lessonDoc.exists) {
    console.error("❌ Lesson Document not found!");
  } else {
    const data = lessonDoc.data();
    console.log("✅ Lesson Found:");
    console.log(`   - Vocab: ${data.vocab}`);
    console.log(`   - Definitions: ${JSON.stringify(data.definitions)}`);
    console.log(`   - Meaning Explanation Length: ${data.meaning_explanation ? data.meaning_explanation.length : 0}`);
    console.log(`   - Reading Explanation Length: ${data.reading_explanation ? data.reading_explanation.length : 0}`);
    
    if (data.meaning_explanation) console.log(`   -> Meaning Sample: ${data.meaning_explanation.substring(0, 50)}...`);
    if (data.reading_explanation) console.log(`   -> Reading Sample: ${data.reading_explanation.substring(0, 50)}...`);
  }
}

verify().catch(console.error);
