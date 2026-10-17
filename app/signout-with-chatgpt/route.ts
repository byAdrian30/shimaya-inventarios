import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete("auth_user");
  cookieStore.delete("__sites_local_auth");
  redirect("/");
}
