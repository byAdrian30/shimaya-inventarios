import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

import { AUTH_USERS, DEFAULT_AUTH_USER } from "../lib/auth-users.ts";
import { cookies } from "next/headers";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  let userId = requestHeaders.get(USER_ID_HEADER);
  let email = requestHeaders.get(USER_EMAIL_HEADER);
  let fullName: string | null = null;

  if (userId && email) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    fullName =
      encodedFullName &&
      requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
        ? safeDecodeURIComponent(encodedFullName)
        : null;
    return {
      userId,
      displayName: fullName ?? email,
      email,
      fullName,
    };
  }

  // Fallback for Vercel / standalone deployments without OpenAI header injection
  try {
    const cookieStore = await cookies();
    const cookieUser = cookieStore.get("__sites_local_auth")?.value || cookieStore.get("auth_user")?.value;
    const resolvedUser = (cookieUser && AUTH_USERS[cookieUser.toLowerCase()]) || DEFAULT_AUTH_USER;
    return {
      userId: resolvedUser.userId,
      displayName: resolvedUser.fullName,
      email: resolvedUser.email,
      fullName: resolvedUser.fullName,
    };
  } catch (_) {
    return {
      userId: DEFAULT_AUTH_USER.userId,
      displayName: DEFAULT_AUTH_USER.fullName,
      email: DEFAULT_AUTH_USER.email,
      fullName: DEFAULT_AUTH_USER.fullName,
    };
  }
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
