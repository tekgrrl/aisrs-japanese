import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { LESSONS_COLLECTION } from "@/lib/firebase-config";
import { Lesson } from "@/types";
import { CURRENT_USER_ID } from "@/lib/constants";
import { FieldPath } from "firebase-admin/firestore";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  logger.info("PUT /api/lesson/[id] - Updating lesson");

  let lessonId: string;
  try {
    const { id } = await params;
    if (!id) throw new Error("Missing lessonId");
    lessonId = id;
  } catch (e) {
    logger.error(`PUT /api/lesson/[id] - ${(e as Error).message}`);
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { section, content } = body;

    if (!section || content === undefined) {
      // Check for undefined content too
      return new Response(
        JSON.stringify({ error: "Missing section or content" }),
        { status: 400 },
      );
    }

    // I need to pull the entire record and then stuff the new meaning_explanation into it
    const snapshot = await db
      .collection(LESSONS_COLLECTION)
      .where(FieldPath.documentId(), "==", lessonId)
      .where("userId", "==", CURRENT_USER_ID)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const lessonRef = snapshot.docs[0].ref;

    await lessonRef.update({
      [section]: content,
    });

    return new NextResponse(
      JSON.stringify({ success: true, updated: lessonId }),
      { status: 200 },
    );
  } catch (e) {
    // TODO
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }
}
