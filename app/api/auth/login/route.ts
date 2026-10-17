import { NextResponse } from "next/server";
import { AUTH_USERS, ADMIN_PASSWORD } from "@/lib/auth-users";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as any;
    const userKey = (body.userKey || body.username || "").trim().toLowerCase();
    const password = body.password || "";

    const user = AUTH_USERS[userKey];
    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado en la lista del equipo." },
        { status: 400 }
      );
    }

    if (userKey === "admin") {
      if (password !== ADMIN_PASSWORD) {
        return NextResponse.json(
          { error: "Contraseña incorrecta. Por favor ingresa la contraseña válida de Administrador." },
          { status: 401 }
        );
      }
    }

    const response = NextResponse.json({
      success: true,
      user: {
        key: userKey,
        name: user.fullName,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set("auth_user", userKey, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
      httpOnly: false,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error al procesar el inicio de sesión." },
      { status: 500 }
    );
  }
}
