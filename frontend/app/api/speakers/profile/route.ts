import { NextResponse } from "next/server";
import {
    DEFAULT_TEACHER_KEY,
    deleteTeacherProfile,
    getTeacherProfile,
    normalizeTeacherKey,
} from "@/lib/speaker-profile-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTeacherKeyFromRequest(request: Request): string {
    const { searchParams } = new URL(request.url);
    return normalizeTeacherKey(searchParams.get("teacher_key") ?? DEFAULT_TEACHER_KEY);
}

export async function GET(request: Request) {
    try {
        const teacherKey = getTeacherKeyFromRequest(request);
        const profile = await getTeacherProfile(teacherKey);
        if (!profile) {
            return NextResponse.json({
                configured: false,
                teacher_key: teacherKey,
                display_name: null,
                identifier_count: 0,
                updated_at: null,
            });
        }

        return NextResponse.json({
            configured: true,
            teacher_key: profile.teacher_key,
            display_name: profile.display_name,
            identifier_count: profile.identifiers.length,
            updated_at: profile.updated_at,
            identifiers: profile.identifiers,
            language: profile.language,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load speaker profile.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const teacherKey = getTeacherKeyFromRequest(request);
        const deleted = await deleteTeacherProfile(teacherKey);
        return NextResponse.json({
            deleted,
            teacher_key: teacherKey,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete speaker profile.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
