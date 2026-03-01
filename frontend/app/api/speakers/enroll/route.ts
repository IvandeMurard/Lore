import { NextResponse } from "next/server";
import {
    DEFAULT_TEACHER_KEY,
    normalizeDisplayName,
    normalizeTeacherKey,
    upsertTeacherProfile,
} from "@/lib/speaker-profile-store";
import {
    EnrollmentError,
    validateTeacherEnrollmentSample,
} from "@/lib/speechmatics-speakers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const audio = formData.get("audio");
        const teacherKeyRaw = String(formData.get("teacher_key") ?? DEFAULT_TEACHER_KEY);
        const displayNameRaw = String(formData.get("display_name") ?? "");

        if (!(audio instanceof File)) {
            return NextResponse.json(
                {
                    error: "Missing audio file in form-data field `audio`.",
                    code: "ENROLL_UNKNOWN",
                    retryable: false,
                },
                { status: 400 }
            );
        }

        const { sampleMeta } = await validateTeacherEnrollmentSample(audio);
        const profile = await upsertTeacherProfile({
            teacher_key: normalizeTeacherKey(teacherKeyRaw),
            display_name: normalizeDisplayName(displayNameRaw),
            identifiers: [],
            language: "en",
            sample_meta: sampleMeta,
        });

        return NextResponse.json({
            enrolled: true,
            teacher_key: profile.teacher_key,
            identifier_count: 0,
            updated_at: profile.updated_at,
        });
    } catch (error) {
        if (error instanceof EnrollmentError) {
            const status = error.code === "ENROLL_AUDIO_TOO_SHORT" || error.code === "ENROLL_NO_SPEAKER_FOUND"
                ? 400
                : 500;
            return NextResponse.json(
                {
                    error: error.message,
                    code: error.code,
                    retryable: error.retryable,
                },
                { status }
            );
        }

        const message = error instanceof Error ? error.message : "Enrollment failed.";
        return NextResponse.json(
            {
                error: message,
                code: "ENROLL_UNKNOWN",
                retryable: false,
            },
            { status: 500 }
        );
    }
}
