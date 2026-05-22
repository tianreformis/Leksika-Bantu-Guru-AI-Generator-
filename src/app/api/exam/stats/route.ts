import { NextRequest, NextResponse } from "next/server";
import { prismaClient } from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, isAdmin } = decoded;

    const [myExamsCount, totalExamsCount, questionsCount, studentsCount] = await Promise.all([
      prismaClient.exam.count({ where: { userId } }),
      isAdmin
        ? prismaClient.exam.count()
        : prismaClient.exam.count({ where: { userId } }),
      prismaClient.examQuestion.count({
        where: { exam: isAdmin ? {} : { userId } },
      }),
      prismaClient.examStudent.count({
        where: { exam: isAdmin ? {} : { userId } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        myExamsCount,
        totalExamsCount,
        questionsCount,
        studentsCount,
      },
    });
  } catch (error) {
    console.error("Exam stats error:", error);
    return NextResponse.json({ error: "Failed to fetch exam stats" }, { status: 500 });
  }
}
