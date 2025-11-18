import { NextResponse } from "next/server";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initAdmin } from "@/lib/firebase-admin";
import { KnowledgeUnit, KnowledgeUnitClient } from "@/types";

export async function GET() {
  try {
    await initAdmin();
    const firestore = getFirestore();
    const snapshot = await firestore.collection("knowledge-units").get();
    const kus = snapshot.docs.map((doc) => {
      const data = doc.data() as Omit<KnowledgeUnit, "id">;
      return {
        ...data,
        id: doc.id,
        createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
      };
    }) as KnowledgeUnitClient[];
    return NextResponse.json(kus);
  } catch (error) {
    console.error("Error fetching knowledge units:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge units" },
      { status: 500 },
    );
  }
}
