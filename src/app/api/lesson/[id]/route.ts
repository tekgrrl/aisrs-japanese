import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { db } from '@/lib/firebase';
import { LESSONS_COLLECTION } from '@/lib/firebase-config';
import { Lesson } from "@/types";



export async function PUT(request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    logger.info('PUT /api/lesson/[id] - Updating lesson');

    let lessonId: string;
    try {
        const { id } = await params;
        if (!id) throw new Error("Missing lessonId");
        lessonId = id;

    } catch(e) {
        logger.error(`PUT /api/lesson/[id] - ${(e as Error).message}`);
        return NextResponse.json(
            { error: 'Invalid request URL' },
            { status: 400 }
        );
    }

    try {
        const body = await request.json(); 
        const {section, content} = body; 

        if (!section || content === undefined) { // Check for undefined content too
             return new Response(JSON.stringify({ error: "Missing section or content" }), { status: 400 });
        }

        // I need to pull the entire record and then stuff the new meaning_explanation into it
        const lessonRef = db.collection(LESSONS_COLLECTION).doc(lessonId);
        const rawDoc = await lessonRef.get();

        await lessonRef.update({
          [section]: content
        });        

        return new NextResponse(JSON.stringify({ success: true, updated: lessonId }), { status: 200 });

    } catch(e) {
        // TODO
        return NextResponse.json(
            { error: 'Invalid request URL' },
            { status: 400 }
        );
    }
}