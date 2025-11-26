import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { QUESTIONS_COLLECTION } from "@/lib/firebase-config";
import { logger } from "@/lib/logger";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let questionId: string;

  try {
    const { id } = await params;
    questionId = id;
    if (!questionId) throw new Error("Question ID not found in URL");
  } catch (urlError) {
    logger.error("PATCH /api/questions/[id] - Error parsing URL", urlError);
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }

  logger.info(`PATCH /api/questions/${questionId} - Updating status`);

  try {
    const body = await request.json();
    const { status } = body;

    if (
      !status ||
      (status !== "active" && status !== "flagged" && status !== "inactive")
    ) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'active', 'flagged', or 'inactive'" },
        { status: 400 },
      );
    }

    const questionRef = db.collection(QUESTIONS_COLLECTION).doc(questionId);
    const doc = await questionRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 },
      );
    }

    await questionRef.update({ status });

    logger.info(`Updated question ${questionId} status to ${status}`);

    return NextResponse.json({ success: true, status });
  } catch (error) {
    logger.error(`PATCH /api/questions/${questionId} - Error`, error);
    return NextResponse.json(
      { error: "Failed to update question status" },
      { status: 500 },
    );
  }
}
